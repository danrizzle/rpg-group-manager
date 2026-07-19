import {
  BOSS_ID,
  COMP_PASSIVES,
  CONSUMABLES_BY_ID,
  CONSUMABLE_SLOTS,
  GROUP_CDS,
  ITEMS_BY_ID,
  MAGE_TALENTS,
  WARRIOR_TALENTS,
  PRIEST_TALENTS,
  PLAYER_ID,
  applyComp,
  discover,
  encounterById,
  familiarityBonus,
  levelForXp,
  totalXpToReach,
  LEVEL_CAP,
  makeCinderMaw,
  makeEmberForge,
  makeMage,
  makePriest,
  makeWarrior,
  runFight,
  sanitizeTalentSelection,
  talentPointsForLevel,
  unlockedControls,
  fightReview,
  sanitizePlan,
  type BossDefinition,
  type BossKnowledge,
  type BossPlan,
  type CharacterDef,
  type ConsumableDefinition,
  type FightResult,
  type FightReview,
  type GearSlot,
  type GrindRates,
  type Item,
  type MobPackDefinition,
  type PartyMember,
  type PlanAction,
  type PlanTrigger,
  type StanceConfig,
  type TalentTree,
  type TimedCall,
} from '@rpg/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  GrindRequest,
  GrindResponse,
  RosterBuildInput,
  SimRequest,
  SimResponse,
  WorkerRequest,
  WorkerResponse,
} from './sim/worker';
import { BOSS_FACTORIES } from './sim/bosses';
import { advanceAll, type SharedSlice } from './world/advance';
import {
  INITIAL_BUILDINGS,
  bankCapacity,
  canAffordTier,
  craftTimeMult,
  nextTier,
} from './world/base';
import { RECIPES_BY_ID, RESPEC_COST, resolveConsumables } from './world/professions';
import { nextCharId, nextRecruitName, rosterSlots } from './world/roster';
import {
  BRIDGE_COST,
  DEFAULT_MULTIPLIER,
  GATHER_BLOCK_GAME_MS,
  GRIND_BLOCK_GAME_MS,
  MAX_CATCHUP_GAME_MS,
  REGIONS,
  TRAVEL_HOP_GAME_MS,
  rateKey,
} from './world/tasks';
import type {
  AwaySummary,
  BossId,
  BuildingId,
  CraftTask,
  GatherTask,
  GrindTask,
  Inventory,
  Materials,
  RegionId,
  CharId,
  ClassId,
  CharWorld,
  Task,
  TravelTask,
  Unlocks,
  View,
  WorldCharId,
  ZoneId,
} from './world/types';
import { FOUNDER_CHARS, FOUNDER_NAMES } from './world/types';

/** Fixed base seed: the dummy sim is reproducible; only setup changes results. */
const SIM_BASE_SEED = 42;

/**
 * Named intent stances (GDD §3): the player sets intent via discrete named
 * states; internally each maps to the engine's numeric config.
 */
export const STANCES = [
  { id: 'reckless', label: 'Reckless', offense: 0.9, intent: 'reckless-stance', desc: 'All-in damage; defensives almost never. For outgeared content.' },
  { id: 'balanced', label: 'Balanced', offense: 0.55, intent: 'balanced-stance', desc: 'Trades some damage for sensible defensive use.' },
  { id: 'guarded', label: 'Guarded', offense: 0.2, intent: 'guarded-stance', desc: 'Survival first; uses defensives early and often.' },
] as const;

export const TARGET_STEPS = [
  { label: 'Focus', value: 0 },
  { label: 'Lean ST', value: 0.25 },
  { label: 'Balanced', value: 0.5 },
  { label: 'Lean AoE', value: 0.75 },
  { label: 'Cleave', value: 1 },
] as const;

export const POTION_STEPS = [0, 20, 35, 50, 65] as const;

/** The AFK floor: what a fresh character runs on with zero configuration. */
export const AUTO_PRESET: StanceConfig = {
  offense: 0.55,
  targeting: 0.5,
  potionThresholdPct: 35,
  burstCds: 'automatic',
};

/** Earned execution stats — dev-overridable in the prototype for tuning. */
export interface BehaviorOverrides {
  discipline: number;
  aoeEfficiency: number;
  damageWhileMoving: number;
}

export const DEFAULT_BEHAVIOR: BehaviorOverrides = {
  discipline: 50,
  aoeEfficiency: 1.0,
  damageWhileMoving: 0.6,
};

/** Equipped item id per slot ('' = empty). */
export type GearSelection = Record<GearSlot, string>;

export const DEFAULT_GEAR_SELECTION: GearSelection = {
  weapon: 'emberwood-staff',
  chest: 'runeweave-robe',
  ring: 'copper-band',
  trinket: 'lucky-charm',
};

export function resolveGear(sel: GearSelection): Item[] {
  return Object.values(sel)
    .map((id) => ITEMS_BY_ID[id])
    .filter((i): i is Item => Boolean(i));
}

/** A saved build: everything needed to re-apply it later (GDD §2 Loadouts). */
export interface Loadout {
  name: string;
  stance: StanceConfig;
  talents: string[];
  gear: GearSelection;
  /** Equipped consumable slot ids (may repeat, e.g. 2× healing-potion). */
  consumables: string[];
  /**
   * Which class this loadout targets — applying it to a different class would
   * sanitize gear/talents to nothing. v1 loadouts are Elara's (mage); the
   * library-per-character UI is a follow-up, but the model is scoped now.
   */
  classId: WorldCharId;
}

/** Repair a consumable slot list against current content and the slot cap. */
export function sanitizeConsumableSelection(ids: string[]): string[] {
  return ids.filter((id) => Boolean(CONSUMABLES_BY_ID[id])).slice(0, CONSUMABLE_SLOTS);
}

// ---- The roster (slice 8): one uniform record ------------------------------
// Phase 4 kept Elara's build in legacy top-level store fields and gave the two
// recruits a `RosterBuild` each, hidden behind `charBuild`. That asymmetry is
// gone: EVERY character is a `CharacterBuild` in `characters`, keyed by CharId,
// ordered by the explicit `rosterOrder`.

/** Per-class content: kit factory, talent tree, starting gear, UI labels. */
export interface ClassDef {
  id: ClassId;
  label: string;
  role: string;
  tree: TalentTree;
  startingGear: GearSelection;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  mage: {
    id: 'mage',
    label: 'Mage',
    role: 'dps',
    tree: MAGE_TALENTS,
    startingGear: { weapon: '', chest: '', ring: '', trinket: '' },
  },
  warrior: {
    id: 'warrior',
    label: 'Warrior',
    role: 'tank',
    tree: WARRIOR_TALENTS,
    startingGear: { weapon: 'militia-blade', chest: 'padded-hauberk', ring: 'band-of-vigor', trinket: 'lucky-charm' },
  },
  priest: {
    id: 'priest',
    label: 'Priest',
    role: 'healer',
    tree: PRIEST_TALENTS,
    startingGear: { weapon: 'novice-crook', chest: 'acolyte-robe', ring: 'band-of-clarity', trinket: 'lucky-charm' },
  },
};

/** One roster member's whole build. Uniform across founders and recruits. */
export interface CharacterBuild {
  classId: ClassId;
  name: string;
  stance: StanceConfig;
  /**
   * Earned-stat OVERRIDES layered on the class's own base — deliberately
   * partial, not a full BehaviorOverrides.
   *
   * Each class ships a different base (`damageWhileMoving` is 0.6 mage / 0.8
   * warrior / 0.5 priest), and phase 4 passed recruits only `{discipline}` so
   * they kept theirs. Storing a full object here would silently flatten all
   * three to the mage's numbers — a real balance change to the dungeon. Only
   * Elara carries values, from her dev tuning sliders.
   */
  behavior: Partial<BehaviorOverrides>;
  gear: GearSelection;
  /** Equipped consumable slot ids (shared bank pool feeds the whole party). */
  consumables: string[];
  talents: string[];
  /**
   * Own XP. v1 only Elara banks grind XP (recruits arrive at the cap, so a
   * shared pool would silently inflate her level — see the slice-1 decision),
   * but the field is per-character so levelling recruits needs no migration.
   */
  xp: number;
}

/** A fresh build for a class, at the level cap in that class's starting gear. */
export function newCharacter(classId: ClassId, name: string): CharacterBuild {
  return {
    classId,
    name,
    stance: { ...AUTO_PRESET },
    // Empty = "use the class's own base" (see CharacterBuild.behavior).
    behavior: {},
    gear: { ...CLASSES[classId].startingGear },
    consumables: [],
    talents: [],
    // Recruits arrive at the cap (the phase-4 rule), expressed as XP now that
    // level is derived per character rather than hardcoded to 10.
    xp: totalXpToReach(LEVEL_CAP),
  };
}

/** What the journal remembers of the last failed attempt (GDD §4 ⚰ line). */
export interface JournalWipeNote {
  atMs: number;
  killedBy?: string;
  /** Display name of who died last (the wipe moment). */
  deadName?: string;
  bossHpPctLeft?: number;
}

export interface JournalEntry extends BossKnowledge {
  lastWipe?: JournalWipeNote;
}

/** Repair a persisted character build against current content. */
function sanitizeCharacter(
  build: Partial<CharacterBuild> | undefined,
  fallback: CharacterBuild,
): CharacterBuild {
  const classId = build?.classId ?? fallback.classId;
  const cls = CLASSES[classId] ?? CLASSES[fallback.classId];
  const gear = { ...fallback.gear, ...(build?.gear ?? {}) };
  for (const [slot, id] of Object.entries(gear)) {
    if (id && !ITEMS_BY_ID[id]) gear[slot as GearSlot] = '';
  }
  const xp = typeof build?.xp === 'number' ? build.xp : fallback.xp;
  return {
    classId: cls.id,
    name: build?.name ?? fallback.name,
    stance: { ...fallback.stance, ...(build?.stance ?? {}) },
    behavior: { ...fallback.behavior, ...(build?.behavior ?? {}) },
    gear,
    consumables: sanitizeConsumableSelection(build?.consumables ?? []),
    talents: sanitizeTalentSelection(
      cls.tree,
      build?.talents ?? [],
      talentPointsForLevel(levelForXp(xp)),
    ),
    xp,
  };
}

/** Points left to spend for a selection in a tree at the given level. */
export function talentPointsRemaining(
  tree: TalentTree,
  talents: string[],
  level: number,
): number {
  const cost = new Map(tree.nodes.map((n) => [n.id, n.cost]));
  const spent = talents.reduce((sum, id) => sum + (cost.get(id) ?? 0), 0);
  return talentPointsForLevel(level) - spent;
}

/** Drop stance settings whose unlocking talent isn't in the selection. */
function stripLockedControls(
  tree: TalentTree,
  stance: StanceConfig,
  talents: string[],
): StanceConfig {
  if (stance.barrierPolicy && !unlockedControls(tree, talents).has('barrier-policy')) {
    const { barrierPolicy: _, ...rest } = stance;
    return rest;
  }
  return stance;
}

/**
 * Build a zustand updater that rewrites ONE character. Returning `null` from
 * the patch function is the no-op signal (an invalid spend, a missing
 * character), so every guard reads the same way.
 */
function patchChar(
  charId: CharId,
  fn: (c: CharacterBuild) => Partial<CharacterBuild> | null,
): (s: Store) => Partial<Store> {
  return (s) => {
    const c = s.characters[charId];
    if (!c) return {};
    const patch = fn(c);
    if (!patch) return {};
    return { characters: { ...s.characters, [charId]: { ...c, ...patch } } };
  };
}

/**
 * A fresh roster. All three founders always exist; the recruits are revealed by
 * `unlocks.cinderMawKilled`, exactly as the phase-4 roster record was. Elara
 * alone starts at level 1 — she is the character the game is played through.
 */
function defaultCharacters(): Record<CharId, CharacterBuild> {
  return {
    mage: {
      ...newCharacter('mage', FOUNDER_NAMES['mage']!),
      gear: { ...DEFAULT_GEAR_SELECTION },
      // Elara alone exposes the dev tuning sliders, so she alone stores values.
      behavior: { ...DEFAULT_BEHAVIOR },
      xp: 0,
    },
    warrior: newCharacter('warrior', FOUNDER_NAMES['warrior']!),
    priest: newCharacter('priest', FOUNDER_NAMES['priest']!),
  };
}


/** Dungeon bosses simulatable on the dummy once the journal knows them. */
export const DUNGEON_SIM_IDS = ['slagmaw', 'vulkan'];

/**
 * The exact SimRequest the current build would produce — used both to fire
 * sims and to detect stale results (compare everything but the iteration
 * count). The dummy simulates equipped slots for free at nominal charges
 * (GDD §3), and dungeon targets carry the roster + journal knowledge so the
 * worker simulates the trinity against only what's been discovered.
 */
export function buildSimRequest(
  s: Pick<Store, 'characters' | 'simTarget' | 'journal' | 'familiarity' | 'plans'>,
  iterations: number,
): SimRequest {
  const isDungeon = DUNGEON_SIM_IDS.includes(s.simTarget);
  const k = s.journal[s.simTarget];
  const fam = (charId: string) => familiarityBonus(s.familiarity[charId]?.[s.simTarget] ?? 0);
  const mage = s.characters['mage']!;
  const input = (charId: CharId): RosterBuildInput => {
    const c = s.characters[charId]!;
    return {
      stance: c.stance,
      gear: c.gear,
      consumables: [...c.consumables],
      talents: [...c.talents],
    };
  };
  return {
    stance: mage.stance,
    behavior: { ...DEFAULT_BEHAVIOR, ...mage.behavior },
    gear: mage.gear,
    level: levelForXp(mage.xp),
    talents: mage.talents,
    consumables: [...mage.consumables],
    bossId: s.simTarget,
    ...(isDungeon
      ? {
          encounter: {
            id: s.simTarget,
            knowledge: {
              seen: k?.seen ?? [],
              lowestBossHpPct: k?.lowestBossHpPct ?? 100,
              attempts: k?.attempts ?? 0,
            },
            // Still the trinity shape — slice 11 generalizes the worker to an
            // arbitrary party when the raid needs it.
            roster: { warrior: input('warrior'), priest: input('priest') },
            familiarity: { warrior: fam('warrior'), priest: fam('priest'), mage: fam('mage') },
            ...(s.plans[s.simTarget]?.entries.length ? { plan: s.plans[s.simTarget] } : {}),
          },
        }
      : {}),
    iterations,
    baseSeed: SIM_BASE_SEED,
  };
}

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });

export interface SimState {
  running: boolean;
  result: (SimResponse & { request: SimRequest }) | null;
}

/** What one attempt leaves behind for later comparison (GDD §3 review #4). */
export interface AttemptSummary {
  result: FightResult['result'];
  durationMs: number;
  dps: number;
  at: number; // wall-clock ms
}

export interface AttemptRecord {
  last?: AttemptSummary;
  /** Fastest kill so far. */
  best?: AttemptSummary;
}

export interface FightState {
  result: FightResult;
  seed: number;
  /** Solo pulls (Elara vs a world boss). */
  player?: CharacterDef;
  /** Party pulls (dungeon encounters) — defs in fight order. */
  party?: CharacterDef[];
  boss?: BossDefinition;
  pack?: MobPackDefinition;
  /** attempts/journal key: the boss id, or the dungeon encounter id. */
  bossId: string;
  /** Set on dungeon pulls — clearing it unlocks the next encounter. */
  encounterId?: string;
  review: FightReview;
  /** The boss's attempt record BEFORE this pull — what "vs last/best" compares against. */
  compare: AttemptRecord;
  // ---- live calls (phase-4 slice 6; party pulls only, all transient) ----
  /** Party members (character + stance) — kept for exact call re-runs. */
  partyMembers?: PartyMember[];
  /** The sanitized boss plan the pull ran with — replayed on every re-run. */
  plan?: BossPlan;
  /** Calls issued so far, appended live and replayed deterministically. */
  calls: TimedCall[];
  /** Resolved consumable slots [warrior, priest, mage] — for deferred consumption. */
  partyConsumables?: ConsumableDefinition[][];
  /** Party pulls run live: frontier-locked playback + call palette. */
  live?: boolean;
  /** Guards the deferred recording so a re-render can't record twice. */
  finalized?: boolean;
}

interface Store {
  // --- the roster (slice 8): one uniform record, explicit order ---
  characters: Record<CharId, CharacterBuild>;
  /**
   * Fold/display order. EXPLICIT, never `Object.keys(characters)`: it is the
   * shared-bank fold order (so the capacity clamp stays deterministic between
   * the live tick and offline catch-up) and it feeds `buildSimRequest`, whose
   * staleness check is a whole-request JSON compare — unstable key order there
   * would make every sim look stale.
   */
  rosterOrder: CharId[];
  /** Which character the build panel shows. */
  activeChar: CharId;
  setActiveChar: (c: CharId) => void;
  /**
   * Fill an earned slot with a character of the chosen class (GDD §2: slots
   * come from milestones, never purchase — this only spends a slot).
   */
  recruit: (classId: ClassId) => void;

  loadouts: Loadout[];
  setStance: (charId: CharId, patch: Partial<StanceConfig>) => void;
  setBehavior: (charId: CharId, patch: Partial<BehaviorOverrides>) => void;
  setGear: (charId: CharId, slot: GearSlot, itemId: string) => void;
  setConsumableSlot: (charId: CharId, slot: number, id: string) => void;
  applyAutoPreset: (charId: CharId) => void;
  spendTalent: (charId: CharId, id: string) => void;
  refundTalent: (charId: CharId, id: string) => void;
  respecTalents: (charId: CharId) => void;
  saveLoadout: (charId: CharId, name: string) => void;
  applyLoadout: (charId: CharId, name: string) => void;
  deleteLoadout: (name: string) => void;

  // --- training dummy (worker) ---
  sim: SimState;
  /** Dummy target (transient, not persisted). */
  simTarget: string;
  setSimTarget: (bossId: string) => void;
  runSim: (iterations: number) => void;

  // --- single real fight ---
  fight: FightState | null;
  /** Per-boss/encounter last/best attempt summaries (persisted). */
  attempts: Record<string, AttemptRecord>;
  pull: (bossId?: string) => void;

  // --- dungeon (phase 4) ---
  /** Ember Forge progress: encounter id → cleared (linear unlock chain). */
  dungeonCleared: Record<string, boolean>;
  pullEncounter: (encounterId: string) => void;
  recordEncounterCleared: (encounterId: string) => void;
  /** Issue live calls (slice 6): append at the frontier + re-run deterministically. */
  issueCall: (actions: PlanAction[]) => void;
  /** Record a live pull's outcome once — deferred from pull time to fight end. */
  finalizeFight: () => void;
  /** Post-fight: convert a call into a plan entry (bossCast-anchored, else time). */
  adoptCall: (action: PlanAction, atMs: number) => void;
  /** Boss journals (GDD §4): encounter id → discovered knowledge (persisted). */
  journal: Record<string, JournalEntry>;
  /** Familiarity: char id → boss/encounter id → attempts (persisted). */
  familiarity: Record<string, Record<string, number>>;
  /** Boss plans (GDD §4): encounter id → timeline of reactions (persisted). */
  plans: Record<string, BossPlan>;
  setPlan: (encounterId: string, plan: BossPlan) => void;

  // --- replay playback clock ---
  playT: number;
  /** Furthest point watched — live pulls lock the scrubber to this (slice 6). */
  frontierMs: number;
  playing: boolean;
  speed: number;
  setPlayback: (patch: Partial<{ playT: number; frontierMs: number; playing: boolean; speed: number }>) => void;

  // --- world loop ---
  view: View;
  setView: (v: View) => void;
  unlocks: Unlocks;
  materials: Materials;
  inventory: Inventory;
  /** Home-base building tiers (0 = unbuilt); the bank starts at tier 1. */
  buildings: Record<BuildingId, number>;
  upgradeBuilding: (id: BuildingId) => void;
  /** Per-character world presence: own position, own queue, run in parallel. */
  chars: Record<WorldCharId, CharWorld>;
  /** Who the map's task buttons act on (World + Base views share it). */
  activeWorldChar: WorldCharId;
  setActiveWorldChar: (c: WorldCharId) => void;
  lastSeenWall: number;
  multiplier: number;
  setMultiplier: (m: number) => void;
  awaySummary: AwaySummary | null;
  dismissAwaySummary: () => void;
  rateCache: Record<string, GrindResponse>;
  requestGrindRates: (charId: WorldCharId, zone: ZoneId) => void;
  enqueueTravel: (charId: WorldCharId, to: RegionId) => void;
  enqueueGrind: (charId: WorldCharId, zone: ZoneId) => void;
  enqueueGather: (charId: WorldCharId, zone: ZoneId) => void;
  enqueueCraft: (charId: WorldCharId, recipeId: string, count: number) => void;
  /** Task ids are unique roster-wide, so cancelling needs no character. */
  cancelTask: (id: string) => void;
  tickWorld: () => void;
  catchUp: () => void;
  recordBossKill: (boss: BossId) => void;
  buildBridge: () => void;
}

const DEFAULT_UNLOCKS: Unlocks = {
  banditKilled: false,
  bridgeBuilt: false,
  emberwingKilled: false,
  cinderMawKilled: false,
};

/**
 * Resolve each party member's equipped slots against the SHARED bank pool:
 * slots claim stock in party order; slots the remaining stock can't cover are
 * skipped (sanitize-not-block, like solo pulls — a pull never throws).
 */
function resolvePartySlots(
  perChar: string[][],
  inventory: Inventory,
): ConsumableDefinition[][] {
  const remaining: Inventory = { ...inventory };
  return perChar.map((slots) => {
    const defs: ConsumableDefinition[] = [];
    for (const id of slots) {
      const def = CONSUMABLES_BY_ID[id];
      if (!def) continue;
      if ((remaining[id] ?? 0) < 1) continue;
      remaining[id] = (remaining[id] ?? 0) - 1;
      defs.push(def);
    }
    return defs;
  });
}

/**
 * The world reducer's shared pools. `xp` is Elara's, which lives on her build
 * now — these two adapters keep `advanceAll` unaware of the character record.
 */
function sharedSlice(s: Pick<Store, 'characters' | 'materials' | 'inventory' | 'buildings'>): SharedSlice {
  return {
    xp: s.characters['mage']?.xp ?? 0,
    materials: s.materials,
    inventory: s.inventory,
    buildings: s.buildings,
  };
}

function applyShared(
  s: Pick<Store, 'characters'>,
  shared: SharedSlice,
): Pick<Store, 'characters' | 'materials' | 'inventory' | 'buildings'> {
  const mage = s.characters['mage']!;
  return {
    characters:
      shared.xp === mage.xp ? s.characters : { ...s.characters, mage: { ...mage, xp: shared.xp } },
    materials: shared.materials,
    inventory: shared.inventory,
    buildings: shared.buildings,
  };
}

/** Engine kit factories, keyed by class. All share the same signature. */
export const MAKERS: Record<ClassId, typeof makeMage> = {
  mage: makeMage,
  warrior: makeWarrior,
  priest: makePriest,
};

/**
 * The party order the trinity dungeon has always pulled in. Order is load-
 * bearing: `resolvePartySlots` claims shared-bank stock in it. Slice 11 passes
 * a raid's selection here instead.
 */
const TRINITY: CharId[] = ['warrior', 'priest', 'mage'];

/**
 * Build a party from roster ids: resolve shared-bank slots in party order,
 * make each kit, stamp a unique engine id, then apply comp rules.
 *
 * Ids are stamped AFTER the factory and BEFORE `applyComp` (the recipe the
 * CLI's `--raid` path uses): every `make*` hardcodes its class id, so two
 * warriors would collide on `Fight`'s duplicate-id guard. Here the CharId is
 * already unique per roster member, so it is simply carried through.
 */
function assembleParty(
  characters: Record<CharId, CharacterBuild>,
  charIds: CharId[],
  inventory: Inventory,
  fam: (charId: CharId) => number,
): { defs: CharacterDef[]; party: PartyMember[]; consumables: ConsumableDefinition[][] } {
  const members = charIds.map((id) => characters[id]).filter((c): c is CharacterBuild => Boolean(c));
  const ids = charIds.filter((id) => characters[id]);
  const consumables = resolvePartySlots(members.map((c) => c.consumables), inventory);

  const defs = applyComp(
    members.map((c, i) => ({
      ...MAKERS[c.classId](
        // Partial override on the class base — never a full behavior object.
        { ...c.behavior, discipline: (c.behavior.discipline ?? DEFAULT_BEHAVIOR.discipline) + fam(ids[i]!) },
        resolveGear(c.gear),
        levelForXp(c.xp),
        c.talents,
        consumables[i] ?? [],
      ),
      id: ids[i]!,
      name: c.name,
    })),
    GROUP_CDS,
    COMP_PASSIVES,
  );

  const party: PartyMember[] = defs.map((character, i) => ({
    character,
    stance: { ...members[i]!.stance },
  }));
  return { defs, party, consumables };
}

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Fresh world presence: everyone idle at the starting region. */
function emptyCharWorlds(): Record<WorldCharId, CharWorld> {
  return {
    mage: { region: 'heartfield', queue: [] },
    warrior: { region: 'heartfield', queue: [] },
    priest: { region: 'heartfield', queue: [] },
  };
}

/**
 * The uniform per-character build selector. Slice 8 made this a plain record
 * lookup: there is no Elara-vs-recruit branch left, and `level` is derived from
 * each character's own XP rather than hardcoded to the cap for recruits.
 */
function charBuild(
  s: Pick<Store, 'characters'>,
  charId: CharId,
): {
  classId: ClassId;
  name: string;
  stance: StanceConfig;
  behavior: Partial<BehaviorOverrides>;
  gear: GearSelection;
  level: number;
  talents: string[];
  consumables: string[];
} {
  const c = s.characters[charId] ?? newCharacter('mage', charId);
  return {
    classId: c.classId,
    name: c.name,
    stance: c.stance,
    behavior: c.behavior,
    gear: c.gear,
    level: levelForXp(c.xp),
    talents: c.talents,
    consumables: c.consumables,
  };
}

/**
 * React-side twin of `charBuild`. Each field is selected separately so every
 * subscription returns a stable reference (a store object or a primitive) —
 * selecting the whole build object would allocate a fresh one per render and
 * thrash.
 */
export function useCharBuild(charId: CharId): {
  classId: ClassId;
  name: string;
  stance: StanceConfig;
  behavior: Partial<BehaviorOverrides>;
  gear: GearSelection;
  level: number;
  talents: string[];
  consumables: string[];
} {
  const classId = useStore((s) => s.characters[charId]?.classId ?? 'mage');
  const name = useStore((s) => s.characters[charId]?.name ?? charId);
  const stance = useStore((s) => s.characters[charId]?.stance ?? AUTO_PRESET);
  const gear = useStore((s) => s.characters[charId]?.gear ?? EMPTY_GEAR);
  const behavior = useStore((s) => s.characters[charId]?.behavior ?? EMPTY_BEHAVIOR);
  const talents = useStore((s) => s.characters[charId]?.talents ?? EMPTY_IDS);
  const consumables = useStore((s) => s.characters[charId]?.consumables ?? EMPTY_IDS);
  const level = useStore((s) => levelForXp(s.characters[charId]?.xp ?? 0));
  return { classId, name, stance, gear, behavior, talents, level, consumables };
}

/** Meta for the roster UI, in roster order. Replaces the old ROSTER_CHARS literal. */
export function useRoster(): { id: CharId; name: string; classId: ClassId; classLabel: string; role: string }[] {
  const characters = useStore((s) => s.characters);
  const order = useStore((s) => s.rosterOrder);
  return order
    .filter((id) => characters[id])
    .map((id) => {
      const c = characters[id]!;
      return {
        id,
        name: c.name,
        classId: c.classId,
        classLabel: CLASSES[c.classId].label,
        role: CLASSES[c.classId].role,
      };
    });
}

/** Stable empty fallbacks — a fresh literal per render would thrash subscriptions. */
const EMPTY_IDS: string[] = [];
const EMPTY_GEAR: GearSelection = { weapon: '', chest: '', ring: '', trinket: '' };
const EMPTY_BEHAVIOR: Partial<BehaviorOverrides> = {};

/**
 * A character's world presence, guaranteed present. `chars` is keyed by the
 * open `CharId` type, so every lookup is optional to the compiler; recruits
 * added mid-save start idle at the starting region rather than crashing.
 */
function charWorld(s: Pick<Store, 'chars'>, charId: CharId): CharWorld {
  return s.chars[charId] ?? { region: 'heartfield', queue: [] };
}

/** The region the character will be in once all currently-queued travel resolves. */
function projectedRegion(queue: Task[], region: RegionId): RegionId {
  let r = region;
  for (const t of queue) if (t.kind === 'travel') r = t.to;
  return r;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      // Offline catch-up runs exactly once per load, before the live tick.
      let caughtUp = false;
      // Worker dispatch is keyed by id so 'sim' and 'grind' replies never cross.
      let nextId = 1;
      const pendingSim = new Map<number, SimRequest>();
      const pendingGrindKey = new Map<number, string>();
      const inFlightGrind = new Set<string>();

      worker.onmessage = (msg: MessageEvent<WorkerResponse>) => {
        const m = msg.data;
        if (m.kind === 'sim') {
          const request = pendingSim.get(m.id);
          if (!request) return;
          pendingSim.delete(m.id);
          set({ sim: { running: false, result: { ...m.res, request } } });
        } else {
          const key = pendingGrindKey.get(m.id);
          if (!key) return;
          pendingGrindKey.delete(m.id);
          inFlightGrind.delete(key);
          set((s) => ({ rateCache: { ...s.rateCache, [key]: m.res } }));
        }
      };

      const post = (envelope: WorkerRequest) => worker.postMessage(envelope);

      return {
        characters: defaultCharacters(),
        rosterOrder: [...FOUNDER_CHARS],
        activeChar: 'mage',
        setActiveChar: (c) => set((s) => (s.characters[c] ? { activeChar: c } : {})),
        recruit: (classId) =>
          set((s) => {
            if (!CLASSES[classId]) return {};
            // A slot must be earned and free. Never blocks with an error — the
            // UI only offers the button when there's room.
            const slots = rosterSlots({ unlocks: s.unlocks, dungeonCleared: s.dungeonCleared });
            if (s.rosterOrder.length >= slots) return {};
            const id = nextCharId(classId, s.rosterOrder);
            const name = nextRecruitName(
              classId,
              s.rosterOrder.map((c) => s.characters[c]?.name ?? ''),
            );
            return {
              characters: { ...s.characters, [id]: newCharacter(classId, name) },
              rosterOrder: [...s.rosterOrder, id],
              // A recruit joins wherever the party already is, idle.
              chars: {
                ...s.chars,
                [id]: { region: charWorld(s, 'mage').region, queue: [] },
              },
            };
          }),

        loadouts: [],
        setStance: (charId, patch) =>
          set(patchChar(charId, (c) => ({ stance: { ...c.stance, ...patch } }))),
        setBehavior: (charId, patch) =>
          set(patchChar(charId, (c) => ({ behavior: { ...c.behavior, ...patch } }))),
        setGear: (charId, slot, itemId) =>
          set(patchChar(charId, (c) => ({ gear: { ...c.gear, [slot]: itemId } }))),
        setConsumableSlot: (charId, slot, id) =>
          set(
            patchChar(charId, (c) => {
              if (slot < 0 || slot >= CONSUMABLE_SLOTS) return null;
              const slots = Array.from({ length: CONSUMABLE_SLOTS }, (_, i) => c.consumables[i] ?? '');
              slots[slot] = CONSUMABLES_BY_ID[id] ? id : '';
              return { consumables: slots.filter((x) => x !== '') };
            }),
          ),
        applyAutoPreset: (charId) => set(patchChar(charId, () => ({ stance: { ...AUTO_PRESET } }))),

        spendTalent: (charId, id) =>
          set(
            patchChar(charId, (c) => {
              const tree = CLASSES[c.classId].tree;
              const node = tree.nodes.find((n) => n.id === id);
              if (!node || c.talents.includes(id)) return null;
              if ((node.requires ?? []).some((req) => !c.talents.includes(req))) return null;
              if (node.cost > talentPointsRemaining(tree, c.talents, levelForXp(c.xp))) return null;
              return { talents: [...c.talents, id] };
            }),
          ),
        refundTalent: (charId, id) =>
          set(
            patchChar(charId, (c) => {
              if (!c.talents.includes(id)) return null;
              const tree = CLASSES[c.classId].tree;
              const dependent = tree.nodes.some(
                (n) => c.talents.includes(n.id) && (n.requires ?? []).includes(id),
              );
              if (dependent) return null;
              const talents = c.talents.filter((t) => t !== id);
              return { talents, stance: stripLockedControls(tree, c.stance, talents) };
            }),
          ),
        // Respec costs herbs (GDD §2 "small resource cost") — payable from the
        // start region, so it's never a hard lock. Charged once, per character.
        respecTalents: (charId) =>
          set((s) => {
            const c = s.characters[charId];
            if (!c || c.talents.length === 0) return {};
            if ((s.materials[RESPEC_COST.material] ?? 0) < RESPEC_COST.count) return {};
            const tree = CLASSES[c.classId].tree;
            return {
              characters: {
                ...s.characters,
                [charId]: { ...c, talents: [], stance: stripLockedControls(tree, c.stance, []) },
              },
              materials: {
                ...s.materials,
                [RESPEC_COST.material]: s.materials[RESPEC_COST.material] - RESPEC_COST.count,
              },
            };
          }),

        saveLoadout: (charId, name) =>
          set((s) => {
            const c = s.characters[charId];
            if (!c) return {};
            const loadout: Loadout = {
              name,
              stance: { ...c.stance },
              talents: [...c.talents],
              gear: { ...c.gear },
              consumables: [...c.consumables],
              classId: c.classId,
            };
            const others = s.loadouts.filter((l) => l.name !== name);
            return { loadouts: [...others, loadout] };
          }),
        applyLoadout: (charId, name) =>
          set(
            patchChar(charId, (c) => {
              const saved = get().loadouts.find((l) => l.name === name);
              // A loadout only applies to its own class — gear and talents from
              // another class would sanitize away to nothing.
              if (!saved || saved.classId !== c.classId) return null;
              // The stored loadout is never mutated; the applied copy is
              // repaired against current content and the level's point budget.
              const tree = CLASSES[c.classId].tree;
              const talents = sanitizeTalentSelection(
                tree,
                saved.talents,
                talentPointsForLevel(levelForXp(c.xp)),
              );
              const gear = Object.fromEntries(
                Object.entries(saved.gear).map(([slot, id]) => [slot, ITEMS_BY_ID[id] ? id : '']),
              ) as GearSelection;
              return {
                talents,
                gear,
                stance: stripLockedControls(tree, { ...saved.stance }, talents),
                consumables: sanitizeConsumableSelection(saved.consumables ?? []),
              };
            }),
          ),
        deleteLoadout: (name) =>
          set((s) => ({ loadouts: s.loadouts.filter((l) => l.name !== name) })),

        sim: { running: false, result: null },
        simTarget: 'cinder-maw',
        setSimTarget: (bossId) =>
          set({
            simTarget:
              BOSS_FACTORIES[bossId] || DUNGEON_SIM_IDS.includes(bossId) ? bossId : 'cinder-maw',
          }),
        runSim: (iterations) => {
          const s = get();
          if (s.sim.running) return;
          const id = nextId++;
          const request = buildSimRequest(s, iterations);
          pendingSim.set(id, request);
          set({ sim: { running: true, result: s.sim.result } });
          post({ kind: 'sim', id, req: request });
        },

        fight: null,
        attempts: {},
        pull: (bossId = 'cinder-maw') => {
          const { characters, inventory, attempts } = get();
          const { behavior, gear, stance, talents, xp, consumables } = characters['mage']!;
          const seed = Math.floor(Math.random() * 2 ** 31);
          // Slots the current stock can actually cover; short slots are
          // skipped for this fight (never blocks the pull).
          const defs = resolveConsumables(consumables, inventory);
          const player = makeMage(behavior, resolveGear(gear), levelForXp(xp), talents, defs);
          const boss = (BOSS_FACTORIES[bossId] ?? makeCinderMaw)();
          const result = runFight({ player, boss, stance, seed });
          const review = fightReview(result, { player, boss, stance });
          // Comparison targets are the attempts BEFORE this pull; then the
          // record advances (best = fastest kill).
          const compare: AttemptRecord = attempts[bossId] ?? {};
          const attempt: AttemptSummary = {
            result: result.result,
            durationMs: result.durationMs,
            dps: review.summary.dps,
            at: Date.now(),
          };
          const best =
            attempt.result === 'kill' &&
            (compare.best === undefined || attempt.durationMs < compare.best.durationMs)
              ? attempt
              : compare.best;
          const nextAttempts = {
            ...attempts,
            [bossId]: { last: attempt, ...(best !== undefined ? { best } : {}) },
          };
          // Real fights consume what they brought (GDD §3), win or lose:
          // passives 1 per distinct granted id; potion charges from the event
          // stream (the stream is the source of truth), capped by stock.
          const spent: Inventory = {};
          for (const def of defs) {
            if (def.kind === 'passive') spent[def.id] = 1;
          }
          for (const def of defs) {
            if (def.kind !== 'active' || spent[def.id] !== undefined) continue;
            const used = result.events.filter(
              (e) => e.type === 'heal' && e.source === PLAYER_ID && e.meta?.['abilityId'] === def.ability.id,
            ).length;
            spent[def.id] = Math.min(used, inventory[def.id] ?? 0);
          }
          const nextInventory = { ...inventory };
          for (const [id, n] of Object.entries(spent)) {
            if (n > 0) nextInventory[id] = Math.max(0, (nextInventory[id] ?? 0) - n);
          }
          set({
            fight: { result, seed, player, boss, bossId, review, compare, calls: [] },
            attempts: nextAttempts,
            inventory: nextInventory,
            playT: 0,
            frontierMs: 0,
            playing: true,
            speed: 1,
            view: 'combat',
          });
        },

        // ---- dungeon (phase 4) ----
        dungeonCleared: {},
        journal: {},
        familiarity: {},
        plans: {},
        setPlan: (encounterId, plan) =>
          set((s) => ({ plans: { ...s.plans, [encounterId]: plan } })),
        recordEncounterCleared: (encounterId) =>
          set((s) =>
            s.dungeonCleared[encounterId]
              ? {}
              : { dungeonCleared: { ...s.dungeonCleared, [encounterId]: true } },
          ),
        pullEncounter: (encounterId) => {
          const { characters, inventory, attempts, unlocks, dungeonCleared, familiarity } = get();
          if (!unlocks.cinderMawKilled) return;
          const dungeon = makeEmberForge();
          const enc = encounterById(dungeon, encounterId);
          if (!enc) return;
          // Linear gate: trash before Slagmaw before Vulkan.
          const idx = dungeon.encounters.findIndex((e) => e.id === encounterId);
          if (idx > 0 && !dungeonCleared[dungeon.encounters[idx - 1]!.id]) return;

          // Boss familiarity (GDD §2): attempts at THIS boss sharpen each
          // character — bonus discipline on top of their earned stat.
          const fam = (charId: string): number =>
            enc.kind === 'boss'
              ? familiarityBonus(familiarity[charId]?.[encounterId] ?? 0)
              : 0;
          const { defs, party, consumables: partyCons } = assembleParty(
            characters,
            TRINITY,
            inventory,
            fam,
          );
          const seed = Math.floor(Math.random() * 2 ** 31);
          // The boss plan rides along on boss pulls (sanitized against the
          // actual party — persisted plans survive content changes).
          const plan =
            enc.kind === 'boss' && get().plans[encounterId]
              ? sanitizePlan(get().plans[encounterId]!, defs)
              : undefined;
          const setup =
            enc.kind === 'boss'
              ? { party, boss: enc.boss, seed, ...(plan?.entries.length ? { plan } : {}) }
              : { party, pack: enc.pack, seed };
          const result = runFight(setup);
          const review = fightReview(result, setup);

          // Live pulls defer ALL recording (attempts, consumption, journal,
          // familiarity) to `finalizeFight`, which runs from the final stream
          // once playback reaches the natural end — issuing a live call re-runs
          // the fight, so recording eagerly here would double-count (slice 6).
          const compare: AttemptRecord = attempts[encounterId] ?? {};

          set({
            fight: {
              result,
              seed,
              party: defs,
              ...(enc.kind === 'boss' ? { boss: enc.boss } : { pack: enc.pack }),
              bossId: encounterId,
              encounterId,
              review,
              compare,
              partyMembers: party,
              ...(plan?.entries.length ? { plan } : {}),
              calls: [],
              partyConsumables: partyCons,
              live: true,
              finalized: false,
            },
            playT: 0,
            frontierMs: 0,
            playing: true,
            speed: 1,
            view: 'combat',
          });
        },

        issueCall: (actions) => {
          const { fight, frontierMs } = get();
          if (!fight || !fight.live || fight.finalized || !fight.partyMembers) return;
          const atMs = frontierMs;
          const appended: TimedCall[] = actions.map((action) => ({ atMs, action }));
          const calls = [...fight.calls, ...appended];
          // Deterministic re-run: same seed/party/plan + the appended calls.
          // Purity guarantees every event before `atMs` is byte-identical, so
          // the past the player already watched is untouched (plan.test.ts).
          const setup = fight.boss
            ? { party: fight.partyMembers, boss: fight.boss, seed: fight.seed, ...(fight.plan ? { plan: fight.plan } : {}), calls }
            : { party: fight.partyMembers, pack: fight.pack!, seed: fight.seed, calls };
          const result = runFight(setup);
          const review = fightReview(result, setup);
          set({ fight: { ...fight, result, review, calls }, playing: true });
        },

        finalizeFight: () => {
          const { fight, attempts, inventory, journal, familiarity } = get();
          if (!fight || !fight.live || fight.finalized) return;
          const { result, review, compare, encounterId } = fight;
          const key = encounterId ?? fight.bossId;

          // Attempts / last-best (best = fastest kill).
          const attempt: AttemptSummary = {
            result: result.result,
            durationMs: result.durationMs,
            dps: review.summary.dps,
            at: Date.now(),
          };
          const best =
            attempt.result === 'kill' &&
            (compare.best === undefined || attempt.durationMs < compare.best.durationMs)
              ? attempt
              : compare.best;
          const nextAttempts = {
            ...attempts,
            [key]: { last: attempt, ...(best !== undefined ? { best } : {}) },
          };

          // Consumption from the FINAL stream (win or lose): passives 1 per char
          // per distinct id; potion charges per char from `heal` events; capped
          // by the shared stock.
          const slots = fight.partyConsumables ?? [];
          const members = [
            { id: 'warrior', cons: slots[0] ?? [] },
            { id: 'priest', cons: slots[1] ?? [] },
            { id: 'mage', cons: slots[2] ?? [] },
          ];
          const spent: Inventory = {};
          for (const m of members) {
            const seen = new Set<string>();
            for (const def of m.cons) {
              if (seen.has(def.id)) continue;
              seen.add(def.id);
              if (def.kind === 'passive') {
                spent[def.id] = (spent[def.id] ?? 0) + 1;
              } else {
                const used = result.events.filter(
                  (e) =>
                    e.type === 'heal' &&
                    e.source === m.id &&
                    e.meta?.['abilityId'] === def.ability.id,
                ).length;
                spent[def.id] = (spent[def.id] ?? 0) + used;
              }
            }
          }
          const nextInventory = { ...inventory };
          for (const [id, n] of Object.entries(spent)) {
            const capped = Math.min(n, nextInventory[id] ?? 0);
            if (capped > 0) nextInventory[id] = (nextInventory[id] ?? 0) - capped;
          }

          // Journal + familiarity (boss pulls only) — every attempt counts,
          // wipes included (GDD §2/§4).
          let nextJournal = journal;
          let nextFamiliarity = familiarity;
          if (fight.boss) {
            const k = discover(fight.boss, result.events, journal[key]);
            const names: Record<string, string> = { warrior: 'Borin', priest: 'Seren', mage: 'Elara' };
            let deadName: string | undefined;
            for (const e of result.events) {
              if (e.type === 'death' && names[e.source]) deadName = names[e.source];
            }
            const wipe = review.wipe;
            const entry: JournalEntry = {
              ...k,
              ...(wipe
                ? {
                    lastWipe: {
                      atMs: wipe.atMs,
                      ...(wipe.killedBy !== undefined ? { killedBy: wipe.killedBy } : {}),
                      ...(deadName !== undefined ? { deadName } : {}),
                      ...(wipe.bossHpPctLeft !== undefined ? { bossHpPctLeft: wipe.bossHpPctLeft } : {}),
                    },
                  }
                : {}),
            };
            nextJournal = { ...journal, [key]: entry };
            nextFamiliarity = { ...familiarity };
            for (const charId of ['warrior', 'priest', 'mage']) {
              nextFamiliarity[charId] = {
                ...(nextFamiliarity[charId] ?? {}),
                [key]: (nextFamiliarity[charId]?.[key] ?? 0) + 1,
              };
            }
          }

          // A watched kill unlocks the next encounter.
          const nextCleared =
            result.result === 'kill' && encounterId && !get().dungeonCleared[encounterId]
              ? { ...get().dungeonCleared, [encounterId]: true }
              : get().dungeonCleared;

          set({
            fight: { ...fight, finalized: true },
            attempts: nextAttempts,
            inventory: nextInventory,
            journal: nextJournal,
            familiarity: nextFamiliarity,
            dungeonCleared: nextCleared,
          });
        },

        adoptCall: (action, atMs) => {
          const { fight, journal, plans } = get();
          if (!fight?.encounterId) return;
          const key = fight.encounterId;
          // Anchor to the nearest DISCOVERED boss cast within 8s before the
          // call, else fall back to a raw time trigger (GDD §3 ground rule 2).
          const seen = new Set(journal[key]?.seen ?? []);
          let anchor: { abilityId: string; t: number } | undefined;
          for (const e of fight.result.events) {
            if (e.type !== 'castEnd' || e.source !== BOSS_ID) continue;
            if (e.t < atMs - 8000 || e.t > atMs) continue;
            const abilityId = String(e.meta?.['abilityId'] ?? '');
            if (!seen.has(`timeline:${abilityId}`)) continue;
            if (!anchor || e.t > anchor.t) anchor = { abilityId, t: e.t };
          }
          const trigger: PlanTrigger = anchor
            ? { kind: 'bossCast', abilityId: anchor.abilityId }
            : { kind: 'time', atMs: Math.round(atMs) };
          const plan = plans[key] ?? { entries: [] };
          set({ plans: { ...plans, [key]: { entries: [...plan.entries, { trigger, action }] } } });
        },

        playT: 0,
        frontierMs: 0,
        playing: false,
        speed: 1,
        setPlayback: (patch) => set(patch),

        // ---- world loop ----
        view: 'map',
        setView: (v) => set({ view: v }),
        xp: 0,
        region: 'heartfield',
        unlocks: { ...DEFAULT_UNLOCKS },
        materials: { bridgeTimber: 0, sunleaf: 0, emberbloom: 0 },
        inventory: {},
        buildings: { ...INITIAL_BUILDINGS },
        upgradeBuilding: (id) =>
          set((s) => {
            const tier = nextTier(id, s.buildings);
            if (!tier || !canAffordTier(tier, s.materials)) return {};
            const materials = { ...s.materials };
            for (const [m, n] of Object.entries(tier.cost)) {
              materials[m as keyof Materials] -= n;
            }
            return { materials, buildings: { ...s.buildings, [id]: (s.buildings[id] ?? 0) + 1 } };
          }),
        chars: emptyCharWorlds(),
        activeWorldChar: 'mage',
        setActiveWorldChar: (c) => set({ activeWorldChar: c }),
        lastSeenWall: Date.now(),
        multiplier: DEFAULT_MULTIPLIER,
        setMultiplier: (m) => set({ multiplier: m }),
        awaySummary: null,
        dismissAwaySummary: () => set({ awaySummary: null }),

        rateCache: {},
        requestGrindRates: (charId, zone) => {
          const { rateCache } = get();
          const b = charBuild(get(), charId);
          const key = rateKey(charId, zone, b.level, b.gear, b.stance, b.behavior, b.talents);
          if (rateCache[key] || inFlightGrind.has(key)) return;
          const id = nextId++;
          pendingGrindKey.set(id, key);
          inFlightGrind.add(key);
          const req: GrindRequest = {
            zone,
            // The worker picks a kit factory, so it wants the CLASS -- roster
            // ids stopped being class names in slice 8.
            charId: b.classId,
            stance: b.stance,
            behavior: b.behavior,
            gear: b.gear,
            level: b.level,
            talents: b.talents,
            iterations: 300,
            baseSeed: SIM_BASE_SEED,
          };
          post({ kind: 'grind', id, req });
        },

        enqueueTravel: (charId, to) =>
          set((s) => {
            const cw = charWorld(s, charId);
            if (projectedRegion(cw.queue, cw.region) === to) return {};
            const task: TravelTask = { id: uid(), charId, kind: 'travel', to, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 };
            return { chars: { ...s.chars, [charId]: { ...cw, queue: [...cw.queue, task] } } };
          }),

        enqueueGrind: (charId, zone) => {
          const s = get();
          const b = charBuild(s, charId);
          const rate = s.rateCache[rateKey(charId, zone, b.level, b.gear, b.stance, b.behavior, b.talents)];
          if (!rate) return; // card keeps the button disabled until the rate is known
          const cw = charWorld(s, charId);
          const next = [...cw.queue];
          if (projectedRegion(next, cw.region) !== zone) {
            next.push({ id: uid(), charId, kind: 'travel', to: zone, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 });
          }
          const grind: GrindTask = {
            id: uid(),
            charId,
            kind: 'grind',
            zone,
            durationGameMs: GRIND_BLOCK_GAME_MS,
            accruedGameMs: 0,
            xpPerHour: rate.xpPerHour,
            deathsPerHour: rate.deathsPerHour,
            levelAtEnqueue: b.level,
          };
          set({ chars: { ...s.chars, [charId]: { ...cw, queue: [...next, grind] } } });
        },

        enqueueGather: (charId, zone) =>
          set((s) => {
            const meta = REGIONS.find((r) => r.id === zone)?.gather;
            if (!meta) return {};
            const cw = charWorld(s, charId);
            const next = [...cw.queue];
            if (projectedRegion(next, cw.region) !== zone) {
              next.push({ id: uid(), charId, kind: 'travel', to: zone, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 });
            }
            const gather: GatherTask = {
              id: uid(),
              charId,
              kind: 'gather',
              zone,
              material: meta.material,
              ratePerHour: meta.ratePerHour,
              durationGameMs: GATHER_BLOCK_GAME_MS,
              accruedGameMs: 0,
            };
            return { chars: { ...s.chars, [charId]: { ...cw, queue: [...next, gather] } } };
          }),

        // Crafting runs anywhere; the workshop never gates, its tier only
        // snapshots into unitGameMs at enqueue (GrindTask rate-snapshot
        // precedent). Herbs for ALL units are paid at enqueue. The cap guard
        // ignores other queued crafts of the same recipe — the reducer's
        // lose-overflow rule covers that hole.
        enqueueCraft: (charId, recipeId, count) =>
          set((s) => {
            const recipe = RECIPES_BY_ID[recipeId];
            if (!recipe || count < 1 || !Number.isInteger(count)) return {};
            if ((s.inventory[recipeId] ?? 0) + count > bankCapacity(s.buildings)) return {};
            const materials = { ...s.materials };
            for (const [herb, per] of Object.entries(recipe.herbs)) {
              const need = per * count;
              if ((materials[herb as keyof Materials] ?? 0) < need) return {};
              materials[herb as keyof Materials] -= need;
            }
            const unitGameMs = Math.round(recipe.unitGameMs * craftTimeMult(s.buildings));
            const craft: CraftTask = {
              id: uid(),
              charId,
              kind: 'craft',
              recipeId,
              count,
              unitGameMs,
              producedUnits: 0,
              durationGameMs: unitGameMs * count,
              accruedGameMs: 0,
            };
            const cw = charWorld(s, charId);
            return { materials, chars: { ...s.chars, [charId]: { ...cw, queue: [...cw.queue, craft] } } };
          }),

        cancelTask: (id) =>
          set((s) => {
            // Task ids are unique across the roster, so a plain scan finds the
            // owner — callers don't have to know whose queue it sits in.
            const owner = s.rosterOrder.find((c) =>
              charWorld(s, c).queue.some((task) => task.id === id),
            );
            if (!owner) return {};
            const cw = charWorld(s, owner);
            const t = cw.queue.find((task) => task.id === id)!;
            const chars = {
              ...s.chars,
              [owner]: { ...cw, queue: cw.queue.filter((task) => task.id !== id) },
            };
            // Cancelling a craft refunds herbs for units not yet started;
            // the in-progress unit's herbs are lost, produced units stay.
            if (t.kind === 'craft') {
              const recipe = RECIPES_BY_ID[t.recipeId];
              const started = Math.ceil(t.accruedGameMs / t.unitGameMs);
              const refundUnits = Math.max(0, t.count - Math.max(started, t.producedUnits));
              if (recipe && refundUnits > 0) {
                const cap = bankCapacity(s.buildings);
                const materials = { ...s.materials };
                for (const [herb, per] of Object.entries(recipe.herbs)) {
                  // Refunds clamp at the bank cap (never-confiscate rule);
                  // the excess is lost — rare: needs herbs at cap AND a cancel.
                  const cur = materials[herb as keyof Materials] ?? 0;
                  materials[herb as keyof Materials] = Math.min(
                    Math.max(cur, cap),
                    cur + per * refundUnits,
                  );
                }
                return { chars, materials };
              }
            }
            return { chars };
          }),

        tickWorld: () =>
          set((s) => {
            const now = Date.now();
            const elapsedGameMs = Math.max(0, (now - s.lastSeenWall) * s.multiplier);
            if (elapsedGameMs <= 0) return { lastSeenWall: now };
            const { shared, chars } = advanceAll(
              sharedSlice(s), s.chars, elapsedGameMs, s.rosterOrder,
            );
            return { ...applyShared(s, shared), chars, lastSeenWall: now };
          }),

        // Reconcile the wall-time the app was closed, once per load, via the
        // same pure reducer — and surface a "while you were away" summary.
        // Called from App on mount BEFORE the live tick starts, so the summary
        // is never lost to a tick draining the queue first.
        catchUp: () => {
          if (caughtUp) return;
          caughtUp = true;
          const s = get();
          const now = Date.now();
          const elapsedGameMs = Math.min(
            MAX_CATCHUP_GAME_MS,
            Math.max(0, (now - s.lastSeenWall) * s.multiplier),
          );
          const { shared, chars, events } = advanceAll(
            sharedSlice(s), s.chars, elapsedGameMs, s.rosterOrder,
          );
          set({
            ...applyShared(s, shared),
            chars,
            lastSeenWall: now,
            awaySummary: events.length ? { events, elapsedGameMs } : null,
          });
        },

        recordBossKill: (boss) =>
          set((s) => ({
            unlocks: {
              ...s.unlocks,
              banditKilled: s.unlocks.banditKilled || boss === 'bandit-warlord',
              emberwingKilled: s.unlocks.emberwingKilled || boss === 'emberwing',
              // Cinder Maw falling opens the Ember Forge and brings the recruits.
              cinderMawKilled: s.unlocks.cinderMawKilled || boss === 'cinder-maw',
            },
          })),

        buildBridge: () =>
          set((s) => {
            if (s.unlocks.bridgeBuilt || s.materials.bridgeTimber < BRIDGE_COST.bridgeTimber) return {};
            return {
              unlocks: { ...s.unlocks, bridgeBuilt: true },
              materials: { ...s.materials, bridgeTimber: s.materials.bridgeTimber - BRIDGE_COST.bridgeTimber },
            };
          }),
      };
    },
    {
      name: 'rpg-world-v1',
      version: 11,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        characters: s.characters,
        rosterOrder: s.rosterOrder,
        loadouts: s.loadouts,
        dungeonCleared: s.dungeonCleared,
        journal: s.journal,
        familiarity: s.familiarity,
        plans: s.plans,
        unlocks: s.unlocks,
        materials: s.materials,
        inventory: s.inventory,
        buildings: s.buildings,
        attempts: s.attempts,
        chars: s.chars,
        lastSeenWall: s.lastSeenWall,
        multiplier: s.multiplier,
      }),
      migrate: (persisted, version) => {
        const s = persisted as Partial<Store>;
        // Pre-v11 builds live as loose top-level fields on the raw blob; the
        // v11 step below folds them into `characters`, so the early steps
        // write through this view rather than through `Store`.
        const legacyBuild = persisted as {
          talents?: string[];
          equippedConsumables?: string[];
        };
        if (version < 2) {
          legacyBuild.talents = [];
          s.loadouts = [];
        }
        if (version < 3) {
          // Slice 5: professions/consumables join. Backfill herb keys so the
          // reducer's `+=` never sees undefined; old task kinds carry forward.
          s.inventory = {};
          legacyBuild.equippedConsumables = [];
          s.loadouts = (s.loadouts ?? []).map((l) => ({ ...l, consumables: [] }));
        }
        if (version < 4) {
          // Post-fight review follow-up: per-boss attempt history joins.
          s.attempts = {};
        }
        // (v5, slice 6: home base — `buildings` joins via the unconditional
        // backfill below; the bank arrives pre-built at tier 1. Over-cap
        // holdings are never confiscated, they just stop growing.)
        // (v6, phase 4: roster + dungeon join via the unconditional backfills
        // below; saves that already killed Cinder Maw get the recruits
        // immediately via the attempts-record backfill.)
        s.materials = { bridgeTimber: 0, sunleaf: 0, emberbloom: 0, ...(s.materials ?? {}) };
        s.buildings = { ...INITIAL_BUILDINGS, ...(s.buildings ?? {}) };
        s.unlocks = { ...DEFAULT_UNLOCKS, ...(s.unlocks ?? {}) };
        if (!s.unlocks.cinderMawKilled && s.attempts?.['cinder-maw']?.best) {
          s.unlocks.cinderMawKilled = true;
        }
        s.dungeonCleared = { ...(s.dungeonCleared ?? {}) };
        // (v7, phase-4 slice 4: journal + familiarity join unconditionally.)
        s.journal = { ...(s.journal ?? {}) };
        s.familiarity = { ...(s.familiarity ?? {}) };
        // (v8, phase-4 slice 5: boss plans join unconditionally; entries are
        // sanitized against the real party at pull/sim time, not here.)
        s.plans = { ...(s.plans ?? {}) };
        // ---- v11 (phase-5 slice 8): the uniform `characters` record ---------
        // Elara's legacy top-level build fields and the `roster` record fold
        // into one map. The FOUNDERS KEEP THEIR IDS ('mage'/'warrior'/'priest'),
        // which is the whole reason this migration is safe: every persisted
        // `plans[].charId`, `familiarity[charId]`, `chars[charId]` and journal
        // key still resolves, so none of them need remapping.
        if (!s.characters) {
          const legacy = persisted as {
            stance?: StanceConfig;
            behavior?: Partial<BehaviorOverrides>;
            gear?: GearSelection;
            talents?: string[];
            equippedConsumables?: string[];
            xp?: number;
            roster?: Record<string, Partial<CharacterBuild> & { consumables?: string[] }>;
          };
          const base = defaultCharacters();
          s.characters = {
            mage: sanitizeCharacter(
              {
                classId: 'mage',
                name: FOUNDER_NAMES['mage']!,
                ...(legacy.stance ? { stance: legacy.stance } : {}),
                // Only Elara ever had dev-slider values; recruits keep {} so
                // each class keeps its own behavior base.
                ...(legacy.behavior ? { behavior: legacy.behavior } : {}),
                ...(legacy.gear ? { gear: legacy.gear } : {}),
                ...(legacy.talents ? { talents: legacy.talents } : {}),
                ...(legacy.equippedConsumables ? { consumables: legacy.equippedConsumables } : {}),
                xp: legacy.xp ?? 0,
              },
              base['mage']!,
            ),
            warrior: sanitizeCharacter(
              { ...legacy.roster?.['warrior'], classId: 'warrior', name: FOUNDER_NAMES['warrior']! },
              base['warrior']!,
            ),
            priest: sanitizeCharacter(
              { ...legacy.roster?.['priest'], classId: 'priest', name: FOUNDER_NAMES['priest']! },
              base['priest']!,
            ),
          };
        } else {
          // Already v11+: repair each build against current content.
          const base = defaultCharacters();
          s.characters = Object.fromEntries(
            Object.entries(s.characters).map(([id, c]) => [
              id,
              sanitizeCharacter(c, base[c?.classId ?? 'mage'] ?? base['mage']!),
            ]),
          );
        }
        s.rosterOrder = (s.rosterOrder ?? [...FOUNDER_CHARS]).filter((id) => s.characters![id]);
        for (const id of Object.keys(s.characters)) {
          if (!s.rosterOrder.includes(id)) s.rosterOrder.push(id);
        }
        s.loadouts = (s.loadouts ?? []).map((l) => ({
          ...l,
          consumables: sanitizeConsumableSelection(l.consumables ?? []),
          // (v10, slice 6: existing loadouts are Elara's.)
          classId: l.classId ?? 'mage',
        }));
        // (v9, phase-5 slice 1: per-character world presence joins
        // unconditionally.) The pre-v9 save had ONE queue and ONE position —
        // both were Elara's, so they migrate onto her verbatim (hard law: a
        // live save loses nothing) and the recruits start idle beside her.
        {
          const legacy = persisted as { queue?: Task[]; region?: RegionId };
          if (!s.chars) {
            const start = legacy.region ?? 'heartfield';
            s.chars = {
              mage: { region: start, queue: (legacy.queue ?? []).map((t) => ({ ...t, charId: 'mage' })) },
              warrior: { region: start, queue: [] },
              priest: { region: start, queue: [] },
            };
          }
          // Repair: every roster member has a lane, every task is owned.
          const chars = s.chars;
          for (const id of s.rosterOrder ?? FOUNDER_CHARS) {
            const cw = chars[id];
            chars[id] = cw
              ? { region: cw.region ?? 'heartfield', queue: (cw.queue ?? []).map((t) => ({ ...t, charId: id })) }
              : { region: 'heartfield', queue: [] };
          }
        }
        return s;
      },
    },
  ),
);

/**
 * Is the shown sim result out of date vs. the current setup? The whole
 * would-be request (build, target, roster, journal knowledge) is compared —
 * everything except how many iterations were run.
 */
export function simIsStale(sim: SimState, current: SimRequest): boolean {
  if (!sim.result) return false;
  const strip = ({ iterations: _i, ...rest }: SimRequest) => rest;
  return JSON.stringify(strip(sim.result.request)) !== JSON.stringify(strip(current));
}
