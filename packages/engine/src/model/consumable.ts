import type { Ability } from './ability';
import type { ItemBonuses } from './item';

/**
 * Consumables (GDD §6): crafted items brought into a fight in limited slots.
 * Passives (flasks, wards) are whole-fight stat layers folded at build time,
 * exactly like gear; actives (potions) grant a charge-limited ability the
 * reactive potion policy fires. Real fights consume them; the training dummy
 * simulates them for free (§3) — consumption itself is an economy concern
 * outside the engine, derived from the event stream.
 */

export interface PassiveConsumable {
  id: string;
  name: string;
  kind: 'passive';
  bonuses: ItemBonuses;
}

export interface ActiveConsumable {
  id: string;
  name: string;
  kind: 'active';
  /** Charges granted per equipped slot; duplicate slots sum. */
  chargesPerFight: number;
  /** Must carry tags ['consumable'] so the potion policy (not the action cycle) fires it. */
  ability: Ability;
}

export type ConsumableDefinition = PassiveConsumable | ActiveConsumable;

/** What a CharacterDef records about its equipped consumables (stream/UI metadata). */
export interface EquippedConsumable {
  id: string;
  kind: 'active' | 'passive';
}

export interface NormalizedConsumables {
  /** Passive bonus layers to fold on top of gear+talents — deduped by id (no double-dipping). */
  passives: PassiveConsumable[];
  /** Active abilities to append to the kit — duplicates merged with summed charges. */
  actives: Ability[];
  /** Equipped slots in input order, deduped passives excluded once. */
  summary: EquippedConsumable[];
}

/**
 * Collapse an equipped slot list into what the sim consumes: duplicate
 * passives collapse to one (mirrors buff refresh-not-stack), duplicate
 * actives merge into a single ability with summed charges ("2× Healing
 * Potion" = one potion ability, 4 charges).
 */
export function normalizeConsumables(defs: ConsumableDefinition[]): NormalizedConsumables {
  const passives: PassiveConsumable[] = [];
  const activeCharges = new Map<string, { def: ActiveConsumable; charges: number }>();
  const summary: EquippedConsumable[] = [];
  for (const def of defs) {
    if (def.kind === 'passive') {
      if (passives.some((p) => p.id === def.id)) continue;
      passives.push(def);
      summary.push({ id: def.id, kind: 'passive' });
    } else {
      const entry = activeCharges.get(def.id);
      if (entry) entry.charges += def.chargesPerFight;
      else activeCharges.set(def.id, { def, charges: def.chargesPerFight });
      summary.push({ id: def.id, kind: 'active' });
    }
  }
  const actives = [...activeCharges.values()].map(({ def, charges }) => ({
    ...def.ability,
    chargesPerFight: charges,
  }));
  return { passives, actives, summary };
}
