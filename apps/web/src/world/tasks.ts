import type { StanceConfig } from '@rpg/engine';
import type { BehaviorOverrides, GearSelection } from '../store';
import type { Materials, RegionId, Unlocks, WorldCharId } from './types';
import { HERB_RATE_PER_HOUR } from './professions';

/**
 * World-loop tuning constants + pure helpers. Durations are in GAME-ms; the
 * store converts wall-time to game-time via the dev multiplier
 * (gameMs = wallMs × multiplier), so at 1× a game-minute is a real minute.
 */

const MIN = 60_000;
const HOUR = 3_600_000;

/** One "send to grind" block. */
export const GRIND_BLOCK_GAME_MS = 1 * HOUR;
/** One gather block. */
export const GATHER_BLOCK_GAME_MS = 30 * MIN;
/** A single adjacent-region travel hop (GDD §5: 5–15 real min at 1×). */
export const TRAVEL_HOP_GAME_MS = 10 * MIN;
/** Bridge timber gathered per game-hour in Duskwood. */
export const GATHER_RATE_PER_HOUR = 20;

/** Cap on a single offline catch-up so a long sleep can't jump to cap. */
export const MAX_CATCHUP_GAME_MS = 100 * HOUR;

export const BRIDGE_COST = { bridgeTimber: 20 } as const;

/** Dev world-speed presets; fast by default so the loop is testable in seconds. */
export const MULTIPLIER_PRESETS = [
  { label: '1× (real)', value: 1 },
  { label: '60×', value: 60 },
  { label: '600×', value: 600 },
  { label: '3600×', value: 3600 },
] as const;
export const DEFAULT_MULTIPLIER = 600;

export interface RegionMeta {
  id: RegionId;
  name: string;
  /** How this region is unlocked, for the locked-card hint. */
  gateHint: string;
  /** The gate boss (fought while this region is LOCKED, to unlock it). */
  boss?: { id: 'bandit-warlord' | 'emberwing'; name: string };
  /** A capstone boss residing here, challengeable once the region is UNLOCKED. */
  capstoneBoss?: { id: string; name: string };
  /** What a gather task in this region yields (timber or herbs, GDD §5/§6). */
  gather?: { material: keyof Materials; ratePerHour: number };
}

/** Regions in world order (Heartfield → … → Cinder Wastes), GDD §5. */
export const REGIONS: RegionMeta[] = [
  {
    id: 'heartfield',
    name: 'Heartfield',
    gateHint: 'Starting region',
    gather: { material: 'sunleaf', ratePerHour: HERB_RATE_PER_HOUR },
  },
  {
    id: 'duskwood',
    name: 'Duskwood Edge',
    gateHint: 'Defeat the Bandit Warlord in Heartfield',
    boss: { id: 'bandit-warlord', name: 'Bandit Warlord' },
    gather: { material: 'bridgeTimber', ratePerHour: GATHER_RATE_PER_HOUR },
  },
  {
    id: 'ashen-foothills',
    name: 'Ashen Foothills',
    gateHint: 'Build the Bridge (20 timber gathered in Duskwood)',
    gather: { material: 'emberbloom', ratePerHour: HERB_RATE_PER_HOUR },
  },
  {
    id: 'cinder-wastes',
    name: 'Cinder Wastes',
    gateHint: 'Defeat Emberwing in Ashen Foothills',
    boss: { id: 'emberwing', name: 'Emberwing' },
    capstoneBoss: { id: 'cinder-maw', name: 'Cinder Maw' },
  },
];

/** Whether a region is currently reachable, given the gate flags. */
export function regionUnlocked(r: RegionId, u: Unlocks): boolean {
  switch (r) {
    case 'heartfield':
      return true;
    case 'duskwood':
      return u.banditKilled;
    case 'ashen-foothills':
      return u.bridgeBuilt;
    case 'cinder-wastes':
      return u.emberwingKilled;
  }
}

// ---- rate-cache keys (map shows per-zone XP/hr + risk for the current build) ----

const hashGear = (g: GearSelection): string =>
  Object.entries(g)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');

const hashStance = (s: StanceConfig): string =>
  `${s.offense}|${s.targeting}|${s.potionThresholdPct}|${s.burstCds}|${s.barrierPolicy ?? 'reactive'}`;

const hashBehavior = (b: BehaviorOverrides): string =>
  `${b.discipline}|${b.aoeEfficiency}|${b.damageWhileMoving}`;

export function buildHash(
  g: GearSelection,
  s: StanceConfig,
  b: BehaviorOverrides,
  talents: string[],
): string {
  return `${hashGear(g)}::${hashStance(s)}::${hashBehavior(b)}::${talents.join(',')}`;
}

/**
 * Rate-cache key. The class id leads because each character grinds with their
 * own kit — Borin and Elara in identical gear are still different rates, and
 * without the discriminator their cache entries would collide.
 */
export function rateKey(
  charId: WorldCharId,
  zone: RegionId,
  level: number,
  g: GearSelection,
  s: StanceConfig,
  b: BehaviorOverrides,
  talents: string[],
): string {
  return `${charId}|${zone}|${level}|${buildHash(g, s, b, talents)}`;
}
