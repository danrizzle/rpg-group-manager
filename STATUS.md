# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Current phase: 3 (Progression), slices 1–2 of 6 done; world & leveling
design done (GDD v0.4) — next up: slice 3 (world map, travel, task queues,
web).**
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
  - [ ] **Slice 3 — World map, travel, task queues (web).** Region map UI
        over the four regions, send-to-grind as a queueable task, travel
        times, real-time progress + offline catch-up (deterministic
        evaluation of elapsed time), gates: boss-kill flags, bridge build
        (simple gather task supplies materials — professions NOT required),
        lethality shown as the sim-derived risk tier. Level/XP display on
        the character panel; unlock arc hides locked intents/abilities.
  - [ ] Slice 4 — Talents (numbers + new behavior controls + behavior
        stats; loadouts)
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

## Environment notes

- All dev in Docker: `./dev …`, `./web` → http://localhost:5174.
- Repo history: one commit per slice. Engine content =
  `packages/engine/src/content/` — `classes/mage.ts`, `bosses/` (cinderMaw,
  banditWarlord, emberwing), `mobs/zones.ts`, `items.ts`. Level/XP/unlock
  rules in `model/progression.ts`; grind rates in `analysis/grind.ts`.
- CLI: `--level`, `--zone <heartfield|duskwood|ashen-foothills|cinder-wastes>`
  (grind report), `--boss <cinder-maw|bandit-warlord|emberwing>` (boss report).
