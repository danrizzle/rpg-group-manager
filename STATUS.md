# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Phase 4 (Group content) COMPLETE — all 6 slices done (party sim, trinity +
Ember Forge, roster/dungeon web, boss journal, boss plans, live calls).**
**Phase 5 (roster & raids) COMPLETE — 13 slices** (the original 7-slice plan
plus 8–13, which finished slice 7's deferred web work). `MAX_PARTY_SIZE` is a
hard 10 with the four size cliffs fixed; `BossDefinition` is a
`mechanics: Mechanic[]` list; the type-4 stack (stacking tank-swap debuffs,
taunt, dispel, interrupt, cast windows) is built and auto-answered; battle res +
retreat work; every character shares one uniform build model; the roster grows
past 10 via milestones and you pick who raids; and the first 10-man raid
(**Cinderforge**) is playable in the browser with its own access gate, catalyst
economy and loadout library. Every solo + trinity stream stayed byte-identical
throughout. **Next: phase 5.5 — a real, mobile-first game UI** (user direction:
the current interface is "an HTML data calculator"), then phase 6 (guilds).
As of July 2026.

**PHASE 5 COMPLETE (2026-07-19).** PR #1 was verified post-merge (details in
"Phase 5 — post-merge verification"), then the deferred web work landed as
**slices 8–13**: the uniform character model, roster growth, the Warcamp access
gate, the Cinderforge raid UI, the catalyst economy and the loadout library.
**The raid is playable end to end** — build a roster past 10, pick the ten who
go, kill Ashkar and Vael with role-grouped frames and auto tank swaps, earn
catalysts, craft raid consumables, and assign loadouts per boss. **166 engine
tests green; both typechecks + web build clean; all 8 CLI streams
byte-identical vs `c9ef804` throughout.** Persist ran v10 → **v15**.

**Call palette — GDD §3 (2026-07-23).** The live-call palette went from 3 hard-
coded buttons to the **full backed catalog (10 calls), grouped by §3 category**
(Offensive / Defensive / Tactical / Meta): All CDs · DPS to AoE · Focus fire ·
Heal CD · Everyone defensive · Tank swap · Take the kicks · Battle res · Retreat
· Stop damage/Push. UI-only — a new `apps/web/src/components/callCatalog.ts` is
the single source both the palette and the plan editor derive from (`CALL_TAGS`
shared, so the two can't drift). **Engine untouched → byte-identity holds by
construction; 166 tests + both typechecks + web build green.** The four calls
that need engine systems this game doesn't have yet are the **next slice** (see
below). Convention added this slice (CLAUDE.md + HANDOFF.md): **always write a
handoff prompt for the next slice.**

**Still owed, none blocking:** the raid **balance retune** (Normal ≈ 90% + a
Heroic variant — currently ~100% at default gear, and the TTK distribution is
too tight for a clean enrage wall without survivability variance; engine-only,
worth doing before world-boss tuning inherits its conventions) and the **rest
of the GDD §3 palette** — Dodge!, Healers save mana!/Pump!, the heal-CD *chain*,
and "Below 20%: everything out + potions" — each needs new engine machinery (a
movement-phase model, a mana economy, chain/compound calls), so it's its own
slice, not palette wiring.

**Deferred by decision, not oversight** (user, 2026-07-19): **loot rules** stay
out of scope until they get real design work — every reward remains
deterministic, as phase 5 established. **Crafted gear** likewise: §6 frames
catalysts around tier-2 weapons, but that requires introducing gear
**ownership**, which retroactively gates every item currently free-pick in the
dropdowns.

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
- [x] **Phase 5 — Roster & raids** ✅ (slice plan authored 2026-07-18, before
      any phase-5 code; same cross-cutting gates as phase 4: engine before
      web inside every slice; byte-identity for all existing streams when new
      args are absent; CLI `--json` baselines captured pre-change and
      byte-compared — the 3-char dungeon streams join the 7 solo baselines).
      **Raids are 10-man** (resolved 2026-07-18; the GDD's "up to 20" in §2/§4
      is superseded and owes an amendment). Scope is fixed by **GDD §8 Law 1's
      Raid row — exactly three new player-facing systems: full call palette,
      loadout library, tank swaps** (affixes/Mythic stay invisible); everything else in this phase
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
  - [x] **Slice 2 — Raid-scale party (engine). ← LANDED.**
        `MAX_PARTY_SIZE` 5 → **10** (raids are 10-man); the ceiling test moved
        6→**11**. The constant is trivial; the *tuning coupling* was the slice —
        10-man softens every cliff without removing any, so each got a fix
        shaped to reduce to today's behavior at ≤5 (byte-identity). Tuned
        against the canonical **2 tanks / 3 healers / 5 dps** comp.
        **Landed:**
        1. **Bounded group heal.** New `HealEffect.target`
           `{kind:'group';maxTargets}` (`model/ability.ts`); a shared pure
           `selectGroupIndices` (`sim/decision.ts`) picks the maxTargets
           most-hurt living (tanks role-weighted in), emitted in **party
           order**, and is used by both `healTargets` (resolution) and the
           decision scoring (so score and heal never diverge). At ≤ maxTargets
           living it returns every member in party order = the old whole-party
           heal. Priest `circle-of-healing` + `divine-hymn` → `maxTargets 5`.
        2. **Heal-threat clamp** (`pickTarget`): size-gated — for parties **> 5**
           only, a non-tank's effective threat on an enemy is capped at the top
           living tank's threat there (0 ⇒ uncapped, so fresh-add aggro drama
           survives). Never runs for any ≤5 party ⇒ existing streams unchanged
           by construction. Rejected a read-time cap keyed on tank threat (t=0
           zero-cap flips the trinity's early stray healer-swing) and lowering
           `HEAL_THREAT_COEFF` (can delete a stray swing in one MC seed).
        3. **Movement fail tolerance.** Optional `movementWindows.maxSafeFails`
           (`model/boss.ts`); `bossScript` rolls every char first (unchanged RNG
           order) then punishes only failures **beyond** the tolerance. Absent =
           0 = every failure punished (byte-identical). No existing boss sets it.
        4. **Healer-AI role weight.** `AllyView.role`; role folds only into the
           group-heal **subset selection**, not `lowest-ally`, not the score
           magnitude — a pure no-op when all fit (trinity).
        CLI: additive **`--raid`** tuning mode assembles the 2/3/5 comp
        (unique ids remapped past `makeX`'s hardcoded id, tanks first) — the
        only 10-man path; `--encounter` trinity path untouched.
        **6 new tests** (10-man runs; 2 tanks hold vs 3 healers; group heal ≤5
        & binds at 10; raid determinism; per-character RNG independence; fail
        tolerance) → **132 green**. **Byte-identity verified**: all 7 solo + 3
        trinity `--json` baselines AND full trinity event streams (5 seeds ×
        3 encounters) diff-identical before/after; Ember Forge holds its Law-2
        numbers (Slagmaw 97.5%, Vulkan 96.25% at `--n 400`). Web untouched
        (typecheck + build clean). Balance below.
  - [x] **Slice 3 — Mechanics as a list + boss-applied debuffs + enemy cast
        windows (engine + minimal web). ← LANDED.** `BossDefinition`'s four
        singleton slots (one `timeline`, one `movementWindows`, one `addPhase`,
        enrage) → **`mechanics: Mechanic[]`** (discriminated union: `enrage` /
        `timeline` / `movement` / `adds`), any count of each — raid bosses need
        multiple windows/phases. **Landed:**
        1. `installBoss` walks the list grouped by kind in a FIXED order
           (melee → timeline[] → movement[] → enrage → adds), so the
           `fork('boss')` jitter draws land in exactly the pre-list order → all
           **5 bosses byte-identical** (proven: 11 `--json` baselines + full
           trinity streams across 5 seeds diff-identical; Ember Forge holds
           Slagmaw 97.5% / Vulkan 96.25%). `mechanicsOf`/`discover`/`redactBoss`
           rewritten over the list, **same persisted key strings** (`timeline:<id>`,
           `movement`, `enrage`, `adds`, `tantrum`); accessors
           (`timelineMechanics`/`movementMechanics`/`enrageMechanic`/`addsMechanic`,
           + `withEnrageAt` tuning helper) are the one place that walks the union.
        2. **Boss-applied debuffs** (`TimelineMechanic.applies?: BossDebuff` with
           `target: current-tank|random|all`): new `Fight.applyBossDebuff`
           mirrors the character buff branch but boss-sourced
           (`buffApplied`/`buffExpired`, source `BOSS_ID`); `damageTakenMult`
           feeds `takeDamage` — the tank-swap lever (stacking is slice 4).
           Absent = no events, no draws.
        3. **Cast windows** (`TimelineMechanic.castDurationMs?`): `castStart` →
           wait → `castEnd` + effect; `noteBossCast` stays at the resolution
           site so `bossCast` plan triggers fire unchanged. Absent = instant, no
           `castStart` (byte-identical).
        **Web:** the 4 components that read flat boss fields
        (`DungeonPanel`/`PlanPanel`/`replay`/`FightView`) swapped direct reads
        for the accessors — mechanical, no behavior change (typecheck + build
        clean). **8 new tests** (cast window emit + timing; bossCast fires at
        resolution; debuff current-tank/all/absent; ≥2 timelines / ≥2 movement
        windows) → **140 green**. Verified end-to-end via a raid-style boss (a
        2.5 s Searing Brand cast applying a ×2 `damageTakenMult` to the current
        tank, recurring). Design decisions below.
  - [x] **Slice 4 — Type-4 machinery: stacking debuffs, taunt, dispel,
        interrupt (engine). ← LANDED.** All four raid primitives, each purely
        additive → **every existing stream byte-identical** (7 solo + 3 trinity
        `--json` + full trinity event streams diff-identical). **Landed:**
        - **Stacking**: `ActiveBuff.stacks`/`maxStacks`; `BuffEffect.maxStacks`
          (+ `BossDebuff.maxStacks`) — `applyBuff` bumps the stack (capped) &
          refreshes instead of replacing; `damageTakenMult` compounds as
          `mult^stacks`. Absent/1 = refresh (byte-identical).
        - **Taunt**: `{kind:'taunt';durationMs}` effect → a per-enemy
          `forcedTarget` window consulted first in `pickTarget`, plus a threat
          bump so aggro sticks after; emits **`targetChanged`** (threat is now
          observable in the stream — a tank swap is watchable).
        - **Dispel**: `{kind:'dispel';dispelTypes}` effect +
          `Actor.removeBuffsOfType`/`hasDispellable` + `BuffEffect.dispelType`
          category; emits **`buffRemoved`**.
        - **Interrupt**: `{kind:'interrupt'}` effect cancels a boss cast still
          in its window (`Fight.activeBossCasts` tokens set on `castStart`,
          checked at resolve) → **`interrupted`** event, no `castEnd`, effect
          suppressed. Builds on slice-3 cast windows.
        - **Auto policies (Law 2)** in a new `Fight.autoSituational` (no-op for
          kits without these abilities, so no stream perturbation): interrupt an
          active cast, dispel an afflicted ally, tank-swap off a co-tank at ≥2
          stacks. Plans/calls fire them explicitly via `{kind:'ability'}`.
        - **Pre-work done**: `sanitizePlan` + `planRunner.describe` now guard
          every action kind (no unguarded `.patch`/holdDps fall-through); the
          `retreat` PlanAction kind + `Fight.retreat()` + `'retreat'`
          FightResultKind landed here as the shared hook slice 5 completes.
        New events: `targetChanged`/`buffRemoved`/`interrupted`/`resurrect`.
        **6 new tests** (`test/type4.test.ts`: stacking cap+compound, refresh
        parity, auto tank-swap, auto dispel, interrupt cancels the cast, plain
        kit emits nothing) → **146 green**. Web still typecheck + build clean
        (PlanAction `retreat` guarded in the two label helpers).
  - [x] **Slice 5 — Battle res + retreat (engine + web). ← LANDED.** Both are
        additive → all existing streams byte-identical (150 tests green).
        **Battle res**: `ResurrectEffect {kind:'resurrect';hpPct}` +
        `Actor.resurrect` (flips `alive` back, sets HP, clears buffs); the sim
        picks the highest-priority dead ally (healer→tank→dps), emits
        **`resurrect`**, and **restarts the revived character's decide loop**
        (it stops on death). Scarcity via `chargesPerFight` (Rekindle = 1/fight).
        Auto policy in `autoSituational` (revive whenever someone's down, off
        CD/charges). Content: **Rekindle** group CD (`content/groupCds.ts`,
        `requires: {mage:2}`, granted to the first mage) — raid-gated so the
        1-mage trinity never gets it and its streams stay byte-identical
        (tested). Replay revives the bar + logs "rekindles"; the res can't fire
        after a full wipe (fight ends on the last death — a design constraint).
        **Retreat**: `Fight.retreat()` + `'retreat'` FightResultKind (landed in
        slice 4's pre-work) + the `{kind:'retreat'}` PlanAction, now executed by
        `planRunner` (ends the fight early). `fightReview` treats retreat as
        **not a wipe** (`wipe: null`); "saves remaining consumables" is free
        (consumption is computed from the final stream, and an early exit simply
        used fewer). Web: `finalizeFight` already handles any non-kill
        uniformly, the live `view.ended` banner shows **RETREAT** not WIPE.
        **8 new tests** (`test/rescue.test.ts` + `type4` retreat) covering
        `Actor.resurrect`, auto-rez-once, the raid-gate, and the early exit.
  - [x] **Slice 6 — Recruit talent trees + roster-derived call palette +
        loadout scoping (web + engine content). ← LANDED.**
        - **Warrior & Priest talent trees** (engine content:
          `content/classes/warriorTalents.ts` + `priestTalents.ts`, 9 nodes ×
          3 tiers each, cost 13 vs an 8-point pool). `makeWarrior`/`makePriest`
          gain a `talents` arg (4th, consumables → 5th, matching `makeMage`);
          empty selection folds to a **byte-identical no-op** (7 solo + 3
          trinity streams diff-identical). Capstones grant the slice-4
          abilities as content — Warrior → **Challenging Shout** (taunt),
          Priest → **Purify** (dispel) + **Power Word: Barrier** (party absorb)
          — so they never touch the trinity (opt-in via talents). Web: `talents`
          on `RosterBuild` (+ `RosterBuildInput`, `charBuild`/`useCharBuild`,
          `pullEncounter`, the worker, `buildSimRequest`); `spend/refund/
          respecRosterTalent(char)` actions (respec charged once, like Elara's);
          `TalentPanel` generalized over any `TalentTree` and rendered in
          `RosterCharacterPanel`; persist **v10** backfills `talents: []` per
          recruit build (sanitized against the tree).
        - **Roster-derived call palette**: `FightView`'s hardcoded `ALL_CDS`/
          `HEAL_CD` literals now derive from the ACTUAL party's abilities by
          tag (`burst` / `heal-cd`), so comp/talent CDs (Battle Shout,
          Pyroclasm, Rekindle, …) appear automatically; buttons disable when
          the party has none.
        - **Loadout scoping**: `Loadout.classId` added + v10 backfill (existing
          loadouts = Elara's mage) so the model is per-class; respec is charged
          only via the explicit respec action, so loadout-apply never charges.
        **156 engine tests green; web typecheck + build clean.**
        **v1 simplifications (recorded, not bugs):** the loadout LIBRARY UI
        stays Elara-facing (the `classId`-scoped per-recruit loadout panel,
        grouping/filter, per-boss assignment, and "library holds plans" are a
        follow-up — the data model is ready); `PlanPanel`'s action list is
        still partly hardcoded (the live palette is roster-derived, the plan
        editor's curated list is not yet); progressive-disclosure gating of the
        palette is not implemented. Recruit `behavior`/`xp` still default
        (talents made real, the rest stays class-default).
  - [~] **Slice 7 — Cinderforge raid + comp rules (engine content landed;
        web raid UI + catalyst crafting deferred).** **Landed (engine):**
        - **Cinderforge** — the first **10-man raid**
          (`content/dungeons/cinderforge.ts`), two bosses exercising the full
          type-4 stack, each auto-answered (Law 2, verified): **Warlord Ashkar**
          — Molten Brand stacks a per-stack `damageTakenMult` on the current
          tank → the off-tank auto-**taunts** to swap (5 swaps/kill measured);
          Cinder Nova party sustain; lava vents with a fail tolerance. **Pyre-
          Priest Vael** — Immolation Rite is a real **interruptible cast**; Hex
          of Ash is a dispellable magic debuff the Purify healers auto-**dispel**
          (39 cleanses/kill measured). Tuned via `--raid --boss ashkar|vael`
          against the talented 2/3/5 comp: **100% at default gear, 96% starter**
          (enrage backstop at 5:00; TTK ~3:30). Numbers are placeholder — a
          tighter Normal ≈ 90% and a Heroic (stat-proof) variant are a retune
          follow-up (the TTK distribution is too tight for a clean enrage wall
          without survivability variance).
        - **Comp ratio rules** (`model/comp.ts`): `checkRaidComp` +
          `RaidCompRule` (size + `minRoles`) + `CINDERFORGE_COMP_RULE`
          (10-man, ≥2 tanks, ≥3 healers) — the ratio check `minDistinctRoles`
          couldn't express at raid size.
        - **Pummel** interrupt added to the warrior tree (the interrupt content
          that answers Immolation Rite as a knowledge lever). `--raid` gains
          `--pnotal`; the raid comp comes specced (threat/throughput builds).
        - CLI `--raid --boss ashkar|vael`; engine exports for the raid + comp
          helpers. **161 engine tests green; all existing streams byte-identical.**
        ~~**Deferred (web)**~~ — **all landed as slices 8–13** below.
  - [x] **Slice 8 — the uniform `characters{}` model (engine + web, v11).
        ← THE RISK SLICE.** One record replaces Elara's legacy top-level build
        fields AND the two-entry `roster`, with an explicit `rosterOrder`;
        `charBuild` loses its mage-vs-recruit branch and the `activeChar:
        'elara'` sentinel is gone. `assembleParty()` replaces the hardcoded
        trinity in `pullEncounter`. **Engine:** the group-CD carrier is chosen
        by smallest id instead of array position — it was a reference-identity
        check against the FIRST element of the class, so reordering the roster
        silently moved Battle Shout and invalidated plans keyed on `charId`.
        Founders keep their bare ids, so no persisted `plans[].charId`,
        `familiarity` or journal key needed remapping. **Caught mid-refactor:**
        `CharacterBuild.behavior` had to be a PARTIAL override — the classes
        ship different `damageWhileMoving` bases (0.6 mage / 0.8 warrior / 0.5
        priest) and a filled object would have flattened all three onto the
        mage's, invisibly (it moves no HP/AP/armor and the UI never shows it).
        Two tests now pin it. Same pass fixed `runGrind` discarding recruit
        talents — live since slice 6, so the map showed recruits grinding
        untalented while the dungeon fought them specced.
  - [x] **Slice 9 — roster growth via milestone slots (web).** Ramp as data in
        `world/roster.ts`: 3 → 5 (Slagmaw) → 7 (Ember Forge) → 10 (Warcamp) →
        12 (first Cinderforge boss), cumulative so a milestone can never shrink
        a live roster. Earning a slot and FILLING it are separate — slots come
        only from progression (§2, no barracks), but the class is the player's
        choice, because the 2/3/5 comp rule means no auto-grant could know the
        intent. `recruit(classId)` allocates the next id on the frozen
        convention and opens a world lane. Class registry (`CLASSES`/`MAKERS`)
        replaced the per-class ternaries.
  - [x] **Slice 10 — the Warcamp, a zone-sited raid access gate (web, v12).**
        §5's access building, built in the Cinder Wastes on the **bridge
        pattern** rather than at the base — `world/base.ts` states buildings ADD
        capability and never gate, so siting it there would have made it the
        first blocking building and broken that rule. Costs 40 timber + 20
        emberbloom + 1 **forge seal**, a guaranteed FIRST-CLEAR reward for
        Vulkan. Sets `unlocks.raidAccess` and grants roster slot 10.
  - [x] **Slice 11 — Cinderforge raid pull UI (engine + web, v13).** The raid
        the engine could already run but nothing referenced. Engine:
        `checkRaidComp` gained a structured `RaidCompReport` (per-role
        have/need/ok) so a builder can render "2/3 healers". Web: a `DUNGEONS`
        registry replaces the hardcoded Ember Forge everywhere; `RaidRosterPicker`
        picks 10 with live comp chips and per-candidate familiarity;
        `pullEncounter`/`finalizeFight`/the worker all derive from the party.
        **The familiarity loop previously credited the literal trio**, so a
        10-man would have credited three of ten and broken benching pressure.
        `PlanPanel`'s palette and `FightView`'s `callLabel` are kit-derived —
        both keyed on class ids before, which at raid size binds every
        `charId:'warrior'` entry to one tank silently. Frames are role-grouped
        (tanks first, two columns) above five players.
  - [x] **Slice 12 — catalyst economy (engine content + web, v14).** Two
        raid-tier consumables (Ember Draught, Cinderguard Tonic), each
        sharpening ONE axis so §6's ward-vs-flask slot decision survives at raid
        tier. `emberCatalyst` pays 2 per raid boss KILL via `KILL_REWARDS` —
        distinct from slice 10's first-clear `CLEAR_REWARDS`: the seal is a tier
        gate and must not be farmable, the catalyst is a faucet and must be.
        Both guaranteed, so the loop works without inventing loot rules.
        `Recipe.herbs` → `Recipe.cost` over all materials. **Deliberately not
        crafted gear** — see the scope note below.
  - [x] **Slice 13 — loadout library (web, v15).** Closes Law 1's third raid
        system. Names are unique per (class, name) — a global name space had a
        mage "Raid" and a warrior "Raid" overwrite each other. The panel is
        class-scoped and renders for every character. Per-boss assignment
        (`bossLoadouts`) with "Equip all (N)", applied ON DEMAND rather than at
        pull time so the character panel never lies about what a character
        wears; deleting a loadout drops its assignments.
- [ ] **Phase 5.5 — Real game UI, mobile-first. ← NEXT** (user direction,
      2026-07-19: the current interface is "an HTML data calculator" and must
      become a real game UI that works on mobile, not just desktop). **This is
      closing a gap against the GDD, not polish:** §1 says "Platforms: PC,
      browser, mobile — no mechanical demands… so all platforms are equal", and
      §3 calls the tactical pause "usable on mobile too". Today the app is a
      3-column desktop grid with plain `<select>` controls, ~9.5 kB of
      hand-written CSS, no design system, and exactly one responsive rule (the
      900 px raid-frame breakpoint from slice 11). Priorities: the **fight view**
      (the game's spectacle — you never input during combat, you watch the plan
      play out), the **call palette** (the only time-pressured interaction in the
      game, so it must be thumb-reachable), **ten raid frames on a phone** with
      role grouping preserved, and making §8 Law 1's progressive disclosure feel
      deliberate. **Presentation-layer only — the store stays UI-agnostic and the
      persist chain (v15) must not move for cosmetic reasons.** Highest
      regression risk in the repo's history, because `apps/web` has zero tests;
      see `HANDOFF.md` §1.
- [ ] **Phase 6 — Guilds**: accounts/sync, server-authoritative real fights
      (Fastify + Postgres, same engine), guild bank, world bosses.
      **RESOLVED (user, 2026-07-19): the server is authoritative over
      EVERYTHING.** Real fights happen on the server; the client replays the
      finished event stream like a video. This fits the existing architecture
      rather than replacing it — the engine is pure and deterministic, and
      `fight/replay.ts` already folds a `CombatEvent[]` into UI state, so only
      the stream's *origin* changes. Consequences: live calls become one
      round-trip per call (the past stays byte-identical either way, so the
      semantics survive); the **training dummy stays client-side** (free,
      unlimited, awards nothing — there is nothing to cheat, per §3); the
      **world loop moves too**, since grind/gather/craft award things and
      `advanceAll` is a pure reducer that runs server-side unchanged; and the
      local save becomes a **cache rather than the truth**.
      **Loot rules: deliberately OUT OF SCOPE** (user, 2026-07-19) — they need
      real design work first. Every reward stays deterministic, as phase 5
      established; do not improvise a second ad-hoc scheme.
      `model/journal.ts`'s monotone merge is already the guild-wide discovery
      mechanism §7 asks for.
- [ ] **Phase 7 — Expansion stages** (as needed): traits, council/split/soak,
      difficulty tiers, affixes, timed runs, behavior-effect uniques,
      graphical replay

## Phase 5 — post-merge verification (2026-07-19)

HANDOFF.md's script run in full, including the browser steps (5–6) the remote
container could not do. **Everything passed.**

**Engine.** 161 tests / 18 files green; engine + web typecheck clean; web build
clean. The 21 new phase-5 tests (`raid`, `type4`, `rescue`, `classtalents`) all
pass individually — including the two asserting Ashkar emits
`targetChanged{reason:'taunt'}` and Vael emits `buffRemoved{buffId:'hex-of-ash'}`.

**Byte-identity.** The handoff diffs against `main`, but post-merge `main` *is*
the branch — the baseline used instead is **`c9ef804`**, the last commit before
any phase-5 engine work (slice 5.1 was web-only). All **8** streams identical:
cinder-maw, emberwing L9, bandit-warlord L3, forge-whelps, slagmaw, vulkan,
heartfield, cinder-wastes. *Use `c9ef804` as the byte-identity baseline from
here on.*

**Balance reproduced.** Slagmaw 97.5% / Vulkan 96.3% (n=400) — Law 2 holds.
Ashkar 100% default at n=400 (99.8% at n=2000, TTK 3:40), Vael 100% (TTK 3:14),
Ashkar `--pgear starter` 97.0% (3.0% lost to enrage).

**In-browser** (the previously unverified part). v9→v10 migration clean on the
real save — version 10, recruits backfilled `talents: []`, no data loss.
Warrior/priest trees: spending moves stats (Borin 3770→4070 HP, 340→390 armor;
Seren 67→73 healing), prerequisites correctly enforced, capstones grant
**Challenging Shout** (taunt), **Pummel** (interrupt) and **Purify** (dispel)
into the Abilities list. Respec charges exactly 10 sunleaf (40→30), once, and
fully reverts stats + abilities. Roster-derived call palette fired **Battle
Shout + Combustion + Pyroclasm** — Pyroclasm exists only because Elara has that
*talent*, which is the proof the palette derives from the live party rather
than the old hardcoded literals. Full live loop: pull → call → VICTORY 0:21 →
"Adopt all" wrote 3 plan entries → encounter cleared, exactly 1 flask deducted,
attempt recorded **once** (no double-count). **Zero console errors.**

**Two corrections for the next session:**

1. **HANDOFF.md step 3's `--trace` greps cannot work.** `--trace` prints only
   the **last 25–30 events** (`cli/run.ts:249,425`), so mid-fight
   `targetChanged`/`buffRemoved` fall outside the window and grep returns 0.
   Nothing is wrong with the code — `test/raid.test.ts` is the real
   verification. Don't repeat the dead end.
2. **Seeding a test save in the browser needs `localStorage.setItem` frozen**
   immediately after the write and before reload — the world tick persists so
   eagerly it clobbers any external write, and a second open app tab overwrites
   the seed too. Always stash the real save to a file first; migrations run on
   page load, so *opening the app is the test*.

## Phase 5 — slices 8–13 as planned (authored 2026-07-19, all landed)

Scope fixed by the user: slice 7's deferrals + the loadout library + roster
growth. **Explicitly out of scope**: the raid balance retune (Normal≈90% /
Heroic), the full ~15-call GDD §3 call palette, and loot/drop tables.

**The decisive finding:** the **engine is already fully 10-man ready and none of
it is wired up.** `MAX_PARTY_SIZE = 10`, `checkRaidComp`,
`CINDERFORGE_COMP_RULE` and `makeCinderforge()` all exist and are exported from
`packages/engine/src/index.ts` — and *nothing in `apps/web/src` imports any of
them*. `DungeonPanel` hardcodes `makeEmberForge()`; `DUNGEON_SIM_IDS` lists only
`slagmaw`/`vulkan`. The rest of phase 5 is almost entirely a web-layer
generalization from exactly-3 characters to N.

- **Slice 8 — uniform `characters{}` model. ← THE RISK SLICE.** Replaces
  `roster: Record<RosterCharId, RosterBuild>` *and* Elara's legacy top-level
  fields with one `characters: Record<CharId, CharacterBuild>` plus an explicit
  `rosterOrder: CharId[]` (explicit, not `Object.keys` — `simIsStale` is a
  whole-request JSON compare and would go spuriously stale under unstable key
  order). Collapses the `charBuild`/`useCharBuild` mage-vs-roster branch and
  deletes the `activeChar: 'elara'` sentinel — the refactor the comment at
  `store.ts:536-541` has promised since slice 1. **Also fixes the group-CD
  carrier** (`model/comp.ts:95-97`): today the carrier is chosen by
  `party.find(...) === c`, a reference-identity check against *array position*,
  so a reorderable roster would silently move Battle Shout/Rekindle and
  invalidate plans keyed on `charId`; replaced by a stable lowest-id rule
  (byte-identical for the trinity — one of each class ⇒ same carrier).
  **No engine factory change:** the duplicate-id problem is solved the way the
  CLI already solves it (`cli/run.ts:306-312`), cloning with a remapped id
  after `make*` and before `applyComp`. Persist **v11**.
- **Slice 9 — roster growth + the slot ramp** (open question 2 above). Class
  registry replacing the binary ternaries in `RosterCharacterPanel.tsx:55`,
  `TalentPanel.tsx:30-41` and `runGrind`; N-lane `QueueStrip`; roster-list
  switcher. Persist **v12**.
- **Slice 10 — Warcamp, the zone-sited raid access gate.** Follows the **bridge
  pattern** exactly (`BRIDGE_COST` in `world/tasks.ts`, `buildBridge` at
  `store.ts:1344`, the button at `RegionCard.tsx:94`) — built on the Cinder
  Wastes region card, not in the base. Cost = timber + emberbloom + **1
  `forge-seal`**, a guaranteed reward for clearing Vulkan. Sets
  `unlocks.raidAccess`. Persist **v13**.
- **Slice 11 — Cinderforge raid pull UI.** Generalize `DungeonPanel` over a
  `DungeonDefinition`; add the **raid roster builder** (pick 10, live
  `checkRaidComp`); generalize `pullEncounter`/`finalizeFight`/worker
  `buildParty` off their 3-char literals; derive `PlanPanel.ACTION_OPTIONS`
  from the party (at 10-man every literal `charId:'warrior'` entry binds to one
  def); role-grouped compact `FightView` frames. **Reuse untouched:**
  `fight/replay.ts` (already N-actor from `cfg.players`),
  `analysis/metrics.ts` `playerIdsOf`, and `issueCall`/`adoptCall` — all
  already party-size agnostic.
- **Slice 12 — catalyst economy.** Guaranteed `emberCatalyst` on an
  Ashkar/Vael kill (same reward hook as the forge-seal), widened `Recipe`
  inputs, two raid-tier consumables. **Deliberately NOT crafted gear:** items
  in `content/items.ts` carry `tier` as pure balance labelling with no cost or
  source, there is no recipe→item path anywhere, and all gear is *free-pick*
  today — crafted gear means introducing gear **ownership**, which retroactively
  gates every item already selectable. That is a design change, not a
  completion task; it gets its own scoped slice later.
- **Slice 13 — loadout library.** UI only (`Loadout.classId` landed in slice
  6): per-class panels, grouping/filter, per-boss assignment.

**Also logged for later, not scheduled:**

- "All CDs now!" at 10-man fires ~15 actions and re-runs the fight for the whole
  batch. Semantically correct (it is a burst window), but palette depth belongs
  to the out-of-scope call-palette work.
- **Crafted GEAR is deliberately not built** (slice 12 shipped raid-tier
  consumables instead). §6 frames catalysts around tier-2 weapons, but items
  carry `tier` as pure balance labelling with no cost or source, there is no
  recipe→item path anywhere, and all gear is **free-pick** in the dropdowns —
  so crafted gear means introducing gear **ownership**, which retroactively
  gates every item already selectable. That is a game-wide design change, not a
  completion task, and needs its own scoped slice and its own decision.
- The **enrage/speed control resets to 1× on every pull**, which is mildly
  annoying when re-running a 3-minute raid boss. Cosmetic; noted while testing.

**GDD amendments owed** (in addition to the 10-man corrections above): §5's
access buildings are **zone-sited constructions**, not `world/base.ts`
buildings — the base's "buildings ADD capability, never gate" rule stands
untouched, and the bridge is the precedent.

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

**Slice 2 (raid-scale party):**

- **Every cliff fix is a no-op below raid scale, not a recalibration.** The
  hard law is byte-identity for the 7 solo + 3 trinity streams, and the four
  fixes touch code those streams exercise. Rather than retune and hope the
  aggregate lands, each fix is structured to reduce EXACTLY to today's
  behavior at ≤5 chars / ≤ maxTargets living, then verified by diffing full
  event streams (not just `--json` aggregates) across 5 seeds × 3 encounters.
  Rejected: tuning the numbers and accepting "close enough" — a single flipped
  melee target in one of 2000 seeds is a broken stream.
- **Heal-threat fix is a size gate (`chars.length > 5`), not a threat cap.**
  A read-time cap keyed on tank threat looked cleaner but is unsafe: at t=0 the
  top tank threat is 0, so it clamps a healer's opening heal-threat to 0 and
  flips the trinity's documented early stray healer-swing. Lowering
  `HEAL_THREAT_COEFF` is unsafe for the same reason (deletes a stray swing in
  some seed). The size gate can PROVABLY never run for any existing baseline
  (all ≤5), mirroring the "absent arg = old behavior" pattern used throughout.
  Inside the gate, non-tanks are capped at the top living tank's threat, with
  tanks iterated first so ties resolve to the tank. maxTargets ≥ 3 is the
  matching invariant for the group heal.
- **Group-heal selection and its decision score share one helper.** Two copies
  (one to pick heal targets, one to score the ability) would drift at raid
  scale — the brain could value a heal it won't actually cast. `selectGroupIndices`
  is the single source; the score averages the deficit of the SUBSET it will
  land on, which un-dilutes at raid scale and equals the old whole-party
  average when everyone fits. Rejected: scoring on the whole raid (the
  dilution bug the slice exists to fix).
- **Role-weighting rides the subset selection only.** Weighting `lowest-ally`
  or the score magnitude would change trinity decisions; weighting only WHO
  enters the bounded subset is inert when everyone fits (≤ maxTargets), so it
  costs zero byte-identity while still pulling a dying tank into the heal at
  10. Tank weight 1.5 (placeholder-tunable).
- **`--raid` is additive dev tooling, not a content boss.** There is no raid
  boss until slice 7, so the 10-man is measured against scaled existing bosses
  purely to confirm the mechanics (tanks hold ~5× the party's damage-taken vs
  3 healers; group heal bounded). Rejected: authoring a placeholder raid boss
  now (content belongs in slice 7 after the mechanics list refactor).

**Slice 3 (mechanics as a list + debuffs + cast windows):**

- **`installBoss` processes mechanics grouped by kind, not in list order.**
  The `fork('boss')` RNG draws (timeline `firstAtMs` jitters, then movement
  `firstAtMs`) are position-sensitive: any reordering shifts every later draw
  and breaks byte-identity. Grouping by kind in the fixed melee→timeline→
  movement→enrage→adds order reproduces the pre-list draw sequence regardless
  of how a boss author orders its mechanics array. Rejected: iterating the
  array in author order (byte-identity would depend on every content literal's
  ordering — a silent trap).
- **Unseen mechanics are DROPPED (timeline) or NO-OP'd (movement/enrage/adds)
  in `redactBoss`, not uniformly dropped.** The old redaction kept singleton
  slots present as no-ops, which the dummy sim relied on (a no-op movement
  still draws its install jitter). Keeping that shape for movement/enrage/adds
  means full knowledge reproduces the true fight byte-for-byte (the guard
  test) and partial knowledge matches the old dummy-sim structure; timelines
  were always an array and are still filtered out. Rejected: dropping all
  unseen mechanics (would change the dummy-sim RNG shape vs. the shipped
  behavior).
- **Cast windows keep `noteBossCast` at the resolution site.** A `bossCast`
  plan trigger must fire when the cast *lands* (its observable moment), not at
  `castStart`; moving the hook would shift every bossCast-driven plan (e.g.
  Vulkan's hold-DPS resume) and break its byte-identity. Cast duration is
  opt-in per timeline ability, so plain bosses emit no `castStart` at all.
- **Boss debuffs reuse `Actor.applyBuff` via a new `Fight.applyBossDebuff`,
  not a new buff system.** `applyBuff` is already actor-agnostic; the only gap
  was a boss-sourced entry point emitting `buffApplied`/`buffExpired` with
  source `BOSS_ID` and a target mode the `BuffEffect` union doesn't express
  (`current-tank`/`random`/`all`). Stacking stays out (slice 4 adds
  `ActiveBuff.stacks`); v1 debuffs refresh, which is enough for the tank-swap
  lever. Rejected: folding boss targeting into `BuffEffect.target` (conflates
  the character self/party modes with enemy→player modes).
- **The list refactor necessarily touched the web** (journal/plan/replay/
  FightView read the flat fields), so slice 3 is engine + a mechanical web
  migration to the engine accessors — chosen over keeping the flat fields as
  derived getters (getters don't survive the `...def` spreads in `redactBoss`/
  `makeX`) or a two-representation hybrid. The mechanic-key strings are a
  persisted (v7) contract and were preserved exactly.

## Phase 5 — open design questions (GDD gaps to resolve before the raid slices)

The GDD specifies phase-5 *features* but is silent on several rules the
slices depend on. Each needs a decision, and the decision should be
back-filled into DESIGN.md rather than living only here.

1. ~~**Raid size for the first raid.**~~ **RESOLVED (user, 2026-07-18): raids
   are 10-man, full stop.** `MAX_PARTY_SIZE` becomes **10** — a hard ceiling,
   not headroom; if a later raid ever needs more, bump it then (the "no
   content scaling" law means sizes are content decisions, not knobs). The
   canonical tuning comp is **2 tanks / 3 healers / 5 dps** — it pins the
   group-heal breadth and healer-threat numbers, and it satisfies §4 type-4's
   only hard comp requirement (tank-swap debuffs need 2 tanks).
   **GDD amendment owed:** §2's stage table ("Endgame | up to 20 characters")
   and §4's content formats ("raids (up to 20 chars)") both say 20 and must be
   corrected to 10-man raids. ~~**Still open:** the ROSTER size~~
   **RESOLVED (user, 2026-07-19): the roster is deliberately LARGER than the
   raid, and you choose the 10 who go before pulling.** There is no roster cap
   pinned to the raid size; the slot ramp below is the practical schedule. This
   makes benching and rotation real *by construction* — the raid-roster
   selection screen becomes a first-class part of the raid flow (slice 11),
   not a formality, and per-character familiarity (§2) gives the choice real
   weight (question 5 below stops being hypothetical).
2. ~~**Roster slot schedule.**~~ **RESOLVED (2026-07-19).** Ramp, every step a
   progression milestone, **never bought**: **3** (Cinder Maw killed — today)
   → **5** (Slagmaw killed) → **7** (Vulkan killed / Ember Forge cleared) →
   **10** (Warcamp built) → **12** (first Cinderforge kill). Lands in slice 9.
   The base still has no barracks and **must not get one** — a purchasable
   building would contradict the "not bought" rule. The Warcamp is a **zone**
   construction (bridge pattern), not a base building, so it does not breach
   that rule.
3. **Raid lockouts / weekly resets.** The word "lockout" does not appear in
   the GDD. Combined with "no auction house, self-found" (§6) and "time
   gating sits on acquisition" (§1), the default reading is **unlimited
   attempts**. Recommendation: no lockouts in v1; revisit with guilds
   (phase 6), where shared kills already imply windows.
4. **Loot rules.** Undefined — "loot" appears only as a yes/no column in the
   sim-vs-real table. Drop tables, per-roster distribution and bad-luck
   protection are all unspecified, and this is the largest genuine gap.
   **DEFERRED BY DECISION (user, 2026-07-19): out of scope until it gets real
   design work of its own.** Phase 5 showed the game works without it —
   catalyst progression shipped on *deterministic* rewards instead (guaranteed
   first-clear trophies + guaranteed per-kill catalysts), which sidesteps drop
   tables entirely. Hold that pattern; do not improvise a second scheme inside
   another feature.
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

## Balance state (raid scale, phase-5 slice 2)

No raid boss exists yet (slice 7), so the 10-man is measured against scaled
existing bosses purely to confirm the mechanics behave. Canonical comp
**2 tanks / 3 healers / 5 dps**, default gear, `--raid` CLI (seed 42):

| Boss | Setup | Result | Note |
|---|---|---|---|
| Slagmaw | default (hp 62k) | 100%, TTK 1:01 | 10-man facerolls 3-char content (expected) |
| Slagmaw | hp 200k, enrage off | 100%, TTK 3:20 | sustained eruption pressure — healers hold |

Threat check (hp 200k run): tanks take **~15k** damage each vs **~3.9k**
(healers) / **~3.4k** (dps) — the size-gated clamp holds the boss on the two
tanks even against 3 healers; non-tank damage-taken is party-wide eruption,
not melee. Group heal (`circle-of-healing`/`divine-hymn`, `maxTargets 5`)
lands on ≤5 of the 10 per cast (tested). These are mechanic-sanity numbers,
not a Law-2 gate — the kill-% wall arrives with slice-7 raid content.

## Balance state (Ember Forge, phase-4 slice 2)

**Unchanged by slice 2 — the trinity streams are byte-identical** (verified by
full-stream diff, not just aggregates). Trinity = Warrior + Priest + Mage via
`applyComp` (Battle Shout at pull, Well-Drilled +5 discipline). `--n 400`,
seed 42, CLI stance defaults (offense 0.6, targeting 0.5, potion <35%), no
plan (slice 5 adds plans):

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
