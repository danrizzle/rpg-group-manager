# Phase 6 — Guilds: handoff for a fresh session

**Status: phase 5 is COMPLETE and merged to `main` (`5e602ad`).** 166 engine
tests green, both typechecks + web build clean, working tree clean.

Start by reading `STATUS.md` (the ledger — phases 1–5 and every design decision
behind them), then `DESIGN.md` §7 (Guilds), §6 (economy/guild bank) and §8
(the two complexity laws). This file is the orientation layer on top of those:
what phase 6 actually costs, what is already true, and where the traps are.

Everything runs in Docker via the wrappers — never install tooling on the host.

```sh
./dev pnpm install
./dev pnpm --filter @rpg/engine test        # 18 files / 166 tests
./dev pnpm --filter @rpg/engine typecheck
./dev pnpm --filter @rpg/web typecheck && ./dev pnpm --filter @rpg/web build
./web                                       # → http://localhost:5174
```

---

## 1. Read this before planning anything

**Phase 6 is the first phase that breaks the architecture every earlier phase
relied on.** Phases 1–5 shipped a pure client: no server, no accounts, no
network, all state in one `localStorage` key. Guilds need accounts, sync and a
shared authority. That is not "one more slice" — it is a new axis, and §8's
Law 1 explicitly warns that a game gets complicated when systems arrive
*simultaneously*.

Two things make it tractable, and both are already true:

- **The engine is pure and deterministic.** `packages/engine` has zero runtime
  dependencies and runs unchanged in Node and the browser (see `CLAUDE.md` —
  this is an architecture rule, not an accident). A fight is a pure function of
  `(setup, seed)`. A server can therefore *re-run* a client's fight and get
  bit-identical results, which is what makes "server-authoritative real fights"
  cheap rather than a rewrite.
- **The event stream is the only source of truth for outcomes.** Damage
  contributed to a world boss is derivable from `CombatEvent[]` by the same
  code the client already uses (`analysis/metrics.ts`). No new scoring path.

**The single biggest open question is what the server is authoritative OVER.**
Re-running every fight server-side is the honest answer but changes the feel of
the game (latency on a pull). Trusting the client and only sharing outcomes is
cheap but makes a world-boss leaderboard meaningless. Decide this **before**
writing any server code — it determines the entire shape of phase 6.

---

## 2. What exists today (the ground truth)

- **Workspace:** `packages/engine` (pure sim) + `apps/web` (React + Zustand).
  `pnpm-workspace.yaml` already globs `apps/*` and `packages/*`, so an
  `apps/server` slots in with no tooling changes.
- **Engine deps:** none at runtime. Keep it that way — it is why the same code
  can be the server's referee.
- **Web deps:** react, react-dom, zustand, `@rpg/engine`. No router, no data
  layer, no auth. All of that is phase-6 greenfield.
- **All state is one `localStorage` key** (`rpg-world-v1`), currently at
  **persist v15**, written by Zustand `persist` with an explicit `partialize`
  allowlist in `apps/web/src/store.ts` (~line 1712). The persisted shape is:
  `characters`, `rosterOrder`, `loadouts`, `dungeonCleared`, `raidRoster`,
  `bossLoadouts`, `journal`, `familiarity`, `plans`, `unlocks`, `materials`,
  `inventory`, `buildings`, `attempts`, `chars`, `lastSeenWall`, `multiplier`.
  **That allowlist is your account schema.** It is already a clean, serializable
  snapshot of a player — syncing it is a smaller job than it sounds.
- **Docker:** `compose.yaml` runs a single `dev` service, host `5174` →
  container `5173`. A server needs a second service and a second port mapping.
- **No CI, no lint step, no test runner for the web app.** The gates are the
  four commands above, run by hand. The engine has 166 tests; `apps/web` has
  **zero** — every web slice so far was verified in a real browser instead
  (see §5).

---

## 3. What phase 6 is, per the GDD

§7 lists three features. They are not equal in size:

| Feature | Real cost | Notes |
|---|---|---|
| **Accounts + sync** | **The whole phase, really.** | Server, DB, auth, conflict resolution, offline-first. Everything else depends on it. |
| **Guild bank** | Small once sync exists | §6. The bank is already a shared pool locally (`materials`/`inventory` + `bankCapacity`); making it guild-shared is mostly authority, not mechanics. |
| **Guild world bosses** | Medium | The interesting one. Each member sends their own roster at a shared HP pool; contributed damage is summed; the journal is guild-wide. |

**World bosses are the design payoff and they fit the existing engine almost
perfectly**: each member's attempt is a normal fight against a boss with a huge
HP pool, and their contribution is damage dealt, off the event stream. The
"shared journal" is `model/journal.ts`'s monotone merge — which is *already* a
merge over discovered-mechanic sets, so guild-wide discovery is `discover()`
folded across members rather than anything new. Read that file before designing
this; the hard part is already done.

**Rewards must not be exclusive gear** (§7 is explicit — the guild is not a
power requirement). Cosmetics, titles, a temporary guild-wide buff, and rare
crafting materials that feed the *existing* economy.

---

## 4. Traps and open questions, in the order they will bite

1. **Decide the authority model first** (see §1). Everything downstream depends
   on it.
2. **Loot rules are still unresolved and now matter more.** STATUS's "open
   design questions" flag this as the largest genuine GDD gap. Phase 5
   sidestepped it by making every reward deterministic (guaranteed first-clear
   trophies + guaranteed per-kill catalysts). Guild rewards re-open it — resolve
   it deliberately rather than inventing a second ad-hoc scheme.
3. **Raid balance is untuned.** Ashkar and Vael sit near ~100% at default gear.
   The retune to Normal ≈ 90% plus a Heroic variant is still owed and needs
   *survivability variance* — the TTK distribution is currently too tight for a
   clean enrage wall. Consider doing this BEFORE guilds: world-boss tuning will
   inherit whatever conventions the raid establishes.
4. **The persist migration chain is long (v15).** Do not break it. Every version
   bump so far was verified against a copy of a real save. If accounts arrive,
   the local save becomes a *cache* rather than the truth — plan that transition
   explicitly instead of letting both drift.
5. **`apps/web` has no tests.** Phase 6 adds a server, where hand-verification
   in a browser stops being sufficient. Set up server tests in its first slice;
   retrofitting is exactly what the engine avoided by testing from phase 1.
6. **Don't leak the economy into the engine.** `packages/engine` knows nothing
   about herbs, recipes, banks or accounts, and that separation is load-bearing
   (`world/professions.ts` header says so). Guild bank logic belongs web/server
   side.
7. **Crafted gear is deliberately unbuilt** and is a live decision, not an
   oversight. §6 frames catalysts around tier-2 weapons, but items carry `tier`
   as pure balance labelling with no cost or source, there is no recipe→item
   path anywhere, and all gear is **free-pick** in the dropdowns — so crafted
   gear means introducing gear **ownership**, which retroactively gates every
   item currently selectable. Its own scoped slice, with the user's sign-off.

---

## 5. How to work in this repo (conventions that are actually enforced)

- **One commit per slice**, with the reasoning in the body — not just the what.
  `git log` is the design record; read a few phase-5 commits for the register.
- **Update `STATUS.md` whenever a slice lands.** It is the ledger and the
  handoff surface between sessions.
- **Byte-identity is a hard law.** Any engine change must leave existing streams
  bit-for-bit unchanged. The baseline commit is **`c9ef804`** (the last commit
  before phase-5 engine work). The check:

  ```sh
  # capture on c9ef804 and on your branch, then diff the two directories
  for a in "--boss cinder-maw" "--boss emberwing --level 9" \
           "--boss bandit-warlord --level 3" "--encounter forge-whelps" \
           "--encounter slagmaw" "--encounter vulkan" \
           "--zone heartfield" "--zone cinder-wastes"; do
    ./dev pnpm -s --filter @rpg/engine cli -- $a --json > "OUT/$(echo $a | tr ' -' '__').json"
  done
  ```

  For changes touching shared code, diff **full event streams** across several
  seeds, not just the `--json` aggregates — an aggregate can match while a
  single melee target flipped. Slice 8's carrier change was verified across 23
  artifacts this way.
- **Engine before web inside every slice.**
- **In-browser verification is expected** for web slices. Two hard-won gotchas:
  1. **Stash the real save to a file before any migration test.** Migrations run
     on page load, so *opening the app is the test*.
  2. **Seeding a test save requires freezing `localStorage.setItem`** right after
     writing and before reload — the world tick persists so eagerly it clobbers
     any external write. Close other app tabs first; a second open tab
     overwrites the seed.
- **`--trace` prints only the last ~25–30 events.** Mid-fight events
  (`targetChanged`, `buffRemoved`, `interrupted`) fall outside that window, so
  grepping the trace for them returns nothing and proves nothing.
  `packages/engine/test/raid.test.ts` is the real verification.
- **Playback speed resets to 1× on every pull** — mildly annoying when
  re-running a 3-minute raid boss. Cosmetic, unfixed, noted so you don't think
  a click failed.

---

## 6. Suggested first moves

1. Read `STATUS.md` end to end, especially "Phase 5 — autonomous design
   decisions" and "open design questions". Most phase-6 traps are foreshadowed
   there.
2. Resolve the **authority model** and **loot rules** with the user before
   planning slices. Both are product decisions, not implementation details.
3. Consider landing the **raid balance retune** first as a small, self-contained
   phase-5 coda — it is owed, it is engine-only, and it sets conventions
   world-boss tuning will inherit.
4. Then author a phase-6 slice plan **before writing code**, the way phases 4
   and 5 were planned (both slice plans are recorded in `STATUS.md`, authored
   ahead of implementation — that discipline is why the byte-identity law
   survived two phases of heavy refactoring).

*Phase 5's own handoff and its executed results live in `STATUS.md` under
"Phase 5 — post-merge verification"; the original file is in git history at
`1d7a641`.*
