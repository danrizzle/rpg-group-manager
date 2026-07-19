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

  // ---- raid tier (phase-5 slice 12) --------------------------------------
  // Crafted with catalysts from the raid itself (GDD §6's catalyst model: new
  // tiers are gated on materials from the previous content). They do NOT
  // dominate the tier-1 three — each is a sharper version of one axis, so the
  // slot decision stays a decision at raid scale rather than becoming "bring
  // the two best". Numbers are placeholder balance.
  {
    id: 'ember-draught',
    name: 'Ember Draught',
    kind: 'passive',
    // vs Flask of Embers (+15 SP): more throughput, but the catalyst cost
    // competes with the ward, which is what Vael's raid-wide fire wants.
    bonuses: { spellPower: 26 },
  },
  {
    id: 'cinderguard-tonic',
    name: 'Cinderguard Tonic',
    kind: 'passive',
    // vs Fire Ward Potion (+30 fire res): the raid answer to Cinder Nova and
    // Immolation Rite, and it carries a little HP so tanks want it too.
    bonuses: { resistances: { fire: 55 }, maxHp: 250 },
  },
];

export const CONSUMABLES_BY_ID: Record<string, ConsumableDefinition> = Object.fromEntries(
  CONSUMABLES.map((c) => [c.id, c]),
);
