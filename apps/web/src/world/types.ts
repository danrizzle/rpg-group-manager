/**
 * World-loop domain types (slice 3, GDD §5). The open-world layer is pure
 * data + a pure reducer (world/advance.ts); all wall-clock handling lives in
 * the store. The engine stays time-agnostic.
 */

export type View = 'combat' | 'map';

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
}

// ---- task queue ----

export type TaskKind = 'travel' | 'grind' | 'gather';

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
}

export type Task = TravelTask | GrindTask | GatherTask;

// ---- offline catch-up summary ----

export interface AwayEvent {
  kind: TaskKind;
  zone?: ZoneId;
  to?: RegionId;
  xpGained?: number;
  materialGained?: number;
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
  queue: Task[];
}
