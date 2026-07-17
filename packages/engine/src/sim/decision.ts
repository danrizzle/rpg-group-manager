import { GCD_MS, type Ability } from '../model/ability';
import type { BehaviorStats, CombatStats } from '../model/stats';
import type { StanceConfig } from '../model/stance';

/**
 * The "no rotation lists" brain (GDD §3). Sliders reweight a score over
 * ability *tags*; the situation (enemy count, own HP, movement) feeds the
 * expected value. The player tunes weights — the sim makes the calls.
 */

export interface AllyView {
  id: string;
  /** 0..1 current HP. */
  hpPct: number;
}

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
  /** Living party members incl. self (party fights only) — heal targeting. */
  allies?: AllyView[];
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
    const power =
      a.effect.powerStat === 'attackPower' ? ctx.stats.attackPower : ctx.stats.spellPower;
    let expected = a.effect.base + a.effect.coeff * power;
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

  // Heal abilities (healer kits): scored by the target's HP deficit under
  // the same offense↔defense weight as defensives, so a Guarded healer heals
  // earlier and a Reckless one squeezes in more damage. Nobody meaningfully
  // hurt → not scored at all (no full-HP heal spam; damage/idle wins).
  for (const a of ctx.ready) {
    if (a.effect.kind !== 'heal' || a.tags.includes('consumable')) continue;
    const allies = ctx.allies ?? [{ id: 'self', hpPct: ctx.hpPct }];
    const mode = a.effect.target ?? 'self';
    const weight = 0.6 + 1.2 * (1 - ctx.stance.offense);
    let deficit: number;
    if (mode === 'party') {
      // Group heals want breadth: the average deficit, boosted so they beat
      // the single heal once several members are hurt.
      const sum = allies.reduce((s, x) => s + (1 - x.hpPct), 0);
      deficit = (sum / allies.length) * 1.6;
    } else if (mode === 'lowest-ally') {
      deficit = Math.max(...allies.map((x) => 1 - x.hpPct));
    } else {
      deficit = 1 - ctx.hpPct;
    }
    if (deficit < 0.05) continue;
    // Heal CDs (Divine Hymn) are precious: the auto policy holds them for
    // emergencies, then lets them beat everything. Plans/calls fire them
    // deliberately (slices 5–6).
    if (a.tags.includes('heal-cd')) {
      if (deficit < 0.35) continue;
      scored.set(a, 2.5 * deficit);
      continue;
    }
    scored.set(a, weight * deficit);
  }

  // Defensive abilities: worth more the lower the HP and the more
  // defensive the stance. Competes against the best damage score (~1.0).
  for (const a of ctx.ready) {
    if (!a.tags.includes('defensive')) continue;
    if ((ctx.stance.barrierPolicy ?? 'reactive') === 'proactive') {
      // Proactive: recast whenever ready. Damage scores are normalized ≤ 1
      // and the reactive weight caps at 1.8, so 2 always wins the GCD.
      scored.set(a, 2);
      continue;
    }
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
