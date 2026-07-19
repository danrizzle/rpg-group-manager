import type { DamageType } from './stats';

/**
 * Abilities are declarative data; the engine interprets them.
 * Content must never require engine changes.
 */

export type AbilityTag =
  | 'single-target'
  | 'aoe'
  | 'defensive'
  | 'burst'
  | 'consumable'
  | 'heal-cd'
  | 'taunt'
  | 'dispel'
  | 'interrupt'
  | 'battle-res';

export interface DamageEffect {
  kind: 'damage';
  damageType: DamageType;
  base: number;
  /** Scales with the caster's `powerStat` (spellPower unless overridden). */
  coeff: number;
  /** Which power stat `coeff` scales with. Absent = spellPower (Mage v1). */
  powerStat?: 'spellPower' | 'attackPower';
  /** Hits every living enemy instead of the current target. */
  aoe?: boolean;
}

/**
 * A raid-bounded group heal: lands on the `maxTargets` most-hurt living
 * members (tanks weighted in) instead of the whole raid, so throughput does
 * not scale with party size. At ≤ maxTargets living it is exactly 'party'.
 */
export interface GroupHealTarget {
  kind: 'group';
  maxTargets: number;
}

export interface HealEffect {
  kind: 'heal';
  base: number;
  coeff: number;
  /**
   * Who the heal lands on. Absent = 'self' (solo-era potions/self-sustain);
   * 'lowest-ally' picks the most-hurt living party member (healer bread and
   * butter); 'party' heals every living member; `{kind:'group',maxTargets}`
   * is the raid-bounded group heal (heals the maxTargets most-hurt).
   */
  target?: 'self' | 'lowest-ally' | 'party' | GroupHealTarget;
}

/** Dispellable debuff categories (GDD §4 raid dispels). */
export type DispelType = 'magic' | 'curse' | 'poison' | 'disease';

export interface BuffEffect {
  kind: 'buff';
  buffId: string;
  durationMs: number;
  damageMult?: number;
  critBonus?: number;
  /** Multiplier on incoming damage (< 1 = mitigation CD, e.g. Shield Wall). */
  damageTakenMult?: number;
  /** Damage absorbed before HP is touched. */
  absorb?: number;
  /** Who the buff lands on. Absent = 'self'; 'party' = every living member. */
  target?: 'self' | 'party';
  /**
   * Stacks up to this many applications instead of refreshing; the per-stack
   * `damageTakenMult` compounds. Absent/1 = refresh (byte-identical). The
   * tank-swap lever (GDD §4 type 4).
   */
  maxStacks?: number;
  /** If dispellable, its category — a dispel effect matching this removes it. */
  dispelType?: DispelType;
}

/**
 * Taunt (GDD §4): force every enemy onto the caster for `durationMs` and
 * leave the caster top-threat, so a tank can pull the boss off another tank.
 */
export interface TauntEffect {
  kind: 'taunt';
  durationMs: number;
}

/** Dispel (GDD §4): strip matching dispellable debuffs off allies. */
export interface DispelEffect {
  kind: 'dispel';
  dispelTypes: DispelType[];
  /** Who to cleanse. Absent = the most-afflicted ally. */
  target?: 'lowest-ally' | 'self';
}

/** Interrupt (GDD §4): cancel a boss cast that is currently in its window. */
export interface InterruptEffect {
  kind: 'interrupt';
}

/** Battle res (GDD §3): revive a dead ally at `hpPct` of their max HP. */
export interface ResurrectEffect {
  kind: 'resurrect';
  hpPct: number;
}

export type AbilityEffect =
  | DamageEffect
  | HealEffect
  | BuffEffect
  | TauntEffect
  | DispelEffect
  | InterruptEffect
  | ResurrectEffect;

export interface Ability {
  id: string;
  name: string;
  castTimeMs: number;
  cooldownMs: number;
  /** Off-GCD abilities fire without consuming the actor's action cycle. */
  offGcd?: boolean;
  /** Uses per fight (consumable charges); absent = unlimited. */
  chargesPerFight?: number;
  effect: AbilityEffect;
  tags: AbilityTag[];
  /** If true, damageWhileMoving applies while the actor is in a movement window. */
  movementPenalty?: boolean;
  /**
   * Multiplier on the threat this ability's damage generates (tank kits run
   * high multipliers — that's what makes a tank). Absent = 1.
   */
  threatMult?: number;
}

export const GCD_MS = 1500;
