import type { DamageType } from './stats';

/**
 * Declarative open-world grinding content (GDD §5). A zone's representative
 * "mob pack" is 1–3 mobs present from the pull's start; the fight is cleared
 * only when all of them are dead (or ends in the player's death). Rates
 * (XP/hour, deaths/hour, risk tier) are sim-derived from Monte Carlo pulls —
 * see analysis/grind.ts — never hand-tuned, so gear and stances scale the
 * grind automatically.
 *
 * Like bosses, mobs are pure data: adding a pack needs no engine code.
 */

export interface MobDefinition {
  /** Mob-type id; emitted in the death event's meta for XP attribution. */
  id: string;
  name: string;
  hp: number;
  meleeDamage: number;
  meleeSwingMs: number;
  meleeDamageType: DamageType;
  /** The mob's level band — drives display and overlevel XP devaluation. */
  levelBand: { min: number; max: number };
  /** XP granted when this mob dies. Per mob, so a pack may mix mob types. */
  xpPerKill: number;
}

export interface MobPackDefinition {
  id: string;
  name: string;
  /** 1–3 mobs, all present from t=0. */
  mobs: MobDefinition[];
  /**
   * ± fraction applied to melee swing pacing (mirrors
   * BossDefinition.timerJitterPct). 0 = fixed timers.
   */
  timerJitterPct: number;
}

/** The highest band-max across a pack's mobs — the zone's effective band top. */
export function packBandMax(pack: MobPackDefinition): number {
  return Math.max(...pack.mobs.map((m) => m.levelBand.max));
}
