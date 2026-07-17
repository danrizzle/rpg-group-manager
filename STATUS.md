# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Current phase: 3 (Progression), slice 1 of ~6 done.** As of July 2026.

## Phase checklist

- [x] **Phase 1 — Combat sim engine** (pure module): stats, abilities, intent
      stances, mistakes/discipline, event stream, Cinder Maw (mechanic types
      1–3), Monte Carlo distributions. 27 tests.
- [x] **Phase 2 — Browser prototype (= MVP)**: intent panel, real-fight replay
      (bars + log, playback), training-dummy review (kill %, DPS histogram,
      TTK, mistakes). Monte Carlo in a Web Worker.
- [ ] **Phase 3 — Progression**
  - [x] Gear: item model + catalog (4 slots × 3 tiers, resist/behavior
        tradeoff pieces), gear picker, outgearing curve verified
  - [ ] Levels (XP, level → base stats)
  - [ ] Talents (numbers + new behavior controls + behavior stats; loadouts)
  - [ ] Professions v1 (herbalism→alchemy loop feeding consumables)
  - [ ] World map, travel, task queues (offline catch-up computation)
  - [ ] Home base v1 (bank, workshops, training arena)
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
  `packages/engine/src/content/` (mage.ts, cinderMaw.ts, items.ts).
