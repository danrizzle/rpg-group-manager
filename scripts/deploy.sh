#!/usr/bin/env bash
#
# Build and ship the web client to the playtest server.
#
#   scripts/deploy.sh                          # deploys to rpg.getoar.de
#   RPG_HOST=rpg.example.com scripts/deploy.sh
#   scripts/deploy.sh --bootstrap              # one-time server setup, then deploy
#
# Env:
#   RPG_HOST   target hostname (default rpg.getoar.de)
#   RPG_SSH    ssh target for root actions (default: getoar)
#   RPG_IP     origin IP; makes the verification curls bypass DNS. Useful when
#              a resolver is still serving a cached negative answer for a
#              freshly created record.
#
# Flags:
#   --force      deploy a dirty working tree
#   --bootstrap  create /srv/rpg/web and install the Caddy vhost (idempotent)
#
# NOTE ON BACKUPS — deliberately absent, unlike the Sealbreaker script.
# This game is 100% client-side: every player's save lives in THEIR browser's
# localStorage under `rpg-world-v1`. There is no player state on the box, so
# there is nothing here to back up and a bad deploy cannot destroy progress.
# The day phase 6 lands accounts, this script needs a backup phase before
# anything else touches the server.
#
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

FORCE=0
BOOTSTRAP=0
HOST="${RPG_HOST:-rpg.getoar.de}"
for arg in "$@"; do
	case "$arg" in
		--force) FORCE=1 ;;
		--bootstrap) BOOTSTRAP=1 ;;
		-*) echo "error: unknown flag $arg" >&2; exit 1 ;;
		*) HOST="$arg" ;;
	esac
done

SSH_TARGET="${RPG_SSH:-getoar}"
WEBROOT="/srv/rpg/web"

# Verification curls hit the real hostname so TLS and vhost routing are actually
# exercised. If DNS has not caught up locally, pin the address instead of
# skipping the checks.
CURL_RESOLVE=()
if [[ -n "${RPG_IP:-}" ]]; then
	CURL_RESOLVE=(--resolve "$HOST:443:$RPG_IP" --resolve "$HOST:80:$RPG_IP")
elif ! getent hosts "$HOST" >/dev/null 2>&1; then
	echo "warning: $HOST does not resolve locally; the post-deploy checks will fail." >&2
	echo "  Create the DNS records (see --bootstrap output), set RPG_IP=<origin ip>," >&2
	echo "  or wait for propagation." >&2
fi

# A deployed build should always map back to a commit. Otherwise "which version
# is live?" has no answer the day a playtester reports something odd.
if [[ -n "$(git -C "$REPO" status --porcelain)" ]]; then
	if [[ "$FORCE" -eq 0 ]]; then
		echo "error: working tree is dirty. Commit first, or pass --force." >&2
		git -C "$REPO" status --short >&2
		exit 1
	fi
	echo "warning: deploying a dirty tree (--force)" >&2
fi
REV="$(git -C "$REPO" rev-parse --short HEAD)"

echo "==> deploying $REV to $HOST"

# --- 1. bootstrap (optional, idempotent) ----------------------------------
if [[ "$BOOTSTRAP" -eq 1 ]]; then
	echo "==> bootstrapping server"

	ssh "$SSH_TARGET" "mkdir -p $WEBROOT && chown -R caddy:caddy /srv/rpg"

	# Written as a separate file rather than appended to the Caddyfile, so a
	# re-bootstrap replaces it cleanly instead of duplicating the block.
	ssh "$SSH_TARGET" "cat > /etc/caddy/conf.d/rpg.caddy" <<CADDY
# rpg-group-manager — pure static site, no backend (see scripts/deploy.sh).
$HOST {
	encode zstd gzip

	root * $WEBROOT
	file_server {
		precompressed gzip
	}

	# Vite content-hashes every asset filename, so they are immutable and can
	# be cached hard. index.html must NOT be, or clients pin to a stale build.
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
	header /index.html Cache-Control "no-cache"
}
CADDY

	# Import the conf.d directory from the main Caddyfile if it isn't already.
	# The Caddyfile serves OTHER live sites, so: back it up first, validate
	# before reloading, and restore the backup if validation fails. A broken
	# Caddyfile takes every vhost on the box down, not just this one.
	ssh "$SSH_TARGET" '
		set -e
		mkdir -p /etc/caddy/conf.d
		cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-$(date -u +%Y%m%dT%H%M%SZ)"
		if ! grep -q "conf.d/\*.caddy" /etc/caddy/Caddyfile; then
			printf "\nimport conf.d/*.caddy\n" >> /etc/caddy/Caddyfile
			echo "  added: import conf.d/*.caddy"
		fi
		if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | tail -5; then
			echo "  validation FAILED — restoring the previous Caddyfile" >&2
			cp -a "$(ls -1t /etc/caddy/Caddyfile.bak-* | head -1)" /etc/caddy/Caddyfile
			exit 1
		fi
		systemctl reload caddy
		ls -1t /etc/caddy/Caddyfile.bak-* | tail -n +6 | xargs -r rm --
	'
	echo "  Caddy config validated and reloaded."
	echo
	echo "  DNS: point $HOST at the origin DIRECTLY (not proxied) so Caddy can"
	echo "  complete its own ACME challenge — matching sealbreaker.getoar.de:"
	echo "      A     $HOST  ->  116.203.39.179"
	echo "      AAAA  $HOST  ->  2a01:4f8:1c1c:864f::1"
	echo
fi

# --- 2. build -------------------------------------------------------------
# Docker only — never install tooling on the host (CLAUDE.md).
echo "==> building web client"
"$REPO/dev" pnpm --filter @rpg/web build

DIST="$REPO/apps/web/dist"
[[ -f "$DIST/index.html" ]] || { echo "error: no build output at $DIST" >&2; exit 1; }

# --- 3. precompress -------------------------------------------------------
# Caddy's `precompressed gzip` serves a sibling .gz when the client accepts it,
# so compression happens once here instead of per request. Staged in a copy so
# repeated runs never accumulate .gz files in the real build directory.
echo "==> precompressing"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp -r "$DIST/." "$STAGE/"
find "$STAGE" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) \
	-exec gzip -9 -k -f {} \;

RAW="$(du -sh "$DIST" | cut -f1)"
echo "  build $RAW raw; largest asset:"
find "$STAGE" -name '*.js' ! -name '*.gz' -printf '%s %p\n' | sort -rn | head -1 |
	while read -r size path; do
		gz="$(stat -c%s "$path.gz")"
		printf '    %s  %s raw -> %s gzipped\n' "$(basename "$path")" \
			"$(numfmt --to=iec "$size")" "$(numfmt --to=iec "$gz")"
	done

# --- 4. ship --------------------------------------------------------------
# --delete is safe here: $WEBROOT is exclusively this build's output. It must
# never be pointed at /srv/rpg/ itself if anything else ever lives there.
echo "==> syncing to $SSH_TARGET:$WEBROOT"
rsync -az --delete "$STAGE/" "$SSH_TARGET:$WEBROOT/"
ssh "$SSH_TARGET" "chown -R caddy:caddy $WEBROOT"

# --- 5. verify ------------------------------------------------------------
echo "==> waiting for the site"
code=""
for _ in $(seq 1 15); do
	code="$(curl -s "${CURL_RESOLVE[@]}" -o /dev/null -w '%{http_code}' "https://$HOST/" || true)"
	[[ "$code" == "200" ]] && break
	sleep 1
done
if [[ "$code" != "200" ]]; then
	echo "error: https://$HOST/ returned ${code:-no response}" >&2
	echo "  check: ssh $SSH_TARGET 'journalctl -u caddy -n 50'" >&2
	echo "  if this is a first deploy, run with --bootstrap and confirm DNS." >&2
	exit 1
fi

# The app is one JS bundle: if it 404s the page renders an empty black screen
# with no error, which is a miserable thing to debug from a bug report.
BUNDLE="$(grep -o '/assets/index-[^"]*\.js' "$DIST/index.html" | head -1)"
bcode="$(curl -s "${CURL_RESOLVE[@]}" -o /dev/null -w '%{http_code}' "https://$HOST$BUNDLE" || true)"
if [[ "$bcode" != "200" ]]; then
	echo "error: the JS bundle ($BUNDLE) returned $bcode — the page will be blank." >&2
	exit 1
fi

enc="$(curl -sI "${CURL_RESOLVE[@]}" -H 'Accept-Encoding: gzip' "https://$HOST$BUNDLE" |
	tr -d '\r' | awk -F': ' 'tolower($1)=="content-encoding"{print tolower($2)}')"
if [[ "$enc" != "gzip" ]]; then
	echo "warning: the JS bundle is served UNCOMPRESSED (~3x the bytes)." >&2
	echo "  expected 'encode zstd gzip' + 'file_server { precompressed gzip }'." >&2
fi

echo
echo "deployed $REV -> https://$HOST/"
echo
echo "Every visitor gets their OWN game: saves live in that browser's"
echo "localStorage (key 'rpg-world-v1'), so there are no accounts, no sync"
echo "between devices, and clearing site data wipes that player's progress."
