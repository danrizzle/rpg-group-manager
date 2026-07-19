/**
 * World-loop domain types (slice 3, GDD §5). The open-world layer is pure
 * data + a pure reducer (world/advance.ts); all wall-clock handling lives in
 * the store. The engine stays time-agnostic.
 */

export type View = 'combat' | 'map' | 'base';

/** Home-base buildings (slice 6). Declared here so base.ts → types.ts stays one-directional. */
export type BuildingId = 'workshop' | 'bank';

/** The four v1 regions — 1:1 with the engine's ZONES keys. */
export type RegionId = 'heartfield' | 'duskwood' | 'ashen-foothills' | 'cinder-wastes';
export type ZoneId = RegionId;

/** Bosses whose kills gate progression (fought live in the combat view). */
export type BossId = 'bandit-warlord' | 'emberwing' | 'cinder-maw';

export interface Unlocks {
  banditKilled: boolean;   // → Duskwood
  bridgeBuilt: boolean;    // → Ashen Foothills
  emberwingKilled: boolean; // → Cinder Wastes
  /** → Ember Forge door + the Borin/Seren recruits (phase 4). */
  cinderMawKilled: boolean;
}

/** The playable classes. Engine `classId`s — comp rules and kits key on these. */
export type ClassId = 'mage' | 'warrior' | 'priest';

/**
 * A roster member's stable identity (slice 8).
 *
 * FROZEN CONVENTION: the three founders keep their bare class id (`mage`,
 * `warrior`, `priest`); every later recruit gets `<classId><n>` with n ≥ 2
 * (`warrior2`, `priest2`, …), allocated monotonically and never reused.
 *
 * Keeping the founders' ids bare is what lets slice 8 migrate the character
 * model without remapping a single persisted `plans[].charId`,
 * `familiarity[charId]` or journal key. The engine CLI's `--raid` path uses its
 * own scheme (`warrior1`/`warrior2`); the two need not agree, since ids are
 * only ever compared within one party.
 */
export type CharId = string;

export interface Materials {
  bridgeTimber: number;
  /** Herbs (slice 5): sunleaf grows in Heartfield, emberbloom in Ashen Foothills. */
  sunleaf: number;
  emberbloom: number;
}

/** Crafted consumables by engine consumable id (slice 5 alchemy output). */
export type Inventory = Record<string, number>;

// ---- task queue ----

export type TaskKind = 'travel' | 'grind' | 'gather' | 'craft';

interface BaseTask {
  id: string;
  /** Whose queue this belongs to — queues run in parallel (phase-5 slice 1). */
  charId: WorldCharId;
  kind: TaskKind;
  /** Total game-ms this task needs. */
  durationGameMs: number;
  /** Game-ms folded in so far. */
  accruedGameMs: number;
}

export interface TravelTask extends BaseTask {
  kind: 'travel';
  to: RegionId;
}

export interface GrindTask extends BaseTask {
  kind: 'grind';
  zone: ZoneId;
  /** Rate snapshot captured at enqueue (xpPerHour already devalued). */
  xpPerHour: number;
  deathsPerHour: number;
  levelAtEnqueue: number;
}

export interface GatherTask extends BaseTask {
  kind: 'gather';
  zone: ZoneId;
  material: keyof Materials;
  ratePerHour: number;
  /** Actually banked so far (accrual clamps at bank capacity); absent on pre-v5 tasks. */
  gained?: number;
}

export interface CraftTask extends BaseTask {
  kind: 'craft';
  /** Recipe id == engine consumable id (v1). Herbs for ALL units are deducted at enqueue. */
  recipeId: string;
  count: number;
  /** Game-ms per unit, snapshotted at enqueue; durationGameMs = count × unitGameMs. */
  unitGameMs: number;
  /** Whole units already deposited into the inventory. */
  producedUnits: number;
  /** Units lost to a full bank (deposits clamp; the craft never stalls); absent pre-v5. */
  lostUnits?: number;
}

export type Task = TravelTask | GrindTask | GatherTask | CraftTask;

/**
 * Characters with a presence in the world (GDD §2 "division of labor", §5
 * task queues): each has their own position and their own queue, and the
 * queues run in PARALLEL.
 *
 * Slice 8: this is now just `CharId` — the roster is a record, its fold order
 * is the store's explicit `rosterOrder`, and names live on the build. The alias
 * is kept because task/away-event payloads read better with the intent spelled
 * out.
 */
export type WorldCharId = CharId;

/**
 * The three founders, in the order that predates the roster record. Still the
 * seed for `rosterOrder` and still the fold order for a pre-slice-8 save; the
 * live fold order is `rosterOrder`, which grows as recruits arrive.
 */
export const FOUNDER_CHARS: readonly CharId[] = ['mage', 'warrior', 'priest'];

export const FOUNDER_NAMES: Record<CharId, string> = {
  mage: 'Elara',
  warrior: 'Borin',
  priest: 'Seren',
};

/** One character's world presence: where they are and what they're doing. */
export interface CharWorld {
  region: RegionId;
  queue: Task[];
}

// ---- offline catch-up summary ----

export interface AwayEvent {
  kind: TaskKind;
  /** Who did it (absent on pre-v9 events replayed from an old summary). */
  charId?: WorldCharId;
  zone?: ZoneId;
  to?: RegionId;
  xpGained?: number;
  material?: keyof Materials;
  materialGained?: number;
  recipeId?: string;
  craftedCount?: number;
  /** Units/material lost because the bank was full (slice 6 caps). */
  lostToCapacity?: number;
  /** Statistical, display-only — never simulated per death. */
  estimatedDeaths?: number;
}

export interface AwaySummary {
  events: AwayEvent[];
  elapsedGameMs: number;
}

/** The mutable subset the reducer owns. */
export interface WorldSlice {
  xp: number;
  region: RegionId;
  materials: Materials;
  inventory: Inventory;
  /** Building id → current tier (0 = unbuilt). Read-only to the reducer (bank capacity). */
  buildings: Record<BuildingId, number>;
  queue: Task[];
}
