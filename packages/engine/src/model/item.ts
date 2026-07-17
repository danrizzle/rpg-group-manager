import type { BehaviorStats, CombatStats, DamageType } from './stats';

/**
 * Gear (GDD §6): declarative items whose bonuses assemble into a character's
 * effective stats. Itemization creates decisions, not just bigger numbers —
 * resist vs. DPS pieces, behavior-stat gear (execution quality is earned).
 */

export type GearSlot = 'weapon' | 'chest' | 'ring' | 'trinket';

export interface ItemBonuses {
  spellPower?: number;
  attackPower?: number;
  healingPower?: number;
  maxHp?: number;
  /** Additive, 0..1 scale (0.05 = +5% crit). */
  critChance?: number;
  hastePct?: number;
  armor?: number;
  resistances?: Partial<Record<DamageType, number>>;
  /** Behavior-stat gear: adds on top of the character's earned stats. */
  discipline?: number;
  aoeEfficiency?: number;
  damageWhileMoving?: number;
}

export interface Item {
  id: string;
  name: string;
  slot: GearSlot;
  tier: 1 | 2 | 3;
  bonuses: ItemBonuses;
}

/** Assemble effective stats from a naked base plus equipped items. */
export function applyGear(
  base: CombatStats,
  behavior: BehaviorStats,
  gear: Item[],
): { stats: CombatStats; behavior: BehaviorStats } {
  const stats: CombatStats = { ...base, resistances: { ...base.resistances } };
  const b: BehaviorStats = { ...behavior };
  for (const item of gear) {
    const x = item.bonuses;
    stats.spellPower += x.spellPower ?? 0;
    stats.attackPower += x.attackPower ?? 0;
    stats.healingPower += x.healingPower ?? 0;
    stats.maxHp += x.maxHp ?? 0;
    stats.critChance += x.critChance ?? 0;
    stats.hastePct += x.hastePct ?? 0;
    stats.armor += x.armor ?? 0;
    for (const [type, value] of Object.entries(x.resistances ?? {})) {
      const t = type as DamageType;
      stats.resistances[t] = (stats.resistances[t] ?? 0) + value;
    }
    b.discipline += x.discipline ?? 0;
    b.aoeEfficiency += x.aoeEfficiency ?? 0;
    b.damageWhileMoving += x.damageWhileMoving ?? 0;
  }
  stats.critChance = Math.min(1, stats.critChance);
  b.discipline = Math.min(100, b.discipline);
  b.damageWhileMoving = Math.min(1, b.damageWhileMoving);
  return { stats, behavior: b };
}
