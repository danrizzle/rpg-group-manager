import type { GearSlot, Item } from '../model/item';

/**
 * v1 item catalog (placeholder balance). Deliberate tradeoffs per GDD §6:
 * resist vs. DPS chest, behavior-stat ring/trinket vs. raw throughput.
 */
export const ITEMS: Item[] = [
  // Weapons — the raw throughput axis.
  { id: 'apprentice-staff', name: 'Apprentice Staff', slot: 'weapon', tier: 1, bonuses: { spellPower: 12 } },
  { id: 'emberwood-staff', name: 'Emberwood Staff', slot: 'weapon', tier: 2, bonuses: { spellPower: 25 } },
  { id: 'pyroclast-staff', name: 'Pyroclast Staff', slot: 'weapon', tier: 3, bonuses: { spellPower: 42 } },

  // Chest — survival, with a resist-vs-DPS tradeoff at tier 2.
  { id: 'padded-robe', name: 'Padded Robe', slot: 'chest', tier: 1, bonuses: { maxHp: 200, armor: 40 } },
  { id: 'runeweave-robe', name: 'Runeweave Robe', slot: 'chest', tier: 2, bonuses: { spellPower: 10, maxHp: 300, armor: 60 } },
  { id: 'fireproof-mantle', name: 'Fireproof Mantle', slot: 'chest', tier: 2, bonuses: { maxHp: 250, armor: 60, resistances: { fire: 25 } } },
  { id: 'archmage-vestment', name: 'Archmage Vestment', slot: 'chest', tier: 3, bonuses: { spellPower: 22, maxHp: 350, armor: 60 } },

  // Rings — throughput vs. an earned-stat shortcut.
  { id: 'copper-band', name: 'Copper Band', slot: 'ring', tier: 1, bonuses: { spellPower: 5 } },
  { id: 'ring-of-embers', name: 'Ring of Embers', slot: 'ring', tier: 2, bonuses: { critChance: 0.06 } },
  { id: 'band-of-focus', name: 'Band of Focus', slot: 'ring', tier: 2, bonuses: { discipline: 15 } },
  { id: 'sigil-of-flame', name: 'Sigil of Flame', slot: 'ring', tier: 3, bonuses: { spellPower: 12, critChance: 0.04 } },

  // Trinkets — situational: movement boss vs. raw stats.
  { id: 'lucky-charm', name: 'Lucky Charm', slot: 'trinket', tier: 1, bonuses: { critChance: 0.05 } },
  { id: 'ember-core', name: 'Ember Core', slot: 'trinket', tier: 2, bonuses: { hastePct: 8 } },
  { id: 'quickstep-anklet', name: 'Quickstep Anklet', slot: 'trinket', tier: 2, bonuses: { damageWhileMoving: 0.25 } },
  { id: 'timeworn-talisman', name: 'Timeworn Talisman', slot: 'trinket', tier: 3, bonuses: { spellPower: 10, hastePct: 5 } },
];

export const ITEMS_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function itemsForSlot(slot: GearSlot): Item[] {
  return ITEMS.filter((i) => i.slot === slot);
}

const set = (...ids: string[]): Item[] => ids.map((id) => ITEMS_BY_ID[id]!);

/** Named sets for tuning sweeps and the CLI (--gear). */
export const GEAR_SETS: Record<string, Item[]> = {
  naked: [],
  starter: set('apprentice-staff', 'padded-robe', 'copper-band', 'lucky-charm'),
  // 'default' reproduces the pre-gear balance exactly (100 SP, 2400 HP, 15% crit).
  default: set('emberwood-staff', 'runeweave-robe', 'copper-band', 'lucky-charm'),
  best: set('pyroclast-staff', 'archmage-vestment', 'sigil-of-flame', 'timeworn-talisman'),
};
