import { GCD_MS, type Ability } from '../model/ability';
import type { BehaviorStats, CombatStats } from '../model/stats';
import type { StanceConfig } from '../model/stance';

/**
 * The "no rotation lists" brain (GDD §3). Sliders reweight a score over
 * ability *tags*; the situation (enemy count, own HP, movement) feeds the
 * expected value. The player tunes weights — the sim makes the calls.
 */

export interface DecisionContext {
  /** Abilities that are off cooldown and on the GCD. */
  ready: Ability[];
  stance: StanceConfig;
  stats: CombatStats;
  behavior: BehaviorStats;
  /** 0..1 own HP. */
  hpPct: number;
  livingEnemies: number;
  moving: boolean;
}

export function chooseAction(ctx: DecisionContext): Ability | null {
  const damageCandidates = ctx.ready.filter((a) => a.effect.kind === 'damage');
  const scored = new Map<Ability, number>();

  // Damage abilities: expected damage per second of GCD time, then
  // reweighted by the single-target↔AoE slider.
  let maxDps = 0;
  const dpsOf = new Map<Ability, number>();
  for (const a of damageCandidates) {
    if (a.effect.kind !== 'damage') continue;
    let expected = a.effect.base + a.effect.coeff * ctx.stats.spellPower;
    if (a.effect.aoe) expected *= ctx.livingEnemies * ctx.behavior.aoeEfficiency;
    if (ctx.moving && a.movementPenalty) expected *= ctx.behavior.damageWhileMoving;
    const dps = expected / (Math.max(a.castTimeMs, GCD_MS) / 1000);
    dpsOf.set(a, dps);
    maxDps = Math.max(maxDps, dps);
  }
  for (const [a, dps] of dpsOf) {
    const isAoe = a.tags.includes('aoe');
    const weight = 0.2 + 0.8 * (isAoe ? ctx.stance.targeting : 1 - ctx.stance.targeting);
    scored.set(a, (dps / (maxDps || 1)) * weight);
  }

  // Defensive abilities: worth more the lower the HP and the more
  // defensive the stance. Competes against the best damage score (~1.0).
  for (const a of ctx.ready) {
    if (!a.tags.includes('defensive')) continue;
    // At full offense the weight can never beat the best damage score —
    // glass cannon is a real stance choice, not a rounding artifact.
    const weight = 0.6 + 1.2 * (1 - ctx.stance.offense);
    scored.set(a, weight * (1 - ctx.hpPct));
  }

  let best: Ability | null = null;
  let bestScore = -Infinity;
  for (const [a, score] of scored) {
    if (score > bestScore) {
      best = a;
      bestScore = score;
    }
  }
  return best;
}

/** Off-GCD burst cooldowns fire outside the action cycle. */
export function shouldUseBurst(stance: StanceConfig): boolean {
  return stance.burstCds === 'automatic' && stance.offense >= 0.3;
}
