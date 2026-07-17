# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Current phase: 3 (Progression), slices 1–4 of 6 done; world & leveling
design done (GDD v0.4) — next up: slice 5 (professions v1).**
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
  - [ ] Slice 5 — Professions v1 (herbalism→alchemy loop feeding consumables)
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

## Balance state (Cinder Maw, current numbers)

Quadrant sweep (`--n 1000`, Balanced defaults unless noted):

| Setup | Kill rate | Note |
|---|---|---|
| naked | 0% | enrage |
| starter, defaults | 11% | the gear wall |
| starter + discipline 90 + potion 65 | 63% | knowledge rescues a tier |
| starter + Reckless | 34%, 27% deaths | Reckless is a trap undergeared |
| default, defaults | 96% | AFK floor (GDD §2 law 2) |
| best, Guarded + discipline 10 | 100%, ~5:19 | outgearing |

## Balance state (leveling & zones, slice 2)

Sim-derived via `grindRates` (`--n 400+`, default pull cycle 6 s approach /
12 s recovery / 60 s death penalty; risk tiers: <1 low, <5 risky, ≥5 deadly/hr).
All numbers placeholder-tunable. XP curve `xpToNext ≈ 100·n^1.6`.

| Zone (band) | mobs | on-band XP/hr | risk gradient |
|---|---|---|---|
| Heartfield (1–3) | 3× boar, xp 6 | L2 starter ~1.4k | low on-band |
| Duskwood (3–6) | 3× wolf, xp 14 | L5 starter ~2.6k | low on-band |
| Ashen Foothills (6–9) | 3× stalker (fire), xp 30 | L8 default ~4.7k | low on-band |
| Cinder Wastes (9–10) | 3× horror (fire), xp 60 | L10 best ~11k | **L6 starter deadly (~20 deaths/hr), on-band low** — the lethality gate |

- Overlevel devaluation confirmed: Heartfield at L8 → XP × 0.1 floor.
- AoE/gear scaling automatic: better stance/gear → higher XP/hr (grind tests).
- Zone bosses (defaults): Bandit Warlord L3 starter ~100% kill, ~0:47;
  Emberwing L9 default ~99% kill, ~2:43. Both tune via `--boss`.
- **Note on wall-clock pacing:** raw sim XP/hr is high vs. the GDD §2 "~1–2 h/
  level" target — real-time gating is meant to come from the dev/world time
  multiplier (slice 3), not from slowing the sim. Left as-is deliberately.

Known gaps / deferred items:

- Knowledge levers are thin until phase 4 (boss plans, familiarity) — the
  63% quadrant currently rides on discipline + potion timing.
- Post-fight review lacks comparison to last/best attempt and a wipe-analysis
  line (GDD §3) — small, high-value, event-stream-only addition.
- Deaths at full defaults are rare (~0.5%); revisit survival pressure when
  levels/consumables land.

## Balance state (talents, slice 4 — placeholder numbers)

- Throughput build (7 pts, +8 SP/+5% crit/Pyroclasm): starter gear vs Cinder
  Maw 11.8% → **99.1%** kill (`--n 2000`) — +12% DPS (150→168) explodes kill
  rate because starter sits right at the enrage wall; likely too strong for a
  7-point build vs the gear wall quadrant, revisit when tuning slice 5.
  Default gear (dummy sim): 95.5% → 100%, DPS 165 → 185.
- Defense build + `--barrier proactive` (vs reactive, `--enrage 900`,
  Balanced starter): deaths 0.3% → **0.0%** at −1.5% DPS / +9 s TTK — the
  dual-solubility lever works. At Guarded the reactive scorer already keeps
  barrier up, so proactive adds little there.

## Environment notes

- All dev in Docker: `./dev …`, `./web` → http://localhost:5174.
- Repo history: one commit per slice. Engine content =
  `packages/engine/src/content/` — `classes/mage.ts`, `bosses/` (cinderMaw,
  banditWarlord, emberwing), `mobs/zones.ts`, `items.ts`. Level/XP/unlock
  rules in `model/progression.ts`; grind rates in `analysis/grind.ts`.
- CLI: `--level`, `--zone <heartfield|duskwood|ashen-foothills|cinder-wastes>`
  (grind report), `--boss <cinder-maw|bandit-warlord|emberwing>` (boss report),
  `--talents <throughput|defense|id,id,…>`, `--barrier <reactive|proactive>`.
  Talent content in `classes/mageTalents.ts`; talent rules in `model/talent.ts`.
