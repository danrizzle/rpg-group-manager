# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Phase 4 (Group content) COMPLETE — all 6 slices done (party sim, trinity +
Ember Forge, roster/dungeon web, boss journal, boss plans, live calls).**
Phase 5 (roster & raids) is under way on a **7-slice plan**: slice 1
(per-character task queues) has **landed** — reordered to the front after play
showed the recruits had no world presence. Next is slice 2 (raid-scale party,
engine); the raid-side design questions (raid size, slot schedule, lockouts,
loot) are still open and bind from there on. As of July 2026.

## Phase checklist

- [x] **Phase 1 — Combat sim engine** (pure module): stats, abilities, intent
      stances, mistakes/discipline, event stream, Cinder Maw (mechanic types
      1–3), Monte Carlo distributions. 27 tests.
- [x] **Phase 2 — Browser prototype (= MVP)**: intent panel, real-fight replay
      (bars + log, playback), training-dummy review (kill %, DPS histogram,
      TTK, mistakes). Monte Carlo in a Web Worker.
- [x] **Phase 3 — Progression**
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
- [x] **Phase 4 — Group content** (slice plan authored 2026-07-18, before
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
  - [x] **Slice 2 — Trinity kits + Ember Forge (engine).** `makeWarrior`
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
        **Landed:** class-tagged items (`Item.classes`, `itemsForSlot(slot,
        classId?)`; class-prefixed gear sets incl. `-resist` variants),
        `model/comp.ts` (`applyComp`/`unlockedGroupCds`) + Battle Shout &
        Well-Drilled Team content, `model/dungeon.ts` + Ember Forge, CLI
        `--encounter <forge-whelps|slagmaw|vulkan> --pgear <tier> --pdisc
        --pcons`, party death events carry `killedBySource` (party-only
        meta — solo streams untouched). Divine Hymn rides a `heal-cd` tag:
        the auto policy holds it for ≥35% average party deficit, plans/
        calls will fire it deliberately. 15 new tests (107 green); all 7
        solo CLI baselines still byte-identical. Balance below.
  - [x] **Slice 3 — Roster + dungeon (web).** Recruits: first Cinder Maw
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
        **Landed:** `pullEncounter` (linear encounter gate, party assembly
        via `applyComp`, shared-bank slot resolution `resolvePartySlots` in
        party order, per-char consumption from the stream capped by shared
        stock), `FightState` gains `party`/`pack`/`encounterId`; replay
        layer + `buildLog` rewritten around a `ReplayConfig{players,boss?,
        pack?}`; FightView renders N player frames with role labels + cast
        bars, pack enemies, per-char review line, wipe line names the last
        death. DungeonPanel (sealed-door hint pre-unlock; per-encounter
        last/best + cleared chips). CharacterPanel switcher; recruits get
        stance/potion/gear (class-filtered)/consumable slots; Elara's gear
        picker now class-filtered too. Persist v6 migration verified in
        isolated contexts: v5+cinder-maw-kill → recruits + backfilled flag,
        v5 without → sealed door, real save migrated cleanly (v6, all data
        intact, stashed to scratchpad first). Full dungeon cleared
        in-browser (whelps 0:22, Slagmaw 4:04 with 153 priest HPS, Vulkan
        3:42); flask consumed from shared stock; out-of-stock slot skipped
        ("Used: no consumables"); solo Cinder Maw pull byte-path re-verified.
  - [x] **Slice 4 — Boss journal + discovery + familiarity (engine + web).**
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
        **Landed:** `model/journal.ts` — knowledge = monotone set of
        `mechanicsOf(def)` keys (timeline:<id> / movement / enrage / adds /
        tantrum; no-op slots don't count, retuned defs auto-prune stale
        keys) + lowest-boss-HP + attempts; `discover` is stream-only,
        `redactBoss` no-ops the unseen (full knowledge reproduces the true
        fight byte-for-byte — tested); `familiarityBonus` = min(20, 2·
        attempts) discipline. Web: `journal`/`familiarity` persisted (v7),
        pullEncounter folds discovery + wipe note (killedBy + who died) and
        bumps familiarity for all three; JournalCard in DungeonPanel (✓
        rows with def numbers, ? ——— rows, ⚰ line, familiarity chips);
        dummy sim: dungeon bosses join the target row once attempted,
        worker builds the trinity and runs `redactBoss` (SimRequest.
        encounter carries roster+knowledge+familiarity); `simIsStale`
        rewritten as whole-request comparison. 10 new tests (117 green).
        In-browser: Slagmaw wipe at 2:38 produced "67% explored, ✓ eruption
        ✓ movement, ? ———, ⚰ melee killed Seren, +2 discipline each"; party
        dummy sim showed 84.5% "(known mechanics only)".
  - [x] **Slice 5 — Boss plan timeline + group CDs + hold DPS (engine +
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
        **Landed:** `model/plan.ts` (PlanTrigger pull/time/bossCast/phase/
        bossHpBelow × PlanAction ability/stance/holdDps + `TimedCall` +
        `sanitizePlan`), `sim/planRunner.ts` (reaction-time-delayed
        execution, fizzle-on-cooldown, `planAction` stream events; NO extra
        RNG — reaction time is deterministic, so no fork needed), Fight
        hooks (`noteBossCast`, phase hooks, fire-once HP triggers), per-char
        `holding` gates damage abilities + burst in the decision brain;
        `save-for-plan-window` now real (auto-burst suppressed, plans/calls
        fire bursts). **Calls are engine-complete** (timed plan actions;
        past-identity property tested: appending a call changes nothing
        before its moment) — slice 6 is web-only. **Vulkan redesigned into
        the hold-DPS showcase** (see balance below): 25% execute phase,
        wave cadence == blast cadence (45 s) so the entry moment phase-locks
        every later overlap. Web: plans persisted (v8), PlanPanel editor
        (journal-gated triggers, curated action palette incl. Battle Shout /
        Divine Hymn / Shield Wall / bursts / target switches / Stop-Push),
        pull + dummy sim run the sanitized plan, PLAN/CALL lines in the
        combat log, Elara's Burst-CD intent selectable at L7. 9 new tests
        (126 green); all 7 solo baselines byte-identical. Verified
        in-browser: plan built in the editor → persisted → "PLAN — Push!"
        in the live log → kill.
  - [x] **Slice 6 — Live calls + tactical pause + call→plan adoption
        (web-only; engine shipped in slice 5).** Dungeon pulls run in **live
        mode**: playback locked to the frontier (`frontierMs`, a transient
        top-level clock field tracked in the RAF loop) — the scrubber can't
        seek ahead and the End button is hidden until the fight resolves once;
        the existing Pause button is the tactical pause. A **3-button call
        palette** (GDD §8 Law 1) rides above the playback bar while live and
        unresolved: "All CDs now!" (warrior battle-shout + mage combustion +
        pyroclasm), "Heal CD now!" (priest divine-hymn), and a stateful
        "Stop damage!"/"Push!" toggle (holdDps). Buttons enable only at the
        live edge (`|frontierMs − playT| < 200`), so a rewound view can't
        rewrite already-watched events. Issuing a call appends
        `{atMs: frontierMs, action}` to `fight.calls` and re-runs `runFight`
        with the same seed/party/plan + the appended call, replacing
        `fight.result` while keeping `playT`/`frontierMs` and resuming —
        engine purity guarantees every event before `atMs` is byte-identical
        (verified in-browser: log up to the call moment unchanged, only the
        future diverges). **All party recording is deferred** from pull time
        to a new `finalizeFight` action (fires from the `view.ended` effect on
        kill OR wipe, guarded by `fight.finalized`): attempts/last-best,
        consumable deduction, journal `discover`, familiarity +1, and the
        watched-kill encounter unlock — so live-call re-runs never
        double-count (measured: familiarity +1, not +N, across a re-run).
        Solo pulls keep the legacy eager path untouched (no calls, End button,
        free scrub). **Post-fight adoption** (§3 ground rule 2): the review
        lists the calls made with per-call **Adopt** + "Adopt all"; `adoptCall`
        anchors each to the nearest DISCOVERED boss `castEnd` within 8 s before
        the call (→ `bossCast` trigger), else a `time` trigger, and appends to
        `plans[encounterId]`. No engine changes; no persist bump (FightState
        is transient; `frontierMs` not in the allowlist). **Landed:**
        `store.ts` — deferred `pullEncounter`, `issueCall`/`finalizeFight`/
        `adoptCall`, `frontierMs`; `FightView.tsx` — frontier clock, live
        controls, call palette, `CallsAdoption`; styles for the palette.
        Verified in-browser (isolated context, real save stashed): live pull →
        pause → "Stop damage!" (past byte-identical, CALL line, toggled to
        Push!) → the live-edge guard blocked a call after rewind → wipe
        recorded once (no unlock) → clean re-pull with "Heal CD now!" after an
        eruption → kill 4:29 unlocks Vulkan → adopt → bossCast(molten-eruption)
        → divine-hymn plan entry → next pull fires "PLAN — Seren: Divine
        Hymn!"; solo Cinder Maw unchanged. All 126 engine tests green; web
        typecheck + build clean.
- [ ] **Phase 5 — Roster & raids** (slice plan authored 2026-07-18, before
      any phase-5 code; same cross-cutting gates as phase 4: engine before
      web inside every slice; byte-identity for all existing streams when new
      args are absent; CLI `--json` baselines captured pre-change and
      byte-compared — the 3-char dungeon streams join the 7 solo baselines).
      Scope is fixed by **GDD §8 Law 1's Raid row — exactly three new
      player-facing systems: full call palette, loadout library, tank
      swaps** (affixes/Mythic stay invisible); everything else in this phase
      is machinery underneath those three. Law 2 applies throughout: tank
      swaps, dispels and a 20-char roster all need working auto behavior.
      **Open design questions are logged below the slice list — several are
      GDD gaps phase 5 must invent and should be back-filled into DESIGN.md.**
  - [x] **Slice 1 — Roster world presence: per-character task queues (web,
        persist v9). ← LANDED (reordered to the front 2026-07-18).**
        **Found in play:** killing Cinder Maw grants Borin + Seren, but the
        world loop still models exactly ONE traveling character — `queue` is a
        single global `Task[]`, `region` a single global position, and
        `BaseTask` carries no `charId`. Queuing "send Borin to gather" just
        appends to Elara's one serial queue, so the recruits are inert outside
        dungeons and stacked travels silently cancel each other out. This
        contradicts the GDD's core mid-game pillar — §2 "Division of labor:
        one fights, one farms/crafts" and §5's task-queue mock, which shows
        three characters running **parallel** chains (gatherer / crafter /
        fighter). It is a phase-3 artifact: the world loop was built when
        there was one character, and phase 4 generalized only the *dungeon*
        path. **Scope:** `charId` on every task; per-character position;
        `advanceWorld` folds N independent queues in parallel (same pure
        reducer, same offline catch-up + "while you were away" summary);
        per-character grind rates (each character has their own gear/level,
        so `rateKey`/`rateCache` become per-character); a queue strip per
        character and a character target on the region-card actions. Folded
        in (was slice 5): the uniform `characters{}` record replacing Elara's
        legacy top-level fields + the `roster` split, so this migrates the
        character model **once** rather than twice. Caveat that makes this
        the risk slice: `RosterBuild` has **no `behavior`, no `talents`, no
        `xp`** (recruits are hardcoded to `DEFAULT_BEHAVIOR.discipline` and
        level 10), so a uniform record is not a rename — it needs those
        invented, or the asymmetry kept behind uniform selectors until the
        loadout slice needs per-class talents. Touches ~8 components
        (`RosterCharacterPanel` is the template), `buildSimRequest`'s `Pick<>`
        list, both pull paths, and the worker's parallel `SimRequest` shape.
        Slots arrive via progression milestones, never purchase (§2) — the
        base must NOT get a barracks. Reordered ahead of the engine slices
        because they are independent of it, it is player-visible today, and
        slice 4's tank swap needs ≥2 tanks (i.e. this generalization) anyway.
        **Landed:** `WorldCharId`/`WORLD_CHARS`/`CharWorld` in `world/types.ts`
        (keyed by engine class id so it lines up with `familiarity` and
        `PlanAction.charId`); `charId` on `BaseTask` and `AwayEvent`;
        `chars: Record<WorldCharId, CharWorld>` replaces the single
        `queue`/`region`. **`advanceWorld` is untouched** — a new `advanceAll`
        wrapper folds the SAME `elapsedGameMs` through each character's queue
        in the fixed `WORLD_CHARS` order, threading the shared bank from one to
        the next so the capacity clamp stays deterministic (without a fixed
        order, live ticks and offline catch-up could disagree). All four
        enqueues + `requestGrindRates` take a `charId`; `cancelTask` scans
        lanes by id (ids are unique roster-wide). Per-character grind rates:
        `rateKey` gains a leading char discriminator and `GrindRequest.charId`
        dispatches the worker to `makeWarrior`/`makePriest`/`makeMage` — Borin
        and Elara in the same zone are genuinely different rates.
        `useCharBuild(charId)` is the uniform build selector phase 4 promised
        but never wrote (each field selected separately so subscriptions stay
        reference-stable). UI: one queue lane per hero with an acting-character
        picker (`activeWorldChar`, shared by the World map and the Base
        alchemy panel), away-summary lines attributed ("Borin: Gathered 40
        timber"). Persist v9 via the unconditional-backfill pattern: the
        pre-v9 single queue + position migrate onto Elara verbatim and the
        recruits start idle beside her. Verified in-browser: v8→v9 kept a
        4-task queue with head accrual intact; three heroes gathered three
        different materials **simultaneously** (timber/sunleaf/emberbloom all
        rising in one tick); offline catch-up folded all three lanes with
        per-character attribution; dungeon pull unaffected; console clean.
        **v1 simplifications** (recorded, not bugs): grind XP credits Elara
        only — recruits arrive at the level cap so a shared pool would just
        inflate her level; recruits still have no behavior/talents/xp of their
        own (class defaults + level 10 behind `useCharBuild`), so the full
        `characters{}` **build** migration moves to slice 6 where per-class
        talent trees make it meaningful; and nothing interlocks world tasks
        with dungeon pulls — you can pull while heroes are mid-travel, which
        matches the pre-existing behaviour that pulls never checked location.
  - [ ] **Slice 2 — Raid-scale party (engine).** `MAX_PARTY_SIZE` 5 → 20
        (`sim/engine.ts`; the ceiling test in `test/party.test.ts` asserts a
        6-member party throws — it must move, this is not a bare constant
        bump). The constant is trivial; the *tuning coupling* is the slice:
        effect `target: 'party'` returns every living char, so a group heal
        balanced for 3 becomes 20× throughput — needs a bounded variant
        (`{kind:'group'; maxTargets}`); heal threat feeds EVERY living enemy
        at 0.5×, so 3–5 healers bury tank threat; per-character movement-fail
        rolls make "someone stands in fire" a certainty rather than a risk at
        20 (needs a fails-≥N tolerance); and the healer AI averages deficit
        over all allies (`sim/decision.ts`), so one dying tank barely moves a
        20-pool average — role-weight it. Byte-identity for every solo +
        3-char stream. No web work.
  - [ ] **Slice 3 — Mechanics as a list + boss-applied debuffs + enemy cast
        windows (engine).** `BossDefinition` is today a flat record of
        singleton mandatory fields (one `movementWindows`, one `addPhase` —
        Slagmaw disables adds with `atHpPct: 0`), and `installBoss` is a
        hardcoded function, not a registry. Refactor to
        `mechanics: Mechanic[]` (discriminated union) with types 1–3
        re-expressed as data and **all three existing bosses byte-identical**;
        update the `redactBoss` journal-redaction path + `sim/bosses.ts`.
        Add the missing boss→player path: `TimedBossAbility` gains an optional
        `applies: BuffEffect` + target mode (`current-tank`/`random`/`all`) —
        today `bossScript` can't touch `Actor.applyBuff` at all (the tantrum
        "buff" is a cosmetic event with the real effect in a closure). Add
        enemy **cast windows** (`castStart` + a real cast duration; today the
        boss emits a bare `castEnd` with nothing to interrupt) — the
        prerequisite for interrupts, deferred here from phase 4. Doing this
        refactor BEFORE authoring tier-2 content is the whole point of the
        slice ordering.
  - [ ] **Slice 4 — Type-4 machinery: stacking debuffs, taunt, dispel,
        interrupt (engine).** GDD §4 type 4 = tank-swap debuffs (hard comp
        requirement: 2 tanks), mandatory dispels, absorb shields — raid only.
        `applyBuff` currently **refreshes rather than stacks**, which makes the
        canonical tank-swap design structurally impossible: add
        `ActiveBuff.stacks` + `maxStacks` + per-stack `damageTakenMult`.
        Taunt is a genuine engine change (`addThreat` is private, `pickTarget`
        recomputes top threat every swing with no stickiness): add a
        `{kind:'taunt'}` effect + a `forcedTarget` window consulted in
        `pickTarget`, plus a `targetChanged` event — **threat is currently
        invisible in the stream, so without it a tank swap is unobservable
        gameplay.** Dispel: `{kind:'dispel'}` effect + `Actor.removeBuff` (no
        such method today) + a `dispelType` category on `BuffEffect` +
        `buffRemoved`. Absorb already exists (`BuffEffect.absorb`) — verify at
        raid scale. Auto policies for both (Law 2). **Pre-work: fix the
        latent `sanitizePlan` fall-through** — after the `holdDps`/`ability`
        early returns it reads `action.patch` unguarded, so any new action
        kind throws on every persisted plan; `describe` in `planRunner` has
        the same unguarded fallback.
  - [ ] **Slice 5 — Battle res + retreat (engine + web).** Per ground rule 1
        these are the *only* two calls needing engine work beyond effects.
        **Battle res** is `{kind:'ability'}` with a new `resurrect` effect:
        `Actor.alive` is one-way today (nothing flips it back, and `heal()`
        would raise HP on a corpse leaving `alive === false`), so add
        `Actor.resurrect(hpPct)`, a `deadChars()` selector, a `resurrect`
        event + replay handling, and — easy to miss — **restart the revived
        character's decide loop**, which returns without rescheduling on
        death (otherwise: revived but idle forever). Scarcity (1–2/attempt,
        §3) rides the existing `Ability.chargesPerFight`. Note the fight ends
        synchronously on the last death, so a res can never be issued after a
        wipe — a design-consistent constraint worth stating in the UI.
        **Retreat** is the one genuinely new `PlanAction` kind: `FightResult`
        has no early-exit (`end()` is only reachable via kill/wipe/enrage/
        timeout), so add a `'retreat'` `FightResultKind` threaded through
        `analysis/metrics.ts`, `AttemptSummary.result` and `finalizeFight`.
        "Saves remaining consumables" is nearly free — consumption is already
        computed from the final stream in `finalizeFight` (slice 4.6).
  - [ ] **Slice 6 — Loadout library + full call palette + recruit talent
        trees (web).** Loadouts today are Elara-only, keyed by `name`, with
        no character binding, no `behavior`, and mage-only talents. Add an
        `id` + `charId`/`classId` scoping (applying a warrior loadout to a
        priest currently sanitizes gear/talents to empty — a silent bad
        failure), `behavior`, per-boss assignment, and grouping/filter UI
        (a flat list does not survive 20 chars × N loadouts). Per §4 the
        library **also holds boss plans**. Warrior/priest talent trees land
        here because loadouts are meaningless without them (deferred from
        phase 4). Full call palette (§3 catalog): the remaining offensive/
        defensive/tactical calls incl. interrupt reassignment and tank swap —
        all `{kind:'ability'}` actions, so this is content + UI, not engine.
        `PlanPanel`'s 9 hardcoded actions and `FightView`'s `ALL_CDS`/
        `HEAL_CD` literals must become **roster-derived**. Per Law 1's
        progressive disclosure, the palette unlocks incrementally — never 15
        buttons at once. Watch the respec cost: bulk-applying 20 loadouts
        must not charge 20 respecs.
  - [ ] **Slice 7 — Tier-2 raid + catalyst progression + access building
        (content + web).** The first raid, gated behind an **access
        building** (§5: "use it deliberately at raids and tier transitions" —
        the bridge is the v1 precedent, escalated to profession-made
        materials via Blacksmithing). Bosses use type-4 mechanics from
        slices 2–3, tuned to the Law-2 targets: Normal ≥ ~90% on auto plan +
        adequate gear; Heroic with a stat-proof ceiling no gear level
        rescues. Catalyst model (§6): tier-2 gear is crafted with materials
        from tier-1 content, keeping Ember Forge permanently relevant — plus
        resist gear from older regions. Group CD `requires` counts already
        scale, but `minDistinctRoles` is trivially true at raid size (only 3
        roles exist) — raid comp rules want **ratios** (≥2 tanks, ≥4
        healers). Also note the comp rule "first member of the class carries
        the CD" is an order-dependent identity check: **reordering the roster
        silently moves which character holds the raid CD and invalidates
        persisted plans referencing `charId`.**
- [ ] **Phase 6 — Guilds**: accounts/sync, server-authoritative real fights
      (Fastify + Postgres, same engine), guild bank, world bosses
- [ ] **Phase 7 — Expansion stages** (as needed): traits, council/split/soak,
      difficulty tiers, affixes, timed runs, behavior-effect uniques,
      graphical replay

## Phase 5 — autonomous design decisions

**Slice 1 (per-character task queues):**

- **`advanceWorld` kept byte-for-byte; parallelism lives in a new `advanceAll`
  wrapper.** The reducer is the world's `Replay.seek` and has no test coverage
  (all 13 test files are engine-side), so rewriting it to fold N queues would
  have been an unguarded change to the one function both the live tick and
  offline catch-up depend on. Rejected: generalizing `WorldSlice` to hold a
  queue map (touches every accrual branch).
- **Characters fold in a fixed order (mage → warrior → priest) against the
  shared bank.** Materials/inventory are one pool with a capacity clamp, so
  two heroes gathering into a nearly-full bank in the same step is
  order-dependent by nature. A fixed order makes it deterministic, which is
  what keeps the live tick and the one-shot catch-up convergent. Rejected:
  interleaved time-slicing (finer-grained, but far more machinery for a
  difference only visible at a full bank).
- **Grind XP credits Elara only.** Recruits arrive at the level cap (10 =
  MAX), so crediting a shared pool for their kills would silently inflate
  Elara's level — the one thing XP still drives. Rejected: per-character XP
  now (ripples into `levelForXp` at 6+ call sites, `talentPointsForLevel`, the
  talent panel and `GrindRequest.level` for zero v1 gain); revisit when
  recruits can level below cap.
- **World presence split from the build model.** `characters{}` was going to
  absorb Elara's legacy top-level fields in the same slice, but `RosterBuild`
  has no behavior/talents/xp, so a uniform record would have meant *inventing*
  recruit talents and XP mid-feature. Instead `useCharBuild` gives the uniform
  read the codebase always claimed to have, and the storage migration waits
  for slice 6 where per-class talent trees give it a reason to exist. The
  `chars` record is additive, so slice 6 extends it rather than re-migrating.
- **Rate cache keyed by character, not just build.** Two heroes can hold
  identical gear and still grind at different rates (different kits), so the
  class id leads `rateKey` and `GrindRequest.charId` picks the factory —
  otherwise Borin would silently inherit Elara's cached mage rates.
- **Craft tasks go on the acting character's queue** even though crafting is
  location-independent. It keeps one rule ("a task belongs to whoever you sent
  on it") and makes the crafter a real role per GDD §2. Rejected: a queue-less
  global craft lane (a second scheduling concept for one task kind).

## Phase 5 — open design questions (GDD gaps to resolve before the raid slices)

The GDD specifies phase-5 *features* but is silent on several rules the
slices depend on. Each needs a decision, and the decision should be
back-filled into DESIGN.md rather than living only here.

1. **Raid size for the first raid.** §2/§4 say only "up to 20 characters",
   never a per-encounter size. Recommendation: **raise `MAX_PARTY_SIZE` to
   20 so the engine is never the limit, but tune the tier-2 raid at 10** —
   it halves the tuning surface (see the slice-1 balance cliffs) and keeps a
   real step left for a later raid. The roster still grows to 20.
2. **Roster slot schedule.** §2 says slots are "unlocked via progression
   milestones (not bought)" and that is the entire spec. Needs a concrete
   ramp (e.g. 3 → 5 → 10 → 20 pinned to region/raid milestones). Note the
   base has no barracks and **must not get one** — a purchasable building
   would contradict the "not bought" rule.
3. **Raid lockouts / weekly resets.** The word "lockout" does not appear in
   the GDD. Combined with "no auction house, self-found" (§6) and "time
   gating sits on acquisition" (§1), the default reading is **unlimited
   attempts**. Recommendation: no lockouts in v1; revisit with guilds
   (phase 6), where shared kills already imply windows.
4. **Loot rules.** Undefined — "loot" appears only as a yes/no column in the
   sim-vs-real table. Catalyst progression (§6) is meaningless without drop
   tables, per-roster distribution, and some bad-luck protection. This is
   the largest genuine gap.
5. **Benching / roster rotation.** Never mentioned, but per-character boss
   familiarity (§2) creates an implicit anti-rotation pressure: a benched
   character is an unfamiliar one. Either accept that as intended depth or
   add a catch-up rule. Related: no character fatigue/rest system exists,
   and §3's "no recovery debuffs" argues against inventing one.
6. **Tactical pause in raids.** §3 ground rule 3 hedges — "at least in
   solo/group content". It is already built and mobile-friendly;
   recommendation: **keep it in raids** and drop the hedge from the GDD.
7. **Dispel has no call.** §4 makes dispels mandatory at raid tier and §2
   gives the priest "dispel (relevant from raid tier)", but the §3 call
   catalog contains no dispel call. Decide whether dispels are auto-only
   (Law 2), plan-assignable, or get a palette button.

## Balance state (Ember Forge, phase-4 slice 2)

Trinity = Warrior + Priest + Mage via `applyComp` (Battle Shout at pull,
Well-Drilled +5 discipline). `--n 400`, seed 42, CLI stance defaults
(offense 0.6, targeting 0.5, potion <35%), no plan (slice 5 adds plans):

| Encounter | Setup | Kill rate | Note |
|---|---|---|---|
| Forge Whelps | default | 100%, ~0:25 | trash = time cost, tank AoE-threat check |
| Slagmaw | default | **97.5%** | Normal law holds; deaths = eruption+surge stacking |
| Slagmaw | starter | 62.7% | the gear wall |
| Slagmaw | starter + ward,potion each | **93.8%** | preparation buys earliness (§6) |
| Slagmaw | resist sets | 99.5% | fire-resist chests are the gear answer in anger |
| Vulkan (slice-5 redesign) | default, no plan | **96.3%** | Normal law holds |
| Vulkan | default + hold plan | 97.3% | plan is a bonus, not the ticket in (Law 2) |
| Vulkan | starter, no plan | 60.0% | the entry-timing lottery (28% kill in the death valley vs 75–78% outside — measured over 600 runs) |
| Vulkan | starter + hold plan | **83.0%** | **knowledge buys the early kill** (§2): hold at 28%, push on Forge Blast |
| Vulkan | starter + hold at 30% (wrong threshold) | 49% | plan precision is the depth — sweep thresholds for free on the dummy |

Slagmaw numbers: hp 62k, melee 300/2.0s phys, Molten Eruption 700 fire
party-wide /35s, surges 420, enrage 6:00 (backstop; TTK ~4:22).
Vulkan (slice-5 redesign): hp 55k, melee 120/2.1s, Forge Blast 700 fire
party-wide /45s (first 30s), **execute phase at 25%**: 3× Molten Sentry
(1.1k HP, 85 phys/1.8s) per wave, **waveEveryMs 45s == blast cadence** —
the gap between phase entry and the next blast repeats every cycle, so
entering just after a blast keeps every wave in a calm window while
pushing in blind can lock EVERY wave onto a blast (fresh sentries chew
the healer via heal aggro, the blast finishes her). Tantrum ×1.7 after
25s. Slagmaw's knowledge lever is journal-informed preparation (wards)
plus heal-CD micro (+1%); Vulkan carries the plan showcase.

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

## Phase 4 — DONE (slice 6 landed; handoff below kept for the record)

**All six slices are landed and committed (one commit per slice), all green
(126 engine tests; web typecheck + build; solo CLI baselines byte-identical
throughout).** Slice 6 (live calls) shipped web-only per the handoff — the
original spec is preserved below for provenance.

1. **Live mode for dungeon pulls**: playback locked to the frontier (no
   scrubbing/seeking ahead, no End button until the fight resolves once),
   tactical pause = pause button (already exists).
2. **Call palette** (2–3 buttons, Law 1): "All CDs now!" (battle-shout +
   combustion + pyroclasm ability actions for their owners), "Heal CD
   now!" (priest divine-hymn), "Stop damage!/Push!" (holdDps toggle).
   Issuing a call at playT: append `{atMs: playT, action}` to the fight's
   call list and re-run `runFight` with the same seed + calls (store
   needs to keep the pull's inputs — party defs are in FightState.party;
   ALSO keep the plan + setup so the re-run is exact). Events before the
   call moment are guaranteed identical (tested in plan.test.ts), so
   replace fight.result, keep playT, resume.
   Careful: consumable deduction and journal/familiarity/attempts were
   already recorded at pull time — on re-run, RECONCILE: recompute
   potion-charge consumption + journal from the FINAL stream (store the
   pre-pull inventory/journal snapshot in FightState, or defer all
   recording until the fight is watched/ends — deferring is cleaner and
   matches the "watched kill unlocks" pattern).
3. **Call→plan adoption** (§3 ground rule 2): in the post-fight review,
   list `planAction` events with `origin: 'call'`; "adopt" converts each
   to a plan entry — anchor to the nearest DISCOVERED bossCast within
   ~8 s before the call, else a `time` trigger at its atMs; append to
   `plans[encounterId]`.
4. STATUS: mark slice 6 + phase 4 complete, walkthrough + migration
   check (no schema change expected — plans/journal already exist; bump
   only if FightState persistence changes, which it should NOT — fight
   stays unpersisted).

Known seams: `FightView` gates `recordBossKill`/`recordEncounterCleared`
on `view.ended === 'kill'` — in live mode that effect must fire only when
the frontier reaches the end naturally. `pullEncounter` currently records
attempts/journal/consumption eagerly at pull time (see #2). The engine's
`planAction` meta carries `origin`/`kind`/`charId`/`abilityId`/`hold` —
everything adoption needs.

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

**Slice 2 (trinity kits + Ember Forge):**

- **Battle Shout requires 1 warrior, not the GDD's "2× warrior" example**
  — comp rules are sized to the 3-char v1 roster (there is exactly one
  warrior to bring). Rejected: literal 2-warrior requirement (dead
  content until phase 5). Arcane Convergence (priest+mage resource
  refill) is **not shipped** — v1 has no resource system to refill;
  revisit with phase-5 comp depth. Well-Drilled Team (3 distinct roles →
  +5 discipline each) ships as the third GDD example.
- **Divine Hymn is an on-GCD emergency heal under the auto policy**
  (scored only at ≥35% average party deficit, then it beats everything)
  rather than plan-only. Law 2: defaults must work without a plan; plans
  and calls will fire it deliberately for more value. Rejected: plan-only
  (defaults would waste the kit) and always-scored (wasted on scratches).
- **New classes never get the legacy free kit potion** — their
  `consumables` default is `[]` (crafted-economy semantics from birth).
  The free potion is a mage-only backward-compat artifact.
- **Vulkan's hold-DPS pressure is emergent from tuning** (HP-triggered
  adds + timed blast overlap), not a new mechanic type — the machinery
  stays types 1–3 as §4 requires for the starter dungeon. The "mechanic
  type upgrades" checklist item = group-aware upgrades: timeline
  abilities hit the whole party, movement windows roll per character,
  adds spawn onto healer aggro.
- **Dungeon trash gives 0 XP** (`xpPerKill: 0` on Forge Whelps) — party
  members are at cap and dungeon reward loops (loot) are phase-5 scope;
  trash is a time/consumable cost, not a farm. Rejected: XP-bearing
  trash (nothing to spend it on at cap 10).

**Slice 5 (boss plan + group CDs + hold DPS):**

- **Vulkan was redesigned around a phase-locked overlap** after MC
  diagnosis showed the original "50% add phase + drifting blast timer"
  made hold-DPS worthless (overlaps recurred regardless of entry timing;
  holding was pure attrition — plan made things WORSE, 46→43%). Fix:
  execute phase at 25% + wave cadence equal to blast cadence, which makes
  the entry moment decide the whole endgame. Measured: entries 10–20 s
  after a blast kill 28%, entries 0–10 s kill 75%. Rejected: new engine
  mechanics (e.g. scripted "overlap" abilities) — the interplay is pure
  tuning on existing types 1–3, as §4 demands.
- **The hold plan's threshold sensitivity (28% → +23 pts, 30% → −11 pts)
  is kept as the depth**, discoverable for free on the dummy (plans run
  in the sim vs the redacted boss). The HP-step list in the editor is
  deliberately fine-grained near the phase. Rejected: softening the
  valley until any threshold works (would flatten the only deep
  knowledge lever in the dungeon).
- **Plan execution adds no RNG** — reaction time is a deterministic
  function of discipline, so live-call re-runs (slice 6) reproduce the
  past exactly; a mistake roll on plan compliance was rejected (it would
  perturb the main RNG stream and add variance where §3 wants levers).
- **Plan actions are a curated palette** (9 options) rather than a free
  char × ability × stance matrix. Sanitized against the real party at
  pull/sim time either way. Rejected: full matrix UI (list-maintenance
  feel the GDD explicitly bans).
- **`bossHpBelow` triggers are always available** (boss HP is on the bars
  from pull one); journal knowledge gates cast/phase triggers only.
- **Live-call machinery landed engine-side this slice** (TimedCall =
  plan action at a moment; past-identity property under appended calls
  is tested) so slice 6 is purely web work.

**Slice 4 (journal + discovery + familiarity):**

- **World bosses (Cinder Maw, zone bosses) are grandfathered as fully
  known** — no journals for them; their dummy sims stay unrestricted.
  They predate the journal system and are already balanced around free
  simulation. Rejected: retrofitting journals (would lock existing sims
  behind attempts and break the phase-2/3 loop).
- **Familiarity = bonus discipline** (min(20, 2/attempt)) rather than a
  new behavior stat: discipline already drives exactly what §2 says
  familiarity improves (mistake rate + reaction time), and it composes
  with calls in slice 6 for free. Rejected: a parallel per-boss mistake
  multiplier (second tuning surface, no new player-visible meaning).
- **Journal timers/numbers display the TRUE def values once a mechanic
  is seen** (one glimpse of Molten Eruption reveals "every 35 s, 700
  fire"), rather than estimating from observed samples. Jittered timers
  make observed averages noisy-wrong, and §4's journal mock shows exact
  timers. The `discover` API stays stream-only; only presentation reads
  the def.
- **Familiarity is keyed per character** (`familiarity[charId][bossId]`)
  even though v1 parties always attempt together — phase-5 roster swaps
  will diverge the counts; storage shape shouldn't need migrating then.
- **The dummy sim's boss-HP bar is fully known from attempt 1** (hp is
  visible in the fight UI), so `redactBoss` keeps hp/melee — only
  mechanics are hidden.

**Slice 3 (roster + dungeon web):**

- **Dungeon progress is a persistent linear unlock** (clear an encounter
  once, the next opens forever; everything stays re-pullable). Rejected:
  per-run reset (a run lifecycle needs a reward loop — loot lockouts —
  to justify it; that's phase-5 scope).
- **Dungeon encounters are pulled from the map panel with no travel
  cost** — matching the existing zone-boss Challenge buttons, which also
  skip travel. Rejected: requiring a queued travel to Cinder Wastes
  first (would be the only travel-gated fight in the game; unify travel
  costs for ALL fights in one later pass instead).
- **Recruits' earned stats are fixed at class defaults (discipline 50)**
  — no dev-override sliders for them; Elara keeps hers as the tuning
  probe. Familiarity (slice 4) becomes the recruits' earned-stat axis.
- **Party consumable slots claim shared bank stock in party order**
  (warrior → priest → mage) at pull time; short slots are skipped
  silently (same sanitize-not-block rule as solo pulls). Rejected:
  blocking the pull on shortage (a pull must never throw) and per-char
  reserved stock (inventing an allocation UI nobody asked for).

**Slice 6 (live calls + tactical pause + call→plan adoption):**

- **All party recording deferred to fight end (`finalizeFight`) rather than
  a pre-pull snapshot.** A live call re-runs `runFight`; recording eagerly at
  pull time (as slices 3–5 did) would double-count consumables and
  familiarity on every re-run. The handoff floated two fixes — snapshot the
  pre-pull inventory/journal on FightState, or defer everything to the end.
  Deferring is cleaner (no snapshot bookkeeping) and matches the existing
  "watched kill unlocks" pattern, which was already deferred to the
  `view.ended` effect. **Rejected:** the pre-pull snapshot (more state to
  thread, and the eager writes still have to be undone on re-run).
- **Solo pulls stay on the eager path, untouched.** Only party/dungeon pulls
  go live (calls are a dungeon feature), so `finalizeFight`/frontier-lock/
  palette all gate on `fight.live`. Zero risk to the real save's solo Cinder
  Maw flow. **Rejected:** unifying solo + party onto the deferred path (churn
  on the byte-stable solo path for no feature gain).
- **Frontier lock via a transient top-level `frontierMs`** (max playT ever
  watched), advanced in the RAF clock; scrubber `max = resolved ? durationMs
  : frontierMs`, End button hidden until resolved. **Rejected:** a separate
  `resolved` boolean stored on the fight (derivable as `frontierMs >=
  durationMs`, and re-runs that lengthen the fight keep it correct for free).
- **Calls fire at `atMs = frontierMs`, and buttons enable only at the live
  edge (`|frontierMs − playT| < 200`).** Anchoring the call to the live
  frontier (not the possibly-rewound `playT`) guarantees the past-identity
  precondition — everything before the frontier was already watched and is
  byte-identical under the appended call. **Rejected:** `atMs = playT` with
  free rewind (a call issued in the past would rewrite events the player
  already saw; the property test only guarantees identity strictly before
  `atMs`). Verified in-browser: after a rewind, the palette correctly
  disabled.
- **Adoption anchors to the nearest DISCOVERED boss `castEnd` within 8 s
  before the call, else a raw `time` trigger.** Reuses the journal's
  `seen` set so only known casts become triggers (matches the PlanPanel's
  journal-gated triggers); 8 s covers a reaction-delayed call landing just
  after a cast. **Rejected:** always a time trigger (loses the "you reacted
  to Molten Eruption" intent that makes the plan legible) and anchoring to
  undiscovered casts (would leak knowledge the journal law hides).
- **"All CDs now!" includes Pyroclasm** (talent-gated) alongside battle-shout
  and combustion; it fizzles harmlessly in the engine if the mage lacks the
  talent, so no per-party palette customization is needed. **Rejected:**
  filtering the call's actions against the live party (the engine already
  no-ops missing abilities; filtering would duplicate `sanitizePlan`).

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
