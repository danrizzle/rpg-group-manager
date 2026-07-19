# Phase 5 — local testing handoff

> **EXECUTED 2026-07-19 — all steps passed.** Results are recorded in STATUS.md
> under "Phase 5 — post-merge verification". Kept for provenance. Two fixes if
> you re-run it: step 2's baseline must be **`c9ef804`** (post-merge, `main` *is*
> the branch), and **step 3's `--trace` greps cannot work** — `--trace` prints
> only the last 25–30 events, so mid-fight `targetChanged`/`buffRemoved` fall
> outside the window; `test/raid.test.ts` asserts them instead.

A prompt for Claude Code to verify the phase-5 work (branch
`claude/phase-5-raid-scale-party-tlgitk`, PR #1) on a machine with the Docker
dev environment. Everything below was written/verified in a remote container
**without a browser**, so the CLI/engine checks are trustworthy and the
**web UI needs a real browser pass** (steps 5–6).

Everything runs in Docker via the wrappers — never install tooling on the host.

---

## 0. Setup
```sh
git fetch origin && git checkout claude/phase-5-raid-scale-party-tlgitk
./dev pnpm install
```

## 1. Engine tests + typecheck (should be all green)
```sh
./dev pnpm --filter @rpg/engine test        # expect 18 files / 161 tests passing
./dev pnpm --filter @rpg/engine typecheck    # clean
```
New test files to eyeball: `test/type4.test.ts`, `test/rescue.test.ts`,
`test/classtalents.test.ts`, `test/raid.test.ts`, plus the raid-scale block in
`test/party.test.ts` and `test/mechanics.test.ts`.

## 2. Byte-identity — THE core guarantee
Every existing solo + trinity stream must be bit-for-bit unchanged vs `main`.
Capture on `main`, then on the branch, and diff:
```sh
git checkout main
mkdir -p /tmp/base
for a in "--boss cinder-maw" "--boss emberwing --level 9" "--boss bandit-warlord --level 3" \
         "--encounter forge-whelps" "--encounter slagmaw" "--encounter vulkan"; do
  ./dev pnpm -s --filter @rpg/engine cli -- $a --json > "/tmp/base/$(echo $a | tr ' /' '__').json"
done
git checkout claude/phase-5-raid-scale-party-tlgitk
for a in "--boss cinder-maw" "--boss emberwing --level 9" "--boss bandit-warlord --level 3" \
         "--encounter forge-whelps" "--encounter slagmaw" "--encounter vulkan"; do
  ./dev pnpm -s --filter @rpg/engine cli -- $a --json > "/tmp/after_$(echo $a | tr ' /' '__').json"
done
for f in /tmp/base/*.json; do diff -q "$f" "/tmp/after_$(basename $f)" ; done
# expect: no output (all identical). Ember Forge should read Slagmaw 97.5% /
# Vulkan 96.25% at --n 400.
```

## 3. The raid + type-4 mechanics (new content)
```sh
./dev pnpm --filter @rpg/engine cli -- --raid --boss ashkar --n 400   # ~100% kill, TTK ~3:30
./dev pnpm --filter @rpg/engine cli -- --raid --boss vael   --n 400   # ~100% kill
./dev pnpm --filter @rpg/engine cli -- --raid --boss ashkar --pgear starter --n 400  # ~96%
./dev pnpm --filter @rpg/engine cli -- --raid --boss ashkar --trace   # look for targetChanged (tank swaps)
./dev pnpm --filter @rpg/engine cli -- --raid --boss vael   --trace   # look for buffRemoved (dispels)
```
`raid.test.ts` already asserts tank swaps fire on Ashkar and dispels on Vael.
Note: raid balance is **placeholder** — a tighter Normal≈90% / a Heroic variant
is an open retune.

## 4. Web typecheck + build
```sh
./dev pnpm --filter @rpg/web typecheck && ./dev pnpm --filter @rpg/web build   # both clean
```

## 5. In-browser QA (needs a real browser — the risky, unverified part)
```sh
./web    # http://localhost:5174
```
**Persist migration (v9 → v10) — do this with the real save stashed first.**
If there's a live `rpg-world-v1` in localStorage, copy it to a file before
touching anything, then verify it loads cleanly (recruits gain `talents: []`,
no data loss). Do destructive testing in an isolated context.

Walk through:
1. **Recruit talents (slice 6):** open the character switcher → Borin (warrior)
   and Seren (priest) now have a **Talents** section (was Elara-only). Spend
   points; the stat line should move. Respec should charge 10 sunleaf **once**.
   Warrior capstone grants *Challenging Shout* (taunt), priest capstones
   *Purify* (dispel) / *Power Word: Barrier* — confirm they appear in the
   Abilities list when specced.
2. **Roster-derived call palette (slice 6):** in a dungeon pull's live mode, the
   "All CDs now!" / "Heal CD now!" buttons should reflect the actual party
   (Battle Shout, Divine Hymn, talented Pyroclasm, …) and disable when the party
   has none.
3. **Ember Forge unchanged:** pull the trinity dungeon — should behave exactly as
   before (this is the byte-identity guarantee, visually).
4. Confirm no console errors; the app builds and runs.

## 6. Known gaps to confirm are absent / expected
- **No web raid pull** yet — Cinderforge is engine/CLI-only. The dungeon path is
  still trinity-shaped; wiring a 10-man raid pull + raid view is the main
  remaining slice-7 web work.
- **No access-building gate** and **no catalyst crafting recipes** yet
  (documented follow-ups; gear tiers already exist).
- Loadout UI stays Elara-facing (the `classId` model is scoped for later).

## Summary of risk
- **Engine (slices 2–5, 7 content): high confidence** — tested + byte-identity
  verified.
- **Web (slices 3, 5, 6): typecheck + build clean, but not browser-verified** —
  steps 5–6 are where to look for regressions.
