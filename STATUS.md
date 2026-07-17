# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Current phase: 3 (Progression), slices 1–5 of 6 done; world & leveling
design done (GDD v0.4) — next up: slice 6 (home base v1).**
As of July 2026.

## Phase checklist

- [x] **Phase 1 — Combat sim engine** (pure module): stats, abilities, intent
      stances, mistakes/discipline, event stream, Cinder Maw (mechanic types
      1–3), Monte Carlo distributions. 27 tests.
- [x] **Phase 2 — Browser prototype (= MVP)**: intent panel, real-fight replay
      (bars + log, playback), training-dummy review (kill %, DPS histogram,
      TTK, mistakes). Monte Carlo in a Web Worker.
- [ ] **Phase 3 — Progression**
  - [x] Slice 1 — Gear: item model + catalog (4 slots × 3 tiers,
        resist/behavior tradeoff pieces), gear picker, outgearing curve verified
  - [x] World & leveling **design** (GDD v0.4): level system + unlock arc
        (DESIGN.md §2), v1 world four regions + XP/risk grinding model
        (DESIGN.md §5). Design only — implementation is slices 2–3 below.
  - [x] **Slice 2 — Levels + zone grinding (engine).** Level-indexed naked
        base (`nakedBaseForLevel`, L1 30 SP/1,200 HP → L10 60 SP/2,100 HP; L10
        equals the old base so all Cinder Maw tuning + the 27 tests hold),
        XP curve + unlock table as data (`model/progression.ts`;
        `makeMage(…, level)` gates the kit). Sim generalized to N enemies
        (`Fight.enemies` + end condition; boss streams byte-identical) so a
        declarative `MobPackDefinition` runs as a real fight; `installPack`
        mirrors `installBoss`. Sim-derived `grindRates` (event-stream only:
        XP/hour, deaths/hour, risk tier) + overlevel `devalue`. Four zone
        packs (`content/mobs/zones.ts`) + zone bosses Bandit Warlord (type-1
        lite) & Emberwing (type-2). CLI: `--level`, `--zone`, `--boss`.
  - [x] **Slice 3 — World map, travel, task queues (web).** World/Combat view
        toggle; `WorldMapPanel` with 4 region cards showing sim-derived XP/hr +
        risk-tier chip per zone (grind worker, id-keyed envelope + rate cache).
        Task queue (travel/grind/gather) driven by a pure `advanceWorld`
        reducer (the `Replay.seek` fold applied to task time); live tick +
        deterministic offline catch-up sharing that reducer, "while you were
        away" summary, dev world-speed multiplier. Gates: Bandit Warlord /
        Emberwing killed live in the combat view set flags; bridge built from
        gathered timber. Persistence via Zustand `persist` → localStorage
        (progression/unlocks/queue/lastSeen only). CharacterPanel: level/XP bar
        + unlock-arc gating of intents/abilities. Engine unchanged — the web
        now threads `level` into `makeMage`.
  - [x] **Slice 4 — Talents + loadouts (engine + web).** DESIGN.md §2
        "Talents & Skill Trees" + "Loadouts". Engine: declarative
        `model/talent.ts` (`TalentNode`/`TalentEffect` union — stat, behavior,
        ability grant, control unlock; `TalentTree` carries granted-ability
        defs so content stays data). Pure `applyTalents` folds effects on top
        of gear (mirrors `applyGear`, same clamps); `makeMage(…, talents=[])`
        4th arg, backward-compatible; `validateTalentSelection` throws (engine)
        / `sanitizeTalentSelection` repairs (web boundaries);
        `talentPointsForLevel` grants a flat 8-point pool at cap (tunable). v1
        Mage tree (`content/classes/mageTalents.ts`): 9 nodes × 3 tiers,
        total cost 13 vs pool 8 → real path choices; named `TALENT_BUILDS`
        throughput/defense. **New behavior control end-to-end:**
        `barrierPolicy: 'reactive'|'proactive'` on `StanceConfig` (optional;
        absent = reactive, byte-identical streams), unlocked by the Glacial
        Barrier talent; proactive scores defensives at a fixed 2 in
        `sim/decision.ts` (> any damage score) → ~full Ice Barrier uptime.
        Capstone ability grant: Pyroclasm (2nd burst CD, generic buff
        machinery, zero engine changes). CLI: `--talents <build|id,…>`,
        `--barrier`. 13 new tests (fold/clamps, tree integrity, validation,
        sanitize, MC direction both builds, determinism); 57 total green.
        Web: `talents` threaded through all `makeMage` sites + worker
        requests + `rateKey`/`simIsStale` (as `level` was in slice 3);
        talent tree UI in CharacterPanel (tier rows, points chip,
        spend/refund, free Respec — slice 5 economy hook noted); Barrier
        policy dropdown gated by the talent; loadouts
        (`{name, stance, talents, gear}` save/apply/delete, apply sanitizes
        vs current budget and strips locked controls; consumable slots join
        in slice 5); persist v2 migration. Verified in-browser: spend →
        stats/kill% move, control unlocks, loadout survives respec + reload.
  - [x] **Slice 5 — Professions v1 (herbalism→alchemy→consumables).** GDD §6
        "most important loop" + §3 real-fight costs + §2 loadout slots.
        Engine: declarative `model/consumable.ts` (`ConsumableDefinition`
        union — passive stat layers folded at build time via `foldBonuses`,
        extracted from `applyGear`, same clamps; active potions as
        charge-limited abilities via a generic `chargesPerFight` on
        `Ability`). `makeMage(…, consumables?)` 5th arg: **absent = legacy
        free kit potion, byte-identical streams** (CLI baseline byte-matched);
        provided (even `[]`) = the kit potion is removed and
        potions/flasks come only from equipped slots.
        `normalizeConsumables` dedupes passives / merges duplicate actives
        (2× potion slot → one ability, 4 charges); `Fight` enforces charges
        in `resolveAbility` + the potion scheduler and emits t=0
        `buffApplied` (meta `consumable: true`) per passive so consumption
        stays stream-derived. Content (`content/consumables.ts`):
        `CONSUMABLE_SLOTS = 2`; Healing Potion (active, 750 heal, 45 s CD,
        2 charges/slot), Flask of Embers (+15 SP), Fire Ward Potion (+30
        fire res) — 3 options × 2 slots = the §6 ward-vs-flask decision.
        CLI `--consumables <id,…|none>`. 16 new tests (73 total).
        Web: herbs are world materials (sunleaf/Heartfield,
        emberbloom/Ashen; herbs+recipes in `world/professions.ts` — the
        engine stays economy-blind); gather task generalized off region
        meta; new queued `craft` task kind (whole-unit deposits, offline via
        the same `advanceWorld` fold, herbs paid at enqueue, cancel refunds
        unstarted units); AlchemyPanel on the map; consumable slot picker in
        CharacterPanel (gated by the L2 potion unlock); loadouts save/apply
        consumable slots (sanitized like gear); **respec now costs 10
        sunleaf** (slice-4 hook closed); `pull` consumes inventory —
        passives 1/fight, potion charges counted from the event stream,
        short slots skipped; dummy sims include slots free at nominal
        charges; grind sims run with empty slots (no free potions while
        AFK); persist v3 migration + consumables in `rateKey`-adjacent
        staleness (`simIsStale`). Tuning: see "Balance state (consumables)".
  - [ ] Slice 6 — Home base v1 (bank, workshops, training arena)
- [ ] **Phase 4 — Group content**: 3–5-char dungeon, trinity (Warrior/Priest
      kits), boss journal + discovery, boss plan timeline, group CDs, first
      live calls + tactical pause + call→plan adoption, familiarity, hold DPS,
      resistances in anger, mechanic type upgrades
- [ ] **Phase 5 — Roster & raids**: 20 chars, loadout library, full call
      palette, mechanic type 4, tier-2 catalyst content, access buildings
- [ ] **Phase 6 — Guilds**: accounts/sync, server-authoritative real fights
      (Fastify + Postgres, same engine), guild bank, world bosses
- [ ] **Phase 7 — Expansion stages** (as needed): traits, council/split/soak,
      difficulty tiers, affixes, timed runs, behavior-effect uniques,
      graphical replay

## Balance state (Cinder Maw, current numbers — slice 5 retune)

The free unlimited kit potion is gone (≈16 HPS it silently provided —
comparable to the boss's whole melee DPS), so Cinder Maw was softened to
keep the GDD law-2 AFK floor **without** consumables: hp 46.5k → **48k**,
melee 36 → **23**, firestorm 260 → **220**, enrage 6:15 → **6:30**.

Quadrant sweep (`--n 2000`, Balanced defaults, `--consumables none` unless
noted):

| Setup | Kill rate | Note |
|---|---|---|
| naked | 0% | enrage |
| starter | 12% | the gear wall |
| starter + discipline 90 + potion 65 | 31% | knowledge alone, no prep |
| starter + disc 90 + potion 65 + potion,flask | **98%** | knowledge + preparation (old 63% quadrant) |
| default | **91%**, 5.9% deaths | AFK floor holds with empty slots (law 2) |
| default + 2× healing potion | 97.6% (100% survival at `--enrage 900`) | prep buys certainty |
| best, Guarded + discipline 10 | 99.7%, ~5:28 | outgearing |

## Balance state (leveling & zones, slice 2)

Sim-derived via `grindRates` (`--n 400+`, default pull cycle 6 s approach /
12 s recovery / 60 s death penalty; risk tiers: <1 low, <5 risky, ≥5 deadly/hr).
All numbers placeholder-tunable. XP curve `xpToNext ≈ 100·n^1.6`.

Slice 5: grinding runs with **empty consumable slots** (no free potions
while AFK — per-task consumable budgets are a possible follow-up), so risk
numbers rose vs the slice-2 table:

| Zone (band) | mobs | on-band XP/hr | risk gradient |
|---|---|---|---|
| Heartfield (1–3) | 3× boar, xp 6 | L2 starter ~1.4k | low on-band |
| Duskwood (3–6) | 3× wolf, xp 14 | L5 starter ~2.6k | low on-band |
| Ashen Foothills (6–9) | 3× stalker (fire), xp 30 | L8 default ~4.5k | **risky on-band** (~1.2 deaths/hr, potionless) |
| Cinder Wastes (9–10) | 3× horror (fire), xp 60 | L10 best ~10k (0.6 deaths/hr) | **L6 starter deadly (~32 deaths/hr)** — the lethality gate |

- Overlevel devaluation confirmed: Heartfield at L8 → XP × 0.1 floor.
- AoE/gear scaling automatic: better stance/gear → higher XP/hr (grind tests).
- Zone bosses (defaults): Bandit Warlord L3 starter ~100% kill, ~0:47;
  Emberwing L9 default ~99% kill, ~2:43. Both tune via `--boss`.
- **Note on wall-clock pacing:** raw sim XP/hr is high vs. the GDD §2 "~1–2 h/
  level" target — real-time gating is meant to come from the dev/world time
  multiplier (slice 3), not from slowing the sim. Left as-is deliberately.

Known gaps / deferred items:

- Knowledge levers are thin until phase 4 (boss plans, familiarity) — the
  knowledge quadrant now rides on discipline + potion timing + preparation.
- ~~Post-fight review lacks comparison to last/best attempt and a
  wipe-analysis line~~ — landed as a standalone follow-up after slice 5:
  pure `fightReview` in `analysis/metrics.ts` (stream-only: consumables
  used, structured wipe facts — killedBy + a potion note explaining why the
  potion didn't save you, or boss-HP-left on enrage/timeout; 6 tests, 79
  total); web persists per-boss last/best attempts (persist v4) and
  FightView shows the review block once playback reaches the end (DPS, TTK
  vs last/best, "new best", wipe line, consumables used). Remaining GDD §3
  review items: "combat log light" decisive-moment highlighting beyond the
  wipe line, and buff-uptime/overheal stats — revisit with phase 4.
- ~~Deaths at full defaults are rare (~0.5%)~~ — fixed in slice 5: 5.9%
  deaths at defaults with empty slots; consumables are the survival lever.
- Slice-5 v1 simplifications: grind sims are consumable-free; 1 potion in
  stock still grants a full slot's 2 charges in the sim (deduction is capped
  by stock — small free lunch); `maybeSchedulePotion` picks the single
  consumable-tagged ability (`find`) — fine until a second active consumable
  exists; no profession skill levels; crafting is location-free until the
  slice-6 workshop.

## Balance state (talents, slice 5 retune)

- Throughput build defanged (slice-4 flag closed): pyromantic-affinity +8 →
  **+4 SP**, hot-streak +5% → **+2% crit**, Pyroclasm 1.15× → **1.10×**.
  Starter vs Cinder Maw: 12% bare → **77%** talents alone → **96%** talents
  + flask — professions complete the wall-crack, talents alone leave a real
  1-in-4 failure and no survival margin. (Aimed at 40–60% for talents
  alone, but starter+throughput DPS ≈ default-gear DPS, so no boss-HP wall
  can separate them without gutting the tree; 77% is the honest optimum on
  this axis. Revisit with phase-4 knowledge levers.)
- Defense build + `--barrier proactive` unchanged in role; the proactive
  lever still trades DPS for survival.

## Balance state (consumables, slice 5)

- **Ward vs flask is a real slot decision** (GDD §6): Balanced starter,
  `--enrage 900`: bare 18.3% deaths; **fire ward → 0.9% deaths at ±0 DPS**;
  **flask → +10 DPS but 11.3% deaths**. Emberwing L9 defaults: 87% → 99%
  with ward.
- Potions at defaults: 91% (none) → 98.6% (one slot) → 99% (two); deaths
  5.9% → 0% at `--enrage 900` with two slots.
- Economy (hand-checked): 12 herbs/hr gathering; potion = 2 sunleaf + 5
  game-min, flask = 2+2, ward = 3 emberbloom + 10 min → one gather-hour
  funds ~3 potion-equipped pulls or ~2 flask+potion pulls. Respec = 10
  sunleaf (~50 game-min of gathering). All placeholder-tunable in
  `world/professions.ts`.

## Environment notes

- All dev in Docker: `./dev …`, `./web` → http://localhost:5174.
- Repo history: one commit per slice. Engine content =
  `packages/engine/src/content/` — `classes/mage.ts`, `bosses/` (cinderMaw,
  banditWarlord, emberwing), `mobs/zones.ts`, `items.ts`, `consumables.ts`.
  Level/XP/unlock rules in `model/progression.ts`; grind rates in
  `analysis/grind.ts`; consumable rules in `model/consumable.ts`.
- CLI: `--level`, `--zone <heartfield|duskwood|ashen-foothills|cinder-wastes>`
  (grind report), `--boss <cinder-maw|bandit-warlord|emberwing>` (boss report),
  `--talents <throughput|defense|id,id,…>`, `--barrier <reactive|proactive>`,
  `--consumables <id,…|none>` (absent = legacy free-potion character).
  Talent content in `classes/mageTalents.ts`; talent rules in `model/talent.ts`.
- Web professions data (herbs, recipes, respec cost, gather rates) in
  `apps/web/src/world/professions.ts`.
