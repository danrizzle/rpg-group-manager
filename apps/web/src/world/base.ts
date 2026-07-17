import type { BuildingId, Materials } from './types';

/**
 * Home base v1 (GDD §5, slice 6): declarative buildings with upgrade tiers.
 * Two rules bound this slice: buildings ADD capability, never gate what
 * already works (Law 2 — the unbuilt workshop is a "field kit" crafting at
 * 1× speed), and the bank pre-exists at tier 1 — it is the future roster's
 * shared potion pool, so storage caps bind from day one. The training arena
 * (eventual role: combat-stat training) is deferred past v1.
 * Numbers are placeholder balance; costs lean on bridgeTimber to keep the
 * timber loop alive after the bridge.
 */

export interface BuildingTier {
  cost: Partial<Materials>;
  /** Multiplies recipe unitGameMs at enqueue (lower = faster crafting). */
  craftTimeMult?: number;
  /** Per-item-kind storage cap over materials AND crafted consumables. */
  capacityPerKind?: number;
}

export interface BuildingDefinition {
  id: BuildingId;
  name: string;
  desc: string;
  /** tiers[i] describes tier i+1. */
  tiers: BuildingTier[];
}

export const BUILDINGS: BuildingDefinition[] = [
  {
    id: 'bank',
    name: 'Bank',
    desc: 'Stores materials and consumables — the roster draws its potions from here.',
    tiers: [
      { cost: {}, capacityPerKind: 50 }, // tier 1 is pre-built (INITIAL_BUILDINGS)
      { cost: { bridgeTimber: 25, sunleaf: 10 }, capacityPerKind: 150 },
    ],
  },
  {
    id: 'workshop',
    name: 'Alchemy Workshop',
    desc: 'Speeds up crafting. Unbuilt, the field kit still crafts at normal pace.',
    tiers: [
      { cost: { bridgeTimber: 15 }, craftTimeMult: 0.75 },
      { cost: { bridgeTimber: 30, emberbloom: 10 }, craftTimeMult: 0.5 },
    ],
  },
];

export const BUILDINGS_BY_ID: Record<string, BuildingDefinition> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b]),
);

export const INITIAL_BUILDINGS: Record<BuildingId, number> = { workshop: 0, bank: 1 };

/** Latest defined value of an effect across the tiers achieved so far. */
function effectAtTier<K extends 'craftTimeMult' | 'capacityPerKind'>(
  id: BuildingId,
  tier: number,
  key: K,
): BuildingTier[K] | undefined {
  const def = BUILDINGS_BY_ID[id];
  let value: BuildingTier[K] | undefined;
  for (let i = 0; i < Math.min(tier, def?.tiers.length ?? 0); i++) {
    const v = def!.tiers[i]![key];
    if (v !== undefined) value = v;
  }
  return value;
}

export function craftTimeMult(buildings: Record<BuildingId, number>): number {
  return effectAtTier('workshop', buildings.workshop ?? 0, 'craftTimeMult') ?? 1;
}

/** Per-kind bank cap. Tier 0 has no cap (defensive; migration seeds bank ≥ 1). */
export function bankCapacity(buildings: Record<BuildingId, number>): number {
  return effectAtTier('bank', buildings.bank ?? 0, 'capacityPerKind') ?? Infinity;
}

/** The next tier to build/upgrade to, or undefined when maxed. */
export function nextTier(
  id: BuildingId,
  buildings: Record<BuildingId, number>,
): BuildingTier | undefined {
  return BUILDINGS_BY_ID[id]?.tiers[buildings[id] ?? 0];
}

export function canAffordTier(tier: BuildingTier, materials: Materials): boolean {
  return Object.entries(tier.cost).every(
    ([m, n]) => (materials[m as keyof Materials] ?? 0) >= n,
  );
}
