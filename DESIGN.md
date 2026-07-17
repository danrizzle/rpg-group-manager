# RPG Group Manager — Game Design Document

> Working title. As of July 2026 · Version 0.4 (phase 1 engine + phase 2 prototype built, phase 3 in progress)
> New in 0.2: Raid Leader mode (live calls), human factor (familiarity, simulated mistakes), extended mechanics catalog, complexity staging, sharpened MVP.
> New in 0.3: The progression economy (gear & knowledge as two currencies, outgearing law, per-difficulty tuning targets); behavior controls reworked from continuous sliders to **named intent stances + earned execution stats** (prototype learning: continuous dials felt like knob-fiddling and could never be plan building blocks).
> New in 0.4: **Level system (cap 10) with the unlock arc as tutorial; the v1 world (four regions) with leveling zones; sim-derived XP/hour grinding with death risk and overlevel devaluation; region gates (zone boss / access building / lethality).**

---

## 1. Vision & Core Loop

### Pitch

A strategy/management RPG in which combat is fully simulated: you don't play the character — you **build, optimize and lead** them. What starts as a single adventurer grows into your own dungeon group and eventually a fully self-managed 20-character raid roster. Idle RPG meets Football Manager, with the DNA of WoW raiding: gear, talents, consumables, boss plans, DPS meters.

### Platforms & Target Audience

- **Platforms:** PC, browser, mobile. No mechanical demands (no real-time input required in combat) — pure strategy/management, so all platforms are equal.
- **Target audience:** Active and former MMO players (who know the thrill of raid optimization but no longer have time for fixed raid nights), idle/incremental fans (Melvor Idle, OSRS players), management sim players.

### Core Loop

```
                    ┌──────────────────────────────────────┐
                    ▼                                      │
  Farming & skilling (time-gated)                          │
        │                                                  │
        ▼                                                  │
  Improve gear, consumables, enchants                      │
        │                                                  │
        ▼                                                  │
  Tune behavior, comp & boss plan  ◄── Training dummy      │
        │                              (instant, free,     │
        ▼                               unlimited)         │
  Real fight (real time, costs time + consumables)         │
        │                                                  │
        ▼                                                  │
  Review: DPS snapshot, combat log, journal progress ──────┘
```

Time gating sits on **acquisition** (farming, traveling, real fights) — the **tinkering** (dummy sims, plans, loadouts) is always instant and free. Optimizing stays fun at all times without making loot progression trivial.

---

## 2. Characters & Progression

### The Single Progression Arc

There are not "two paths" but one arc that adds a new management layer at each stage:

| Stage | Roster | New layer | Content |
|---|---|---|---|
| Early game | 1 character | Understand one char: stats, gear, behavior, profession | Solo: quests, farming, single bosses |
| Mid game | 2+ characters | Division of labor: one fights, one farms/crafts | Solo + preparing for groups |
| Group content | 3–5 characters | Comp building, trinity, boss plan, boss journal | **Dungeons (first group content)** |
| Endgame | up to 20 characters | Roster management, group CDs, loadout library | Raids |
| Meta endgame | Roster + guild | Async co-op | Guild world bosses |

Character slots are unlocked via progression milestones (not bought).

### Classes & Roles

- **Role model (hybrid):** Solo, every character sustains themselves — healing via food/potions built into their behavior. Group content requires the classic trinity: tank, healer, DPS.
- **Launch classes (v1): exactly 3, one per role.** Working names:
  - **Warrior** (tank) — damage reduction, boss aggro, group CD "Battle Shout"
  - **Priest** (healer) — single/group healing, dispel (relevant from raid tier), healing CDs
  - **Mage** (DPS) — single-target vs. AoE as a clear stance tradeoff, burst CDs
- More classes and specs (e.g. warrior DPS, priest DPS) arrive with expansions. Every new class must bring new group synergies and behavior stats, not just different numbers.

### Stats

Two stat families:

1. **Classic combat stats:** attack power/spell power, crit, haste, armor, HP, healing power etc. Come from level, gear, enchants, buffs.
2. **Behavior stats:** describe *how well* a character handles situations — they interact directly with boss mechanics:
   - "Damage while moving: 80%" (movement phases)
   - "AoE efficiency" (add waves)
   - **"Discipline/reaction time"** — how quickly a character actually executes planned actions and live calls (§3): the rookie needs 2 s to react to "Dodge!", the veteran 0.5 s
   - extensible per expansion

On top of that come **damage types & resistances**: bosses deal typed damage (fire, frost, shadow …) countered by resistance gear — which deliberately comes from *older* content (see §6). Resist set vs. DPS set is thus a real tradeoff per boss, not an item-level comparison.

Behavior stats come from talents, special gear and training — they are the reason there is no "best" character, only the best one for *this* boss.

### Levels & the Unlock Arc

**Level cap 10 in v1** — expansions raise it. Levels scale the **naked base stats** (HP, spell/attack power); gear remains the dominant power axis on top. Concretely for the Mage: level 1 naked ≈ 30 SP / 1,200 HP, growing to level 10 naked = 60 SP / 2,100 HP — the current engine baseline *is* the level-10 character, so existing boss tuning is untouched.

- **XP curve (placeholder, tunable):** `xpToNext(n) ≈ 100 · n^1.6`. Target pacing at an on-band zone: ~1–2 h of grinding per level early, ~3–4 h near cap. A dev time-multiplier exists for testing; real-time gating stays on acquisition per §1.
- **Leveling is the tutorial (Law 1, §8).** New intents and abilities unlock along the arc, never more than one or two systems per step:

| Level | Unlocks |
|---|---|
| 1 | Fireball · Balanced stance only |
| 2 | Potion threshold control |
| 3 | Guarded stance · Ice Barrier |
| 4 | Target steps (Focus → Cleave) · Flamestrike |
| 5 | Reckless stance · Fire Blast |
| 7 | Combustion · burst-CD control |
| 10 | Cap — dungeon-ready (phase 4 content) |

Talents (separate section) arrive at cap in v1 — leveling teaches the intents; talents deepen them.

### The Human Factor: Characters Get Better, Not Just Stronger

The second major progression axis besides gear — characters are simulated beings, not stat containers (the Football Manager principle):

- **Simulated mistakes:** Characters make mistakes in combat — stand in fire, miss an interrupt, pop their defensive CD too early. The mistake probability depends on discipline and familiarity.
- **Boss familiarity:** Every attempt (including wipes!) increases a character's familiarity with *this* boss → fewer mistakes, faster reaction to calls. Even a wipe night is measurable progress: the journal learns the boss, and the roster learns it in parallel.
- **Traits/personalities** *(expansion stage, not v1)*: quirks like "Panicky: pops defensive CDs too early", "Clutch: +10% below 20% boss HP", "Frugal: consumes fewer consumables". Turns recruiting and roster building into decisions instead of slot filling.

### The Progression Economy: Gear & Knowledge, Two Currencies

Gear (time, AFK-compatible) and knowledge (plans, live play, familiarity) are two currencies that buy the same thing: **kill probability**. The sim's distribution output is the exchange rate made visible — a boss at 55% can be pushed to 90% by farming gear *or* by building a better plan:

| | No plan (auto/preset) | Good plan / active play |
|---|---|---|
| **Low gear** | wipe — come back later | **the early kill** — skill beats the gear curve |
| **High gear** | **the AFK route** — Normal dies to defaults | farm speed + the ticket to hard modes |

Active play never grants power the AFK player can't reach — it grants **earliness**: wipes buy journal knowledge and familiarity, so the active player kills the boss weeks before the preset player outgears it. This generalizes Raid Leader ground rule 1 (§3, "presence grants flexibility, not extra power") into the whole progression model. And because real attempts cost time + consumables (§3), pulling at 55% is a bet with stakes; farming to 90% is the safe line — both are valid play.

Three laws protect this economy:

1. **No content scaling, ever.** Old bosses keep fixed numbers; outgearing low/old content is a *feature*, not a balance bug. (Old content stays relevant through resist gear and catalyst materials, §6 — never through level scaling.)
2. **Normal is tuned against defaults; Heroic is tuned against plans.** Normal-tier: adequate gear + auto plan + Balanced stance ≥ ~90% — fully AFK-able (Law 2, §8). Heroic-tier and up: mechanics with a stat-proof ceiling (unhandled adds, phase timing / hold DPS) so that no realistic gear level rescues a missing plan. These are numeric tuning targets the sim can verify, not vibes.
3. **Every boss needs a gear answer and a knowledge answer.** E.g. an enrage is gear-soluble (more DPS) while the add phase is knowledge-soluble (right stance at the right moment) — dual solubility is a checklist item for every entry in the mechanics catalog (§4).

### Talents & Skill Trees

Each class has a talent tree delivering three things: numbers (classic), **new behavior controls** (see §3) and **behavior stats**. Respec is possible (small resource cost); loadouts make per-boss rebuilds convenient.

### Loadouts

Per character, you can save: stances + talents + gear + consumable slots as a named loadout. Loadouts are assignable per boss/dungeon — roster management means maintaining a loadout library, not clicking through 20 characters individually.

---

## 3. Combat Simulation

The heart of the game. Design goals: **configurable rather than controlled**, deep through combinations rather than list maintenance, and identical on every platform.

### Controls: Intent Stances Instead of a Rotation Editor

There are **no** rotation/priority lists — and (since v0.3) **no continuous sliders** either. The guiding principle is the **intent/execution split**:

> **The player sets intent** — a few discrete, *named* states. **The character supplies execution** — earned behavior stats determine how well that intent is carried out. Choosing Cleave is free; being good at Cleave (`AoE efficiency`) is earned through talents, gear and training.

```
Character: Elara the Mage            Loadout: "Firelord P2"
────────────────────────────────────────────────────────────
Stance:    [ Reckless ] [ Balanced ]* [ Guarded ]
Targets:    Focus ── Lean ST ── Balanced* ── Lean AoE ── Cleave
Burst CDs: [automatic ▾]   (unlocked: "save for plan window")
Potion:    [at HP < 35% ▾]
Consumables: [Flask of Embers] [Fireproof Feast] [2× Healing Potion]
```

- **Named states are plannable and callable.** "Phase 2: mages to Cleave" works as a boss-plan building block and as a live call — the same vocabulary in three forms (knowledge → levers, §8). A continuous dial ("mages to 0.7") never could; the prototype proved this by feel before the plan system existed.
- **Base intents (from level 1):** stance (Reckless / Balanced / Guarded), targets (5 steps, Focus → Cleave), potion threshold (dropdown).
- **Intents themselves are earned.** A fresh character knows only *Balanced*; the base stances and target steps unlock along the level arc (§2 unlock table). Later policies ("save burst CD for…", "resource management conservative/aggressive") arrive via talents as further discrete options — depth grows with the player without ever tipping into list maintenance.
- **Execution stats are the real progression:** AoE efficiency, damage while moving, discipline (§2) — earned, not configured. Two characters in the same stance perform differently; that difference is your roster's quality.
- The refinement depth ("keep optimizing for more DPS") comes from the interplay of intents, execution stats, talents, gear, consumables, group comp and boss plan.

### RNG Model

- Real fights are **rolled** (crits, proc timing, boss variance). Same setup ≠ guaranteed same result — close kills feel earned.
- The **sim mode** (training dummy) compensates: it runs many iterations and shows **distributions** instead of single values — "damage check passed in 73% of runs", "DPS: 1,240 ± 90". Probability itself becomes a strategic element: do I go in at 73% or farm the gear upgrade to 90% first?

### Training Dummy vs. Real Fight

| | Training dummy / sim | Real fight |
|---|---|---|
| Cost | none | time + consumables brought along |
| Availability | instant, unlimited | possibly travel, running real time |
| Result | distribution over n iterations | one rolled run |
| Loot / journal progress | no | yes |
| Known boss mechanics simulatable | yes — only those already revealed in the journal | irrelevant — the boss does what it does |

### Fight Flow & Presentation (v1)

- Real fights run in **real time** (~2–8 min). You can **watch live** — HP/resource bars, buff/debuff icons, scrolling combat log, live DPS meter — or click away and collect the result later (idle-compatible).
- Presentation v1: **bars + log** ("a WoW interface without the 3D world"). No positional model — movement exists abstractly via boss phases + behavior stats.
- **Architecture requirement:** Every fight is stored as an **event stream** (timestamp, action, source, target, value). Presentations (bar UI today, 2D/graphical replay view later) are pure consumers of this stream. The later graphical playback is a nice-to-have for engagement, not required to play — but the architecture keeps it open from day 1. Bonus: replays, sharing and wipe analysis fall out of the same structure.

### Raid Leader Mode: Live Calls

During a real fight the player may intervene — but at the **manager level, not the player level** (the Football Manager principle: shout instructions and make substitutions, never control the players' feet). There is no spatial control and no ability piano.

**Three ground rules:**

1. **Same arsenal as the plan.** Every live call is a plan building block fired spontaneously — same abilities, same cooldowns, same effects. Presence grants flexibility against unknown bosses, not extra power: a perfect plan with perfect knowledge = a perfect live player. Idle players remain equal, and the sim remains the source of truth.
2. **Calls are recorded and can be adopted into the plan.** After the fight: "Your heal-CD call at second 94 prevented the wipe — save it as a plan entry for 'Firestorm'?" Active play *writes* your boss plan. The loop: **you play progression live like a raid leader; farm runs automated on the plan your progression produced.**
3. **Tactical pause** (at least in solo/group content): pause the fight, assess, issue calls, resume. Strategy instead of reflexes — usable on mobile too.

**Call catalog:**

| Category | Calls |
|---|---|
| Offensive | "All CDs now!" (burst window) · "Focus the adds!" / "Back on the boss!" · "DPS to AoE!" (stance switch per role/group) · "Below 20%: everything out + potions" |
| Defensive | "Heal CD now!" (as a **chain** — which healer pops next?) · "Everyone defensive!" · "Tank: Shield Wall!" · **"Dodge!"** (group enters a movement phase: boss AoE avoided, DPS loss via "damage while moving") · "Healthstones/potions now!" |
| Tactical | "Warrior takes the kicks!" (reassign live) · "Tank swap!" (from raids) · "Healers: save mana!" / "Pump now!" (healer throttle) · **Battle res** (1–2 combat resurrections per attempt — scarce resource) · **"Retreat!"** (abort the attempt, save remaining consumables, keep journal progress) |
| Meta | **"Stop damage!" (Hold DPS)** — phase transitions trigger on boss HP, abilities on timers; blindly maxing damage may push the boss into phase 2 exactly when the Firestorm timer expires. Hold damage, wait out the timer, then push: the deepest single mechanic in the game, because "more DPS" is no longer always the answer. |

**Limits** come from two sources: the underlying abilities have normal cooldowns (no spamming), and characters only follow calls after their **reaction time** (discipline stat, §2) — even obeying your calls is part of roster progression.

*Spatial control (zone commands like "ranged spread out", "stack/spread") is deliberately excluded — at most a distant expansion stage if the zone model for the 2D presentation ever arrives, and even then per group, never per character.*

### Post-Combat Review

After every real fight (and every sim):

1. **Snapshot:** DPS/HPS per character, damage/healing done, overhealing, buff/DoT uptime, consumable usage.
2. **Combat log light:** the decisive moments highlighted — "second 34: healer stood in the Firestorm with no heal CD active → dead". You should *see* why an attempt failed, not just *that* it failed.
3. **Journal progress:** newly discovered boss abilities (see §4).
4. Comparison to the last attempt / personal best attempt.

### Wipe Costs

A failed attempt costs **only time + consumed consumables**. No gear loss, no durability, no recovery debuffs, no permadeath. The discovery system (§4) lives on repeated attempts — the real investment is the **preparation** (farming/crafting consumables), not punishment afterwards.

---

## 4. Bosses: Discovery, Journal & Boss Plan

### Boss Mechanics Catalog

Bosses are assembled from mechanic building blocks that different classes, stats and plans handle differently — making every boss a comp and plan puzzle, not a pure damage check:

1. **Damage check & enrage** — hard enrage (boss must die within X min) or soft enrage (grows steadily stronger). Tests gear/DPS optimization.
2. **AoE & movement phases** — group-wide damage (demands planned heal CDs) and phases where everyone must move (makes "damage while moving" the king stat for that boss).
3. **Adds & priority targets** — add waves that must die fast (AoE stance, cleave comps) or must be interrupted (interrupt assignments in the plan).
4. **Tank & debuff mechanics** — tank-swap debuffs (require 2 tanks), mandatory dispels, absorb shields. **Raid content only** — the starter dungeon (3–5 chars) uses only types 1–3.

Across all types lies **phase timing**: phase transitions trigger on boss HP, abilities on timers — managing their interplay (hold DPS, then push) is the strategic meta layer of every fight (see call catalog, §3).

**Extended mechanics (expansion stages, from raid tier onward):** all chosen to demand *decisions*, not better stats:

- **Council fights** — 2–3 bosses at once buffing each other; the kill order is the strategy.
- **Split phases** — the group is divided into teams (two portals/sides); requires two functioning mini-comps and rewards roster depth over "the 5 best chars".
- **Soak mechanics** — someone must take the hit on purpose: who do you sacrifice, who gets the heal CD?
- **Stacking debuffs** — whoever handles the mechanic must rotate (assignment gameplay).
- **Mind control** — one of your own chars briefly fights against the group; CC/dispel priorities.
- **Puzzle/immunity phases** — boss invulnerable until condition X is met; pure plan work, zero gear check.

**Content modifiers (expansion stages):**

- **Difficulty tiers** per boss (Normal → Heroic → Mythic) — higher tiers add *new mechanics*, not just bigger numbers.
- **Weekly modifiers** (affix principle): "This week: adds explode on death" — farm content stays fresh, plans must adapt.
- **Timed runs** for dungeons as an optional prestige track.

Content formats: **single bosses** (solo, early game) → **dungeons** (3–5 chars, several bosses + trash) → **raids** (up to 20 chars, bosses with the full mechanics catalog) → **guild world bosses** (§7).

### Boss Discovery: the Journal

New bosses are **unknown**. You learn them by sending groups in and observing how far they get:

```
Boss journal: Firelord                        [67% explored]
──────────────────────────────────────────────────────────────
✓ Firestorm       — every 45 s, damage to the whole group
✓ Phase 2 at 60%  — Lavaspawn adds appear (wave every 30 s)
✓ Tantrum         — if adds live longer than 30 s
? Phase 3         — ??? (never reached, boss brought below 25%)
⚰ Last attempt: 43% boss HP — priestess died at second 94
  to Firestorm (no heal CD active)
```

- Every attempt reveals **what the group experienced**: abilities used appear in the journal with timers and phase triggers. What wasn't reached stays "???".
- The **wipe analysis** (from the event stream) shows causes of death and the critical moment.
- Revealed mechanics become simulatable in the **dummy sim mode** — you can test the next plan against everything you already know.

This is progression raiding as a game mechanic: send in → learn → adapt → get further.

### The Boss Plan: Turning Knowledge Into Levers

Journal entries are **clickable and become plan building blocks**. The boss plan is a timeline of reactions to discovered events — the macro counterpart to the characters' micro sliders:

```
Boss plan: Firelord                           Group: "Dungeon Core"
─────────────────────────────────────────────────────────────────────
Pull             → Battle Shout (group CD, burst window)
Firestorm (45s)  → Heal CD 1 (priestess)            [from journal ✓]
Phase 2 (60%)    → mages to AoE stance               [from journal ✓]
                 → interrupt assignment: warrior on Lavaspawn
Boss < 20%       → everyone offensive + potions
```

- Every new journal entry immediately provides a new lever for the next attempt — discovery knowledge is never just text, always an option to act on.
- Plan building blocks: trigger group CDs, switch stances of individual chars/roles, assignments (interrupts, heal targets), consumable moments.
- Plans are savable per boss and belong to the loadout library.

### Group Cooldowns & Comp Synergies

Certain class/role combinations in the group unlock **group abilities** used in the boss plan:

- "2× warrior → **Battle Shout**: 10 s +X% damage for everyone" (burst window)
- "Priest + mage → **Arcane Convergence**: resource refill"
- "3 different roles present → **Well-Drilled Team**: passive bonus"

Purpose: roster and comp building becomes a per-boss puzzle (do I bring the fourth DPS or unlock the synergy?) — **without** having to manage 20 individual rotations. Endgame gameplay shifts from "perfect one character" (early game) to "perfect comp, synergies and plan" (raid) — like the step from playing a DPS to leading the raid.

---

## 5. World, Base & Open-World Loop

### World Map & Travel

- The world is a **map of regions**. You send characters off with a click; travel costs real time (time-gated).
- Each region offers activities: combat content (bosses, dungeons), skilling spots (ore, herbs, …), quests.
- **Expansions = new regions** with a new tier of content, materials and classes/mechanics.

### The v1 World: Four Regions

The launch world is a compact arc from level 1 to the cap, ending at the first dungeon's door. Each of the three gate mechanisms appears exactly once, deliberately:

| # | Region (working names) | Level band | Gate to enter | Content |
|---|---|---|---|---|
| 1 | **Heartfield** | 1–3 | — (start) | Tutorial mobs (boars, bandits), herb spots, zone boss **Bandit Warlord** (type-1 lite: soft enrage) |
| 2 | **Duskwood Edge** | 3–6 | Kill the Bandit Warlord | Wolves, spiders, mining spot — the bridge materials come from here |
| 3 | **Ashen Foothills** | 6–9 | **Bridge** (access building; materials via a simple gather task — no professions required) | Fire-flavored mobs (fire resistance first matters here), zone boss **Emberwing** (type-2: movement phases) |
| 4 | **Cinder Wastes** | 9–10 | Kill Emberwing — plus raw zone lethality (band 9–10 mobs shred underleveled characters) | Capstone single boss **Cinder Maw** (the existing test boss, now "the wall"), and the locked entrance to dungeon **Ember Forge** (phase-4 teaser) |

- Travel between adjacent regions: 5–15 minutes real time (dev multiplier applies).
- Zone bosses obey the dual-solubility law (§2): the Bandit Warlord's enrage is gear-soluble and mistake-soluble; Emberwing's movement phases reward damage-while-moving gear (Quickstep Anklet) *or* a Guarded, potion-early setup.
- Expansions = new regions appended to this map (§5 above), never rescaled old ones.

### Leveling: XP/hour, Risk & Devaluation

Sending a character to level in a zone shows exactly two numbers: **XP/hour** and a **risk tier** (low / risky / deadly). Behind them, the combat sim stays the source of truth:

- Each zone defines a representative **mob-pack encounter** (declarative, like bosses: 1–3 mobs with stats and a level band) plus `xpPerKill`.
- **Rates are sim-derived, not hand-tuned:** a cheap, cached Monte Carlo of this character (gear, stances, earned stats) against the zone's mob pack — pull cycle = approach + fight + recovery downtime — yields kills/hour and deaths/hour. Gear scaling of XP/hour is therefore automatic, and better stances genuinely grind faster.
- **Death is real:** a grinding session can end in death. XP earned up to that point is kept; the character returns home with a short recovery — time is the only cost (§3 wipe rules). "Too low level for the zone" needs no special rule: the sim simply kills you, which *is* the lethality gate.
- **Overlevel devaluation — XP only, never power:** above the zone's band, `xpPerKill × max(0.1, 1 − 0.25 · (charLevel − bandMax))`. Outgeared farming of old zones for materials/loot stays fully effective (no-scaling law, §2); only the XP dries up, pushing leveling forward.

### Region Unlocks via Buildings

Some regions and raids are locked until you erect an **access building** with resources — an outpost, a bridge, a portal. It works like a pre-quest: the group must first master the economy/region before the next content opens. Not every region needs this — use it deliberately at raids and tier transitions.

### Home Base

An upgradable base with buildings:

- **Bank** (storage; upgrades = more space)
- **Workshops / crafting stations** (per profession; upgrades = better recipes/efficiency)
- **Training arena** (home of the training dummy / sim mode)
- extensible later (garden, stables, guild hall …)

Crafting characters *work* at the base — the base is the visible home of the roster's division of labor.

### Open-World Loop & Task Queues (offline-capable)

The roster's everyday loop, fully plannable via **task queues** and running while offline:

```
Character A (gatherer):  ▶ travel to Ember Gorge (12 min)
                         ▶ mine ore (2 h)
                         ▶ travel back ▶ bank ore ▶ repeat
Character B (crafter):   ▶ at the base: craft 20× Fireproof Flask
Character C (fighter):   ▶ 3 attempts: dungeon "Ember Forge"
```

You set up chains, log out, come back, collect results and plan anew. The world map's travel times, farming gates and real-time combat interlock here — the game respects short sessions (mobile) as much as long tinkering evenings (PC).

---

## 6. Professions & Economy

### Professions With Combat Relevance

Every profession must feed into the combat loop — nothing becomes "dead skilling":

| Profession (v1 proposal) | Delivers |
|---|---|
| Herbalism → Alchemy | Potions, flasks (combat consumables — the most important loop) |
| Cooking | Food buffs |
| Mining → Blacksmithing | Gear crafting, upgrade components, base building materials |
| Enchanting | Enchants on gear |

- **Roster synergy is the design goal:** Character A farms herbs so the dungeon group has flasks. Since real fights consume consumables (§3), there is a permanent, self-regulating demand.
- Limited **consumable slots per fight** ("what do I bring?") make the selection a decision, not a checklist.

### Economy Model: Self-Found + Guild Bank

- **No auction house, no free player trading.** All progression is self-earned — balance stays controllable, no gold-selling/exploit vector.
- **Guild bank:** guild members can donate and withdraw **materials and consumables** (no gear). Strengthens the async co-op idea ("I'm farming herbs for our world boss push") without undermining gear progression.

### Tier Progression: the Catalyst Model

New gear tiers require **upgrade components from previous content**: the tier-2 sword is crafted or upgraded with materials from tier-1 raids/regions. Old content stays permanently relevant and progression feels like building up — deliberately **no** charge model (items consumed through use), which would feel like an ongoing tax.

Second old-content anchor: **resistance gear** (§2) against the current boss's damage type deliberately comes from older regions/raids.

### Gear Depth: Tradeoffs Instead of Upgrades

Itemization should create decisions, not just bigger numbers:

- **Resist vs. DPS set** per boss (§2)
- **Situational consumables:** fire protection potion vs. DPS flask compete for the scarce consumable slots
- **Set bonuses** with synergies to certain comps/plans
- **Uniques/legendaries with behavior effects** *(expansion stage)*: not "+50 strength", but "your Dodge call costs no DPS loss, once per fight" — items that change plans and calls, not just stats

---

## 7. Guilds & Async Endgame

- **Guilds are async co-op:** no scheduling pressure, no real-time coordination — fitting for mobile/browser.
- **Guild world bosses:** extremely powerful bosses with a giant HP pool. Each member sends their roster into their own fights and contributes the damage dealt to the shared pool; the journal/discovery system (§4) applies guild-wide — the guild explores the boss together. When the pool is empty (possibly within a time window), the boss counts as a shared kill.
- **Rewards (deliberately no exclusive gear — the guild is not a power requirement):**
  - Cosmetics & titles (prestige, leaderboards)
  - temporary guild-wide buff (e.g. +10% skilling speed for a week)
  - rare crafting materials (feed into normal progression, don't replace it)
- Guild bank (§6) as the second guild feature.

---

## 8. Complexity Staging

The game has many systems — but **complicated ≠ deep**. A game becomes complicated when many systems arrive *simultaneously*; deep when a few clear rules allow many combinations. Almost everything here follows one mental model: **knowledge → levers** (journal entry → plan building block → live call are the same thing in three forms). Two design laws protect it from feeling complicated anyway:

### Law 1: The Progression Arc Is the Tutorial

Each roster stage introduces **at most one or two new systems**; nothing new arrives before the previous one has become second nature:

| Stage | New for the player | Deliberately still invisible |
|---|---|---|
| 1 character | 3 base intents (stance/targets/potion), gear, dummy vs. real fight, 1 profession | Plans, calls, journal, traits |
| 2 characters | Division of labor, task queues, base | Group CDs, trinity |
| First dungeon (3-char) | Trinity, boss journal, simple boss plan (2–3 slots) | Heal-CD chains, hold DPS, split phases |
| Dungeon progression | Live calls (only 2–3 at first!), resistances, consumable choice | Battle res, council fights |
| Raid | Full call palette, loadout library, tank swaps | Affixes, Mythic |
| Meta endgame | Difficulty tiers, modifiers, guild bosses | — |

The level 1–10 unlock arc (§2) is this law made concrete for the first stage. The UI follows **progressive disclosure** too: stances, call buttons and plan slots only appear once unlocked.

### Law 2: Defaults — Ignoring Works

Every system has a sensible auto mode. Depth is the price of **top-end content**, never the ticket in:

- No boss plan built? A serviceable **auto plan** always exists. It's enough for Normal — not for Heroic, and *that's* where optimizing becomes the gameplay.
- No interest in live calls? The plan plays everything (ground rule of Raid Leader mode, §3).
- Traits, affixes, timed runs: pure bonus layers you never have to touch.

### Consequence for Development

The real complexity risk is developer scope, not player overwhelm: ten shallow systems feel worse than three deep ones. That's why the MVP (§10) is brutally small and every expansion stage is explicitly marked as such in this GDD.

---

## 9. Open Questions

Deliberately undecided — resolve before implementing the respective phase:

- **Monetization** (buy-to-play? cosmetics? must fit the "no pay-for-power" ethos)
- **Balancing philosophy** (how far apart may classes be per boss?)
- **Season/ladder modes** as an optional addition to the permanent world (idea noted, don't design out)
- **Exact class kits** (ability lists, talent trees, numbers)
- **Tech stack** (engine/framework, server architecture for guild sync, offline computation)
- How much boss variance between kill attempts (timer jitter), so plans must be robust rather than frame-perfect

---

## 10. Roadmap

### MVP = Phases 1 + 2, Nothing Else

The MVP is deliberately almost banal in size: **one character, the three base intents, training dummy with distribution output, one test boss with 2–3 mechanics, real-time fight with bars + log, DPS review.** No professions, no base, no calls, no journal. It answers the only question that matters: **Is it fun to turn sliders and watch the sim win?** If yes, everything else stands on it; if no, no additional system would have saved it.

### Build Phases — Each Testable On Its Own

1. **Combat sim engine** (pure module, no UI): stats, abilities, intent stances, event stream, one test boss with mechanic types 1–3, Monte Carlo sim with distribution output. Simulated mistakes + discipline stat in the model from the start (cheap now, expensive to retrofit). ✅ *built*
2. **Browser prototype (= MVP):** 1 character + intent stances + training dummy + DPS/distribution review + real-time fight view (bars + log). ✅ *built*
3. **Progression:** gear ✅ · levels + zone grinding (§2 unlock arc, §5 XP/risk model) · world map with travel & task queues (v1 world, §5) · talents · professions · home base v1.
4. **Group content:** 3–5-char dungeon, trinity, boss journal + discovery, boss plan timeline, group CDs, **first live calls (2–3 of them) + tactical pause + call→plan adoption**, boss familiarity, hold DPS, resistances.
5. **Roster & raids:** 20-char roster, loadout library, full call palette (battle res, heal-CD chains, retreat), mechanic type 4 (tank swaps, dispels), tier-2 content with catalyst progression, access buildings.
6. **Guilds:** accounts/sync, guild bank, world bosses with shared journal and rewards.
7. **Expansion stages (no fixed order, as needed):** traits/personalities, council/split/soak/mind-control/puzzle mechanics, difficulty tiers, weekly modifiers, timed runs, uniques with behavior effects, graphical replay view.
