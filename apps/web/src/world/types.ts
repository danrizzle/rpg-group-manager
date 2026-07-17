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

/** Zone bosses that gate the next region (fought live in the combat view). */
export type BossId = 'bandit-warlord' | 'emberwing';

export interface Unlocks {
  banditKilled: boolean;   // → Duskwood
  bridgeBuilt: boolean;    // → Ashen Foothills
  emberwingKilled: boolean; // → Cinder Wastes
}

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

// ---- offline catch-up summary ----

export interface AwayEvent {
  kind: TaskKind;
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
