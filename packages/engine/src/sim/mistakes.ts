import type { Rng } from '../core/rng';

/**
 * The human factor (GDD §2): characters are simulated beings, not stat
 * containers. Discipline drives both how fast a character reacts to
 * triggers and how often they make mistakes. Modeled from day 1 —
 * cheap now, expensive to retrofit.
 */

export type MistakeKind = 'wrong-ability' | 'hesitation' | 'stayed-in-fire' | 'slow-potion';

function lerp(from: number, to: number, x: number): number {
  return from + (to - from) * Math.min(1, Math.max(0, x));
}

/** Rookie (0): 2 s. Veteran (100): 0.5 s. */
export function reactionTimeMs(discipline: number): number {
  return Math.round(lerp(2000, 500, discipline / 100));
}

/** Per-decision mistake probability. Rookie: 15%. Veteran: 1%. */
export function mistakeChance(discipline: number): number {
  return lerp(0.15, 0.01, discipline / 100);
}

/** Rolled at every action decision. */
export function rollDecisionMistake(rng: Rng, discipline: number): 'wrong-ability' | 'hesitation' | null {
  if (!rng.chance(mistakeChance(discipline))) return null;
  return rng.chance(0.5) ? 'wrong-ability' : 'hesitation';
}

/**
 * Extra thinking time added by a hesitation mistake. Deliberately chunky:
 * mistakes should tell stories and cost real time, not shave milliseconds.
 */
export function hesitationDelayMs(rng: Rng): number {
  return rng.int(1200, 3200);
}

/** Rolled when a movement window opens: does the character get out of the fire? */
export function rollFailToMove(rng: Rng, discipline: number): boolean {
  return rng.chance(Math.min(0.5, mistakeChance(discipline) * 1.5));
}

/** Extra delay on the reactive potion, 0 if no mistake. */
export function rollSlowPotionMs(rng: Rng, discipline: number): number {
  return rng.chance(mistakeChance(discipline)) ? rng.int(1000, 2400) : 0;
}
