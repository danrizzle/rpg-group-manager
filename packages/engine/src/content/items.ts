import type { GearSlot, Item } from '../model/item';

/**
 * v1 item catalog (placeholder balance). Deliberate tradeoffs per GDD §6:
 * resist vs. DPS chest, behavior-stat ring/trinket vs. raw throughput.
 * Every class has a tier-2 fire-resist chest — resist gear is each boss's
 * gear answer alongside raw throughput (§2), and it matters in anger from
 * the Ember Forge onward.
 */
export const ITEMS: Item[] = [
  // ---- Mage ----------------------------------------------------------------
  // Weapons — the raw throughput axis.
  { id: 'apprentice-staff', name: 'Apprentice Staff', slot: 'weapon', tier: 1, classes: ['mage'], bonuses: { spellPower: 12 } },
  { id: 'emberwood-staff', name: 'Emberwood Staff', slot: 'weapon', tier: 2, classes: ['mage'], bonuses: { spellPower: 25 } },
  { id: 'pyroclast-staff', name: 'Pyroclast Staff', slot: 'weapon', tier: 3, classes: ['mage'], bonuses: { spellPower: 42 } },

  // Chest — survival, with a resist-vs-DPS tradeoff at tier 2.
  { id: 'padded-robe', name: 'Padded Robe', slot: 'chest', tier: 1, classes: ['mage'], bonuses: { maxHp: 200, armor: 40 } },
  { id: 'runeweave-robe', name: 'Runeweave Robe', slot: 'chest', tier: 2, classes: ['mage'], bonuses: { spellPower: 10, maxHp: 300, armor: 60 } },
  { id: 'fireproof-mantle', name: 'Fireproof Mantle', slot: 'chest', tier: 2, classes: ['mage'], bonuses: { maxHp: 250, armor: 60, resistances: { fire: 25 } } },
  { id: 'archmage-vestment', name: 'Archmage Vestment', slot: 'chest', tier: 3, classes: ['mage'], bonuses: { spellPower: 22, maxHp: 350, armor: 60 } },

  // Rings — throughput vs. an earned-stat shortcut.
  { id: 'copper-band', name: 'Copper Band', slot: 'ring', tier: 1, classes: ['mage'], bonuses: { spellPower: 5 } },
  { id: 'ring-of-embers', name: 'Ring of Embers', slot: 'ring', tier: 2, classes: ['mage'], bonuses: { critChance: 0.06 } },
  { id: 'band-of-focus', name: 'Band of Focus', slot: 'ring', tier: 2, bonuses: { discipline: 15 } },
  { id: 'sigil-of-flame', name: 'Sigil of Flame', slot: 'ring', tier: 3, classes: ['mage'], bonuses: { spellPower: 12, critChance: 0.04 } },

  // Trinkets — situational: movement boss vs. raw stats.
  { id: 'lucky-charm', name: 'Lucky Charm', slot: 'trinket', tier: 1, bonuses: { critChance: 0.05 } },
  { id: 'ember-core', name: 'Ember Core', slot: 'trinket', tier: 2, bonuses: { hastePct: 8 } },
  { id: 'quickstep-anklet', name: 'Quickstep Anklet', slot: 'trinket', tier: 2, bonuses: { damageWhileMoving: 0.25 } },
  { id: 'timeworn-talisman', name: 'Timeworn Talisman', slot: 'trinket', tier: 3, classes: ['mage'], bonuses: { spellPower: 10, hastePct: 5 } },

  // ---- Warrior (tank) — armor/HP with an attack-power axis for threat ------
  { id: 'militia-blade', name: 'Militia Blade', slot: 'weapon', tier: 1, classes: ['warrior'], bonuses: { attackPower: 10 } },
  { id: 'sentinel-blade', name: 'Sentinel Blade', slot: 'weapon', tier: 2, classes: ['warrior'], bonuses: { attackPower: 20 } },
  { id: 'forgebreaker', name: 'Forgebreaker', slot: 'weapon', tier: 3, classes: ['warrior'], bonuses: { attackPower: 34 } },

  { id: 'padded-hauberk', name: 'Padded Hauberk', slot: 'chest', tier: 1, classes: ['warrior'], bonuses: { maxHp: 250, armor: 140 } },
  { id: 'ironclad-cuirass', name: 'Ironclad Cuirass', slot: 'chest', tier: 2, classes: ['warrior'], bonuses: { maxHp: 420, armor: 260 } },
  { id: 'emberguard-bulwark', name: 'Emberguard Bulwark', slot: 'chest', tier: 2, classes: ['warrior'], bonuses: { maxHp: 320, armor: 200, resistances: { fire: 25 } } },
  { id: 'bastion-plate', name: 'Bastion Plate', slot: 'chest', tier: 3, classes: ['warrior'], bonuses: { maxHp: 580, armor: 340 } },

  { id: 'band-of-vigor', name: 'Band of Vigor', slot: 'ring', tier: 1, classes: ['warrior'], bonuses: { maxHp: 120 } },
  { id: 'shieldbearer-signet', name: 'Shieldbearer Signet', slot: 'ring', tier: 2, classes: ['warrior'], bonuses: { armor: 90, discipline: 10 } },
  { id: 'warlord-seal', name: 'Warlord Seal', slot: 'ring', tier: 3, classes: ['warrior'], bonuses: { attackPower: 12, maxHp: 150 } },

  { id: 'oxheart-talisman', name: 'Oxheart Talisman', slot: 'trinket', tier: 2, classes: ['warrior'], bonuses: { maxHp: 220 } },
  { id: 'bulwark-idol', name: 'Bulwark Idol', slot: 'trinket', tier: 3, classes: ['warrior'], bonuses: { maxHp: 180, armor: 160 } },

  // ---- Priest (healer) — healing power, light survival ---------------------
  { id: 'novice-crook', name: 'Novice Crook', slot: 'weapon', tier: 1, classes: ['priest'], bonuses: { healingPower: 12 } },
  { id: 'dawnlight-staff', name: 'Dawnlight Staff', slot: 'weapon', tier: 2, classes: ['priest'], bonuses: { healingPower: 25 } },
  { id: 'staff-of-renewal', name: 'Staff of Renewal', slot: 'weapon', tier: 3, classes: ['priest'], bonuses: { healingPower: 42 } },

  { id: 'acolyte-robe', name: 'Acolyte Robe', slot: 'chest', tier: 1, classes: ['priest'], bonuses: { maxHp: 180, armor: 30 } },
  { id: 'benediction-vestment', name: 'Benediction Vestment', slot: 'chest', tier: 2, classes: ['priest'], bonuses: { healingPower: 12, maxHp: 260, armor: 50 } },
  { id: 'flamewarded-vestment', name: 'Flamewarded Vestment', slot: 'chest', tier: 2, classes: ['priest'], bonuses: { maxHp: 220, armor: 40, resistances: { fire: 25 } } },
  { id: 'seraphic-raiment', name: 'Seraphic Raiment', slot: 'chest', tier: 3, classes: ['priest'], bonuses: { healingPower: 20, maxHp: 340, armor: 50 } },

  { id: 'band-of-clarity', name: 'Band of Clarity', slot: 'ring', tier: 1, classes: ['priest'], bonuses: { healingPower: 5 } },
  { id: 'mercy-loop', name: 'Mercy Loop', slot: 'ring', tier: 2, classes: ['priest'], bonuses: { healingPower: 10 } },
  { id: 'halo-signet', name: 'Halo Signet', slot: 'ring', tier: 3, classes: ['priest'], bonuses: { healingPower: 12, maxHp: 120 } },

  { id: 'prayer-beads', name: 'Prayer Beads', slot: 'trinket', tier: 2, classes: ['priest'], bonuses: { healingPower: 12 } },
  { id: 'chalice-of-light', name: 'Chalice of Light', slot: 'trinket', tier: 3, classes: ['priest'], bonuses: { healingPower: 10, maxHp: 160 } },
];

export const ITEMS_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/** Items a class can equip in a slot; no classId = the full slot catalog. */
export function itemsForSlot(slot: GearSlot, classId?: string): Item[] {
  return ITEMS.filter(
    (i) => i.slot === slot && (!classId || !i.classes || i.classes.includes(classId)),
  );
}

const set = (...ids: string[]): Item[] => ids.map((id) => ITEMS_BY_ID[id]!);

/** Named sets for tuning sweeps and the CLI (--gear). Mage sets keep their
 * historical unprefixed names; warrior/priest sets are class-prefixed. */
export const GEAR_SETS: Record<string, Item[]> = {
  naked: [],
  starter: set('apprentice-staff', 'padded-robe', 'copper-band', 'lucky-charm'),
  // 'default' reproduces the pre-gear balance exactly (100 SP, 2400 HP, 15% crit).
  default: set('emberwood-staff', 'runeweave-robe', 'copper-band', 'lucky-charm'),
  best: set('pyroclast-staff', 'archmage-vestment', 'sigil-of-flame', 'timeworn-talisman'),
  resist: set('emberwood-staff', 'fireproof-mantle', 'copper-band', 'lucky-charm'),

  'warrior-naked': [],
  'warrior-starter': set('militia-blade', 'padded-hauberk', 'band-of-vigor', 'lucky-charm'),
  'warrior-default': set('sentinel-blade', 'ironclad-cuirass', 'band-of-vigor', 'oxheart-talisman'),
  'warrior-resist': set('sentinel-blade', 'emberguard-bulwark', 'band-of-vigor', 'oxheart-talisman'),
  'warrior-best': set('forgebreaker', 'bastion-plate', 'warlord-seal', 'bulwark-idol'),

  'priest-naked': [],
  'priest-starter': set('novice-crook', 'acolyte-robe', 'band-of-clarity', 'lucky-charm'),
  'priest-default': set('dawnlight-staff', 'benediction-vestment', 'mercy-loop', 'prayer-beads'),
  'priest-resist': set('dawnlight-staff', 'flamewarded-vestment', 'mercy-loop', 'prayer-beads'),
  'priest-best': set('staff-of-renewal', 'seraphic-raiment', 'halo-signet', 'chalice-of-light'),
};
