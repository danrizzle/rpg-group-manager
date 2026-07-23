# Handoff for a fresh session — next up: the game UI, then guilds

**Status: phase 5 is COMPLETE and merged to `main` (`5e602ad`).** 166 engine
tests green, both typechecks + web build clean, working tree clean. Since then,
one UI slice landed on a branch: **the full backed call palette** (see next).

Read `STATUS.md` first (the ledger — phases 1–5 and the design decisions behind
them), then the `DESIGN.md` sections named below. This file is the orientation
layer: what to build next, what is already true, and where the traps are.

---

## NEXT SLICE — the rest of the GDD §3 call palette (engine-backed calls)

**Prompt for a fresh session:** *Finish the GDD §3 call catalog. The
presentation layer is done — `apps/web/src/components/callCatalog.ts` is the
single source of live calls, grouped by category, and `FightView` renders it as
a categorized palette. The 10 calls whose actions the engine already supports
ship. Four remain, and each is blocked on an engine system that does not exist
yet — this slice builds those systems (engine-first, byte-identity law applies),
then adds each call to `LIVE_CALLS`.*

The four, and what each needs (do them as separate sub-slices, not one lump):

1. **"Dodge!"** — a group **movement-phase** action. `movementPenalty` exists on
   abilities (`ability.ts`) but there is no `PlanAction` that puts the party into
   a movement window (boss AoE avoided, DPS lost via "damage while moving"). Needs
   a new action kind + sim handling + probably a new `AbilityTag`.
2. **"Healers save mana!" / "Pump!"** — a healer **throttle**. Blocked hard:
   **there is no mana economy in the sim at all.** This is really "add a resource
   model for healers," not a palette button. Scope it as its own design+engine
   slice; do not fake it.
3. **Heal-CD *chain*** — "which healer pops next?" Today "Heal CD now!" fires
   *every* heal-CD at once. A chain needs ordering/round-robin state so calls pop
   one healer per press. Engine-side sequencing.
4. **"Below 20%: everything out + potions"** — a **compound / conditional** call
   (a batch that also arms a threshold). `PlanAction` is a single flat action and
   calls fire immediately; this needs either a compound action or a call that
   installs a `bossHpBelow` plan entry on the fly.

**Also owed on the palette that just landed (cheap, do first):** a **manual
in-browser pass** — the catalog *logic* is unit-verified (`derive` batch sizes /
shapes against a 10-man comp) and it typechecks + builds, but nobody has clicked
the new buttons at a live raid frontier yet. Pull Cinderforge, confirm each new
call fires at the frontier, that Retreat's confirm ends the attempt as a retreat
(not a wipe), and that adoption still labels each call. `apps/web` has **zero
tests**, so this click-through is the only gate on the render path.

**Traps for this slice:** the engine is a pure, zero-dep, deterministic module —
new actions/tags must leave every existing stream **byte-identical** vs
`c9ef804` (§ conventions below). "Potions now!" was deliberately *left out* of
the shipped palette: consumables live in `char.abilities` but auto-fire through
a dedicated charge/cooldown path (`engine.ts` ~L849, `decision.ts` ~L89), so
firing one via the generic `ability` call path is untested — if you add it,
verify the charge accounting, don't just surface the button.

---

Everything runs in Docker via the wrappers — never install tooling on the host.

```sh
./dev pnpm install
./dev pnpm --filter @rpg/engine test        # 18 files / 166 tests
./dev pnpm --filter @rpg/engine typecheck
./dev pnpm --filter @rpg/web typecheck && ./dev pnpm --filter @rpg/web build
./web                                       # → http://localhost:5174
```

---

## 0. Decisions taken by the user (2026-07-19) — do not re-litigate

**1. The server is authoritative over EVERYTHING. Real fights happen on the
server; the client replays the finished event stream like a video.**

This is a clean fit for the existing architecture rather than a rewrite, for
two reasons that already hold: the engine is pure and deterministic (a fight is
a pure function of `(setup, seed)`), and the client's fight view is *already* a
replay — `fight/replay.ts` folds a `CombatEvent[]` into UI state, and
`FightView` plays it back on a clock. Today the stream comes from a local
`runFight`; tomorrow it arrives over the network. The playback layer barely
changes.

Implications worth knowing before you plan (each is a real consequence, not a
blocker):

- **Live calls become a round-trip.** Today a call appends `{atMs, action}` and
  re-runs `runFight` locally, which is instant. Server-side that is one request
  per call, returning a new stream that the client swaps in at the frontier.
  The past stays byte-identical either way (engine purity guarantees it), so the
  semantics survive — only the latency is new.
- **The training dummy should almost certainly stay client-side.** It is free,
  unlimited, consumes nothing and awards nothing (GDD §3) — there is nothing to
  cheat. It runs 1,000–5,000 Monte Carlo fights in a Web Worker; moving that to
  the server buys no integrity and costs a lot of compute. Authority is only
  needed where something is *earned*.
- **The world loop is also "earning" and therefore also moves.** Grind, gather
  and craft award XP and materials. `advanceWorld`/`advanceAll` are pure
  reducers, so they run server-side unchanged — and offline catch-up ("what
  happened while I was away") is *more* natural on a server than in a client
  that has to trust its own clock.
- **The local save becomes a cache, not the truth.** Plan that transition
  explicitly rather than letting the two drift; see §4.

**2. Loot rules are deliberately OUT OF SCOPE for now.** They need real design
work first, and that design is not something to improvise inside another
feature. Phase 5 already proved the game works without them: every reward is
deterministic (guaranteed first-clear trophies, guaranteed per-kill catalysts).
Keep that pattern until loot is designed properly, and do not invent a second
ad-hoc reward scheme in the meantime.

**3. The next work is a REAL GAME UI, and it comes before guilds.** The current
interface is, in the user's words, "an HTML data calculator" — and it must be
usable on mobile, not just desktop.

---

## 1. Next phase: the game UI (mobile-first)

This is not polish. **`DESIGN.md` §1 says "Platforms: PC, browser, mobile — no
mechanical demands… so all platforms are equal", and §3 calls the tactical
pause "usable on mobile too."** The current UI does not honor its own spec, so
this is closing a gap between the game and its design doc.

### What exists today

- React + Zustand, no router — the three top-level views (World · Base ·
  Combat) are a `view` field in the store.
- A **3-column desktop grid** (`.columns` in `styles.css`), ~9.5 kB of
  hand-written CSS, no design system, no icons, no animation.
- Plain `<select>` dropdowns for everything meaningful: gear, consumable slots,
  plan triggers and actions, boss-loadout assignment.
- The fight view is HP bars + cast bars + a scrolling text log. Raid frames got
  a role-grouped 2-column grid in slice 11 with a 900 px breakpoint — that is
  the *only* responsive rule in the codebase.

### What matters most, in order

1. **The fight view is the game's spectacle.** This is a management game: you
   never input during combat, you *watch* the plan you built play out. It is
   the screen that most needs to stop looking like a spreadsheet, and the one
   where a real game feel pays off most.
2. **The call palette must be thumb-reachable.** Live calls at the frontier are
   the single time-pressured interaction in the entire game (everything else is
   turn-free). On a phone those buttons belong in the bottom third of the
   screen, not above a scrolling log.
3. **Ten raid frames on a phone.** The current 2-column grid is a stopgap. Role
   grouping (tanks first) is load-bearing — during a tank swap those are the
   bars you are actually watching.
4. **Progressive disclosure is already a design law** (§8 Law 1: each stage
   introduces at most one or two systems; "stances, call buttons and plan slots
   only appear once unlocked"). The components already gate on unlock flags —
   a real UI should make that feel deliberate rather than incidental.

### Traps

- **This is a presentation-layer rewrite. The store is UI-agnostic and should
  stay that way.** Do not touch the persist chain (v15) to make the UI nicer.
- **`apps/web` has ZERO tests.** A UI overhaul is therefore the
  highest-regression-risk work in the repo's history, and in-browser
  verification per slice is the only gate. Consider adding component tests
  early — this is the moment where "we'll add tests later" stops being free.
- **`FightView`'s frontier clock and live-edge guard are subtle** (phase-4
  slice 6): playback is locked to the furthest point watched, and call buttons
  enable only within 200 ms of the live edge, so a rewound view cannot rewrite
  events the player already saw. Re-skinning must preserve those semantics —
  read the slice-6 notes in `STATUS.md` before touching it.
- **`fight/replay.ts` and `analysis/metrics.ts` are already N-actor
  generalized.** A new fight UI consumes the same actors and the same
  per-character summaries; you should not need new data plumbing.

---

## 2. After the UI: phase 6 (guilds)

`DESIGN.md` §7. Three features, very unequal in size:

| Feature | Real cost | Notes |
|---|---|---|
| **Accounts + sync** | **The whole phase, really.** | Server, DB, auth, conflict resolution. With decision #1 the server also becomes the fight referee and the world-loop clock. |
| **Guild bank** | Small once sync exists | §6. The bank is already a shared pool locally (`materials`/`inventory` + `bankCapacity`); making it guild-shared is authority, not mechanics. |
| **Guild world bosses** | Medium | The design payoff — and it fits the engine almost perfectly. |

**World bosses:** each member sends their own roster at a shared HP pool and
contributes the damage dealt; the boss dies when the pool empties. Contribution
is derivable from the event stream by the code the client already uses. The
"guild-wide journal" §7 asks for is `model/journal.ts`'s **monotone merge** —
already a merge over discovered-mechanic sets, so guild-wide discovery is
`discover()` folded across members rather than anything new. Read that file
before designing this; the hard part exists.

**Rewards must not be exclusive gear** (§7 is explicit — the guild is not a
power requirement): cosmetics, titles, a temporary guild-wide buff, and rare
crafting materials that feed the *existing* economy.

---

## 3. Also owed (small, self-contained)

- **Raid balance retune.** Ashkar and Vael sit near ~100% at default gear.
  Normal ≈ 90% plus a Heroic (stat-proof) variant is still owed, and it needs
  *survivability variance* — the TTK distribution is currently too tight for a
  clean enrage wall. Engine-only, no UI dependency, and world-boss tuning will
  inherit whatever conventions it sets, so it is worth doing before guilds.
- **Full call palette.** GDD §3 lists ~15 calls across Offensive / Defensive /
  Tactical / Meta; three ship today. Naturally paired with the UI work, since
  the palette is where the calls live.
- **Crafted gear** — a live decision, not an oversight. §6 frames catalysts
  around tier-2 weapons, but items carry `tier` as pure balance labelling with
  no cost or source, there is no recipe→item path anywhere, and all gear is
  **free-pick** in the dropdowns. Crafted gear therefore means introducing gear
  **ownership**, which retroactively gates every item currently selectable.
  Needs its own scoped slice and the user's sign-off.

---

## 4. Repo conventions that are actually enforced

- **One commit per slice**, reasoning in the body — not just the what. `git log`
  is the design record; read a few phase-5 commits for the register.
- **Update `STATUS.md` whenever a slice lands.** It is the ledger and the
  handoff surface between sessions.
- **Always write a handoff prompt for the next slice.** End every slice by
  refreshing this file (or an equivalent next-slice brief) so a fresh session
  can pick up cold — name the next slice, what's already true, and the traps.
  This is why the handoff surface stays warm between sessions.
- **Author the slice plan BEFORE writing code.** Phases 4 and 5 were both
  planned up front (the plans are recorded in `STATUS.md`), and that discipline
  is why the byte-identity law survived two phases of heavy refactoring.
- **Byte-identity is a hard law.** Any engine change must leave existing streams
  bit-for-bit unchanged. Baseline commit: **`c9ef804`**. Capture there and on
  your branch, then diff:

  ```sh
  for a in "--boss cinder-maw" "--boss emberwing --level 9" \
           "--boss bandit-warlord --level 3" "--encounter forge-whelps" \
           "--encounter slagmaw" "--encounter vulkan" \
           "--zone heartfield" "--zone cinder-wastes"; do
    ./dev pnpm -s --filter @rpg/engine cli -- $a --json > "OUT/$(echo $a | tr ' -' '__').json"
  done
  ```

  For changes touching shared code, diff **full event streams across several
  seeds**, not just the `--json` aggregates — an aggregate can match while a
  single melee target flipped. Slice 8's carrier fix was verified across 23
  artifacts this way.
- **Engine before web inside every slice.**
- **In-browser verification is expected** for web slices. Two hard-won gotchas:
  1. **Stash the real save to a file before any migration test.** Migrations run
     on page load, so *opening the app is the test*.
  2. **Seeding a test save requires freezing `localStorage.setItem`** right
     after writing and before reload — the world tick persists so eagerly it
     clobbers any external write. Close other app tabs first; a second open tab
     overwrites the seed.
- **`--trace` prints only the last ~25–30 events.** Mid-fight events
  (`targetChanged`, `buffRemoved`, `interrupted`) fall outside that window, so
  grepping the trace for them proves nothing.
  `packages/engine/test/raid.test.ts` is the real verification.
- **Playback speed resets to 1× on every pull** — annoying when re-running a
  3-minute raid boss. Cosmetic, unfixed, noted so you don't think a click
  failed. Worth fixing during the UI work.

---

## 5. Ground truth about the codebase

- **Workspace:** `packages/engine` (pure sim) + `apps/web`.
  `pnpm-workspace.yaml` already globs `apps/*` and `packages/*`, so an
  `apps/server` slots in with no tooling changes.
- **Engine deps: none at runtime.** Keep it that way — it is precisely why the
  same code can be the server's referee (decision #1).
- **Web deps:** react, react-dom, zustand, `@rpg/engine`. No router, no data
  layer, no auth, no UI library.
- **All state is one `localStorage` key** (`rpg-world-v1`), **persist v15**,
  written by Zustand `persist` with an explicit `partialize` allowlist in
  `apps/web/src/store.ts` (~line 1712): `characters`, `rosterOrder`,
  `loadouts`, `dungeonCleared`, `raidRoster`, `bossLoadouts`, `journal`,
  `familiarity`, `plans`, `unlocks`, `materials`, `inventory`, `buildings`,
  `attempts`, `chars`, `lastSeenWall`, `multiplier`. **That allowlist is your
  account schema** — it is already a clean, serializable snapshot of a player.
- **Docker:** `compose.yaml` runs one `dev` service, host `5174` → container
  `5173`. A server needs a second service and port mapping.
- **No CI, no lint step, no web tests.** The gates are the four commands at the
  top, run by hand.

*Phase 5's handoff and its executed results live in `STATUS.md` under "Phase 5
— post-merge verification"; the original file is in git history at `1d7a641`.*
