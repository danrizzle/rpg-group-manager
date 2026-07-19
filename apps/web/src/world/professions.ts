import { CONSUMABLES_BY_ID, type ConsumableDefinition } from '@rpg/engine';
import type { Inventory, Materials } from './types';

/**
 * Professions v1 (GDD §6): the herbalism→alchemy loop. Herbs are world
 * materials, recipes are world content — the engine knows nothing of the
 * economy; its contract surface is exactly the consumable ids. Crafting runs
 * as a queued task (advanceWorld); the base workshop speeds it up but never
 * gates it. No profession skill levels in v1 (deferred).
 */

const MIN = 60_000;

export type HerbId = 'sunleaf' | 'emberbloom';

export const MATERIAL_LABELS: Record<keyof Materials, string> = {
  bridgeTimber: 'timber',
  sunleaf: 'sunleaf',
  emberbloom: 'emberbloom',
  forgeSeal: 'forge seal',
};

export interface Recipe {
  /** == engine consumable id (1:1 in v1). */
  id: string;
  name: string;
  herbs: Partial<Record<HerbId, number>>;
  /** Game-ms per crafted unit. */
  unitGameMs: number;
}

export const RECIPES: Recipe[] = [
  { id: 'healing-potion', name: 'Healing Potion', herbs: { sunleaf: 2 }, unitGameMs: 5 * MIN },
  { id: 'flask-of-embers', name: 'Flask of Embers', herbs: { sunleaf: 2, emberbloom: 2 }, unitGameMs: 10 * MIN },
  { id: 'fire-ward-potion', name: 'Fire Ward Potion', herbs: { emberbloom: 3 }, unitGameMs: 10 * MIN },
];

export const RECIPES_BY_ID: Record<string, Recipe> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
);

/** Herbs gathered per game-hour (flat, like timber; skill levels are post-v1). */
export const HERB_RATE_PER_HOUR = 12;

/** Respec cost (GDD §2 "small resource cost") — payable from the start region. */
export const RESPEC_COST = { material: 'sunleaf' as const, count: 10 };

/**
 * Resolve equipped slot ids to engine consumable defs.
 * Without `inventory` (training dummy / stat preview): every known id
 * resolves — the dummy simulates what you plan to bring, for free (GDD §3).
 * With `inventory` (a real pull): each slot needs one item in stock; slots
 * stock can't cover are skipped (sanitize-not-block) so a pull never throws.
 */
export function resolveConsumables(
  ids: string[],
  inventory?: Inventory,
): ConsumableDefinition[] {
  const defs: ConsumableDefinition[] = [];
  const used: Record<string, number> = {};
  for (const id of ids) {
    const def = CONSUMABLES_BY_ID[id];
    if (!def) continue;
    if (inventory) {
      const have = inventory[id] ?? 0;
      if ((used[id] ?? 0) + 1 > have) continue;
      used[id] = (used[id] ?? 0) + 1;
    }
    defs.push(def);
  }
  return defs;
}
