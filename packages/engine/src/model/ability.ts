import type { DamageType } from './stats';

/**
 * Abilities are declarative data; the engine interprets them.
 * Content must never require engine changes.
 */

export type AbilityTag = 'single-target' | 'aoe' | 'defensive' | 'burst' | 'consumable';

export interface DamageEffect {
  kind: 'damage';
  damageType: DamageType;
  base: number;
  /** Scales with spellPower (Mage v1; attackPower variants come with more classes). */
  coeff: number;
  /** Hits every living enemy instead of the current target. */
  aoe?: boolean;
}

export interface HealEffect {
  kind: 'heal';
  base: number;
  coeff: number;
}

export interface BuffEffect {
  kind: 'buff';
  buffId: string;
  durationMs: number;
  damageMult?: number;
  critBonus?: number;
  /** Damage absorbed before HP is touched. */
  absorb?: number;
}

export type AbilityEffect = DamageEffect | HealEffect | BuffEffect;

export interface Ability {
  id: string;
  name: string;
  castTimeMs: number;
  cooldownMs: number;
  /** Off-GCD abilities fire without consuming the actor's action cycle. */
  offGcd?: boolean;
  effect: AbilityEffect;
  tags: AbilityTag[];
  /** If true, damageWhileMoving applies while the actor is in a movement window. */
  movementPenalty?: boolean;
}

export const GCD_MS = 1500;
