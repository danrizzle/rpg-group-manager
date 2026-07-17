/** Stat families per GDD §2. */

export type DamageType = 'physical' | 'fire' | 'frost' | 'shadow';

/** Classic combat stats — from level, gear, enchants, buffs. */
export interface CombatStats {
  maxHp: number;
  attackPower: number;
  spellPower: number;
  healingPower: number;
  /** 0..1 chance; crits deal double. */
  critChance: number;
  /** Percent haste; reduces cast times and the GCD. */
  hastePct: number;
  armor: number;
  /** Percent reduction per damage type, 0..100. */
  resistances: Partial<Record<DamageType, number>>;
}

/** How well a character handles situations — interacts with boss mechanics. */
export interface BehaviorStats {
  /** Multiplier on penalized abilities during movement, 0..1. */
  damageWhileMoving: number;
  /** Multiplier on AoE ability output. */
  aoeEfficiency: number;
  /** 0..100. Drives reaction time to triggers and mistake probability. */
  discipline: number;
}

const ARMOR_K = 2000;

/** Mitigation applied to incoming damage of the given type, 0..1. */
export function mitigation(stats: CombatStats, type: DamageType): number {
  const resist = (stats.resistances[type] ?? 0) / 100;
  const armor = type === 'physical' ? stats.armor / (stats.armor + ARMOR_K) : 0;
  return Math.min(0.75, resist + armor);
}

export function hasteMult(stats: CombatStats): number {
  return 1 / (1 + stats.hastePct / 100);
}
