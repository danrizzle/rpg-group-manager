# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Phase 3 (Progression) COMPLETE — all 6 slices done. Next up: phase 4
(group content: dungeon, trinity, boss journal, boss plans, live calls).**
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
  - [x] **Slice 6 — Home base v1 (bank + alchemy workshop).** GDD §5, bounded
        by §1 (tinkering stays instant/free) and §8 Law 1 (full base belongs
        to the 2-char stage) — so v1 is minimal and strictly additive.
        **Base = third top-level view** (World · Base · Combat; a 5th region
        was rejected — RegionId is a closed union coupled to engine ZONES).
        Declarative buildings in `world/base.ts` (`BuildingDefinition` with
        upgrade tiers; effects as data: `craftTimeMult`, `capacityPerKind`).
        **Workshop** (upgrade-only, never gates): unbuilt = "field kit" at
        1× speed; T1 (15 timber) −25% / T2 (30 timber + 10 emberbloom) −50%
        craft time, snapshotted into `unitGameMs` at enqueue (GrindTask
        rate-snapshot precedent; pre-v5 queued crafts keep their 1× snapshot).
        **Bank pre-built at T1** — the future roster's shared potion pool;
        per-item-kind caps over materials AND consumables bind from day one
        (T1 50, T2 150 via 25 timber + 10 sunleaf). Cap semantics: **caps
        never confiscate, crafts never stall** — gather accrual clamps via
        `min(max(cur, cap), cur + gain)` (over-cap hoards preserved, frozen);
        craft deposits clamp, overflow is lost and reported
        (`AwayEvent.lostToCapacity`, "bank full — N lost"); enqueue guard
        blocks crafts that can't fit (ignoring other queued crafts —
        documented hole covered by lose-overflow). `upgradeBuilding` action;
        BasePanel (buildings grid + bank storage + relocated AlchemyPanel);
        persist v5. **Training arena deferred** (eventual role: combat-stat
        training) — in its place, ungated QoL: **dummy-sim boss selection**
        (`SimRequest.bossId`, shared `sim/bosses.ts` registry, target
        segmented control in ReviewPanel, Emberwing gated by the bridge like
        the map's Challenge button; the hero line now names its target).
        Engine untouched (79 tests green). Verified in-browser: v4→v5
        migration, exact-50 gather clamp + away note, overflow craft
        completes with loss, workshop snapshot 600000→450000 ms, bank T2
        caps /150, boss-select stales + relabels the sim.
        Building costs deliberately revive the post-bridge timber loop.
- [ ] **Phase 4 — Group content** (slice plan authored 2026-07-18, before
      any phase-4 code; engine before web inside every slice; byte-identity
      for all existing streams when new args are absent; CLI `--json`
      baselines captured pre-change and byte-compared):
  - [x] **Slice 1 — Party fight core (engine).** `FightSetup.party?:
        CharacterDef[]` (exactly one of player/party; `player` = legacy solo
        path, byte-identical). `CharacterDef.{id, role}`; per-character
        forked RNG streams (party only). Threat model: per-enemy threat
        tables, `Ability.threatMult`, healing generates global threat,
        melee targets top threat (adds default to the last healer — aggro
        drama the tank answers with AoE threat). Effect target modes:
        heal `lowest-ally`/`party`, buff `party`, `damageTakenMult` buff
        (Shield Wall machinery); `powerStat` on damage effects (warrior =
        attackPower). Timeline abilities hit the whole party (mechanic-type-2
        upgrade: group heal check); movement windows roll fail-to-move per
        character; per-char potions/mistakes/charges; fight ends when the
        whole party is dead; t=0 `join` events document the roster in the
        stream (party fights only). `summarizeRun`/`fightReview` gain
        per-character breakdowns (solo output shape unchanged). Tests:
        byte-identity (boss + pack + consumable streams), party determinism,
        stream-reconstructed invariants, threat direction (tank holds boss).
        **Landed:** 13 new tests (92 total green); all 7 pre-change CLI
        `--json` baselines byte-identical (cinder-maw default/defense-
        proactive/starter+talents+consumables, emberwing L9, bandit L3,
        heartfield + cinder-wastes grinds). `SoloFightSetup` convenience
        type for the legacy-required fields. Solo keeps the main RNG
        stream; party members run on per-character forks. Web untouched
        and building.
  - [ ] **Slice 2 — Trinity kits + Ember Forge (engine).** `makeWarrior`
        (tank: high armor/HP, attackPower kit, high-threat single + AoE
        strikes, Shield Wall defensive) + `makePriest` (healer: healingPower
        kit, single heal `lowest-ally`, group heal, Divine Hymn heal-CD) +
        class item catalogs incl. fire-resist pieces + gear sets. Group CDs
        as comp-granted data (`content/groupCds.ts` + `assembleParty`):
        Battle Shout (warrior, party damage burst), Well-Drilled Team
        (3 distinct roles → passive discipline bonus). Dungeon model
        (`model/dungeon.ts`: ordered encounters, trash packs + bosses) +
        Ember Forge content: Forge Whelps trash, boss 1 **Slagmaw the
        Smelter** (type 1+2 upgraded: heavy fire timeline vs the whole
        party — resist gear + ward potions matter in anger; gear answer =
        fire resist/HP, knowledge answer lands with heal-CD plan slots in
        slice 5), boss 2 **Forgemaster Vulkan** (phase timing / hold-DPS
        showcase: HP-triggered add phase vs timed Forge Blast — pushing at
        the wrong moment overlaps them). CLI `--encounter <id> --party`.
        Tuning pass per the §2 laws (Normal ≥ ~90% at party defaults with
        adequate gear, no plan; measure at `--enrage 900` near walls).
  - [ ] **Slice 3 — Roster + dungeon (web).** Recruits: first Cinder Maw
        kill unlocks Borin (warrior) + Seren (priest) — backfilled for
        saves that already killed it. Per-character builds: Elara keeps her
        legacy top-level persisted fields (zero-risk for live saves);
        warrior/priest live in a new `roster` record; uniform selectors on
        top. CharacterPanel gets a character switcher (stance/gear/
        consumable slots per char; talents Elara-only in v1). Dungeon panel
        in Cinder Wastes: Ember Forge door, encounters in order (trash
        gates the bosses per run), party pulls; FightView/Replay/ReviewPanel
        generalized to N actors from `join` events (per-char DPS/HPS bars,
        deaths). Party consumable slots draw on the shared bank. Persist v6.
  - [ ] **Slice 4 — Boss journal + discovery + familiarity (engine + web).**
        Engine `model/journal.ts`: `discoverFromEvents` (stream-only facts:
        timeline casts seen, movement/enrage/phase-2/adds/tantrum seen,
        lowest boss HP reached), monotone merge, `explorationPct`,
        `redactBoss(def, knowledge)` — undiscovered mechanics no-opped with
        the banditWarlord no-op patterns so the dummy sim simulates exactly
        what the journal knows (GDD §4 law); `familiarityBonus(attempts)` →
        additive discipline (drives both mistakes and call reaction, §2).
        Web: journal card per dungeon boss (✓/??? rows with timers/triggers
        from the def once seen, last-wipe line from `fightReview`), dummy
        sims of dungeon bosses run against the redacted def, per-character
        familiarity per boss from attempt counts (wipes count — §2), v7.
  - [ ] **Slice 5 — Boss plan timeline + group CDs + hold DPS (engine +
        web).** Engine `model/plan.ts`: declarative `BossPlan` — triggers
        (pull, time, boss-cast, phase, boss-HP-below) × actions (fire
        ability/group CD, switch a character's named stance/target step,
        hold/resume DPS). Executor schedules actions after each character's
        reaction time (discipline) on a forked plan RNG (no main-stream
        perturbation); `holdDps` gates damage abilities in the decision
        brain; `burstCds: 'save-for-plan-window'` becomes real (burst CDs
        held for plan windows). Plan events in the stream. No plan = auto
        plan (Law 2: Battle Shout on pull, nothing else). Web: plan
        timeline editor per dungeon boss where **journal entries are the
        building blocks** (knowledge → levers: only discovered casts/phases
        are offered as triggers), plans persisted per boss (v8), dummy sim
        honors the plan vs the redacted boss.
  - [ ] **Slice 6 — Live calls + tactical pause + call→plan adoption (web +
        engine).** Engine: `FightSetup.calls?: TimedCall[]` — plan actions
        fired at a wall time, same arsenal as the plan (§3 ground rule 1),
        same reaction-time machinery, `call` events in the stream. Web:
        dungeon pulls run in live mode — playback locked to the frontier,
        tactical pause, a 2–3 button call palette (Law 1: "All CDs now!",
        "Heal CD now!", "Stop damage!/Push!"); issuing a call re-runs the
        deterministic fight with the call appended (past events identical —
        purity makes live play a fold, not a second engine). Review lists
        calls made with "adopt into plan" (anchored to the nearest
        discovered boss cast, else a time trigger) — active play writes
        your boss plan (§3 ground rule 2).
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

## Phase 4 — autonomous design decisions (morning review)

Decisions taken overnight without user input; each lists the rejected
alternative. Grouped by slice as they land.

**Slice planning (pre-code):**

- **Six slices, party sim split from kits/content.** Rejected: one mega
  "trinity" slice — the byte-identity risk (single-player seams in
  `Fight`) deserves its own test gate before any content rides on it.
- **Recruits unlock on the first Cinder Maw kill.** The GDD stage table
  (§2) has a 2-char mid-game stage v1 doesn't build; the Cinder Wastes
  door is the phase-4 teaser, and Cinder Maw is "the wall" whose kill
  proves dungeon-readiness. Rejected: unlock at level 10 (no
  accomplishment gate) and a separate recruit quest (new machinery).
- **Warrior/Priest ship without talent trees in v1 phase 4.** The phase-4
  checklist doesn't list them; per-class trees are phase-5 roster work.
  Rejected: minimal 3-node trees now (spreads tuning thin across slices).
- **Elara keeps her legacy top-level store fields; new characters live in
  a `roster` record.** Zero-migration-risk for the live save (hard law);
  uniform per-char selectors hide the asymmetry. Rejected: migrating all
  builds into `characters{}` (cleaner, but risks the real save for purely
  aesthetic gain; phase 5's loadout-library work can do it properly).
- **Interrupt assignments deferred to phase 5.** Not in the phase-4
  checklist ("full call palette" is phase 5); hold DPS is the phase-4
  depth mechanic. Rejected: add-cast interrupt machinery now.
- **Live calls implemented as deterministic re-runs** (append the timed
  call, replay the same seed — past identical, future diverges) rather
  than an incremental/streaming sim loop. Purity is the whole point of
  the engine; a second stepping mode would be a standing bug farm.

**Slice 1 (party fight core):**

- **Solo fights keep drawing from the fight's main RNG stream; party
  members each get `rng.fork('char:<id>')`.** The only way to keep the
  pre-party streams byte-identical AND make party rolls independent
  (adding a member never perturbs the others). Rejected: forking for the
  solo path too (breaks every existing stream/tuning number).
- **Threat model: damage × `ability.threatMult` feeds the struck enemy's
  table; effective healing feeds EVERY enemy at 0.5×; a fresh add with an
  empty table goes for the most recent healer** (healer aggro is real and
  gives the tank's AoE-threat kit a job in slice 2), falling back to the
  first living member. Rejected: adds defaulting to the tank (kills the
  add-pickup decision entirely — nothing to plan around).
- **Boss timeline abilities now hit every living party member** (the GDD
  §4 type-2 "group-wide damage demands planned heal CDs" reading); solo
  = party of one, so nothing changed for existing bosses. Rejected:
  random-target timeline hits (adds RNG the heal check doesn't need).
- **Party wipe analysis explains the LAST death** (the wipe moment) with
  that character's own potion/threshold. Rejected: per-character wipe
  notes (deferred until the web review shows per-char detail, slice 3).
- **Heal decision scoring skips targets above 95% HP** so healers never
  spam full-HP heals; group heal beats single heal via a 1.6× breadth
  boost on average deficit. Placeholder balance, tuned in slice 2.

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
