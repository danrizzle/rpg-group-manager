import type { ConsumableDefinition } from '../model/consumable';

/**
 * v1 alchemy consumables (GDD §6): three options competing for two slots —
 * sustain (potion) vs throughput (flask) vs fire mitigation (ward) is the
 * canonical "what do I bring?" decision. Numbers are placeholder balance;
 * recipes/herbs live web-side (the engine knows nothing of the economy).
 */

/** Consumable slots per fight — scarce on purpose (GDD §6). */
export const CONSUMABLE_SLOTS = 2;

export const CONSUMABLES: ConsumableDefinition[] = [
  {
    id: 'healing-potion',
    name: 'Healing Potion',
    kind: 'active',
    chargesPerFight: 2,
    // Same ability shape/id as the pre-slice-5 kit potion, so event meta,
    // traces and the reactive threshold policy stay comparable.
    ability: {
      id: 'healing-potion',
      name: 'Healing Potion',
      castTimeMs: 0,
      cooldownMs: 45_000,
      offGcd: true,
      effect: { kind: 'heal', base: 750, coeff: 0 },
      tags: ['consumable'],
    },
  },
  {
    id: 'flask-of-embers',
    name: 'Flask of Embers',
    kind: 'passive',
    bonuses: { spellPower: 15 },
  },
  {
    id: 'fire-ward-potion',
    name: 'Fire Ward Potion',
    kind: 'passive',
    bonuses: { resistances: { fire: 30 } },
  },
];

export const CONSUMABLES_BY_ID: Record<string, ConsumableDefinition> = Object.fromEntries(
  CONSUMABLES.map((c) => [c.id, c]),
);
