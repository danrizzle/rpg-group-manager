# Status — Roadmap Ledger

> Update this file whenever a slice lands. Roadmap definition: DESIGN.md §10.

**Current phase: 3 (Progression), slice 1 of 6 done; world & leveling design
done (GDD v0.4) — next up: slice 2 (levels + zone grinding, engine).**
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
  - [ ] **Slice 2 — Levels + zone grinding (engine).** Implement per
        DESIGN.md §2 "Levels & the Unlock Arc" + §5 "Leveling: XP/hour,
        Risk & Devaluation": level-indexed naked base (L10 naked must equal
        the current base — 60 SP / 2,100 HP — so existing balance holds),
        XP curve, ability/intent unlock table as data, declarative mob-pack
        encounters for the four zones (§5 region table), sim-derived
        XP/hour + deaths/hour (cached Monte Carlo vs. mob pack with pull-cycle
        downtime), overlevel XP devaluation. CLI harness: `--level`,
        `--zone` → prints XP/hour, risk tier, deaths/hour. Zone bosses:
        Bandit Warlord (type-1 lite) + Emberwing (type-2) as BossDefinitions.
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
