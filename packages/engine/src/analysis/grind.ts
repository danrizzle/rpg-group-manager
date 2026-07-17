import { runFight, type CharacterDef, type FightSetup } from '../sim/engine';
import type { MobPackDefinition } from '../model/mobPack';
import type { StanceConfig } from '../model/stance';

/**
 * Sim-derived grinding rates (GDD §5). A cached Monte Carlo of the character
 * (gear, stances, earned stats) vs. a zone's mob pack yields XP/hour and
 * deaths/hour — so gear and stances scale the grind automatically and a
 * better AoE stance genuinely grinds faster. Everything is read from the
 * event stream only (mob `death` events carry `xpPerKill`); the rates layer
 * never inspects sim internals.
 *
 * Overlevel XP devaluation is applied *on top* of the raw sim output, never
 * baked into the sim — no content scaling (§2).
 */

/** Downtime around a pull (how a character grinds; not intrinsic mob data). */
export interface PullCycle {
  /** Approach/travel before engaging the pack. */
  approachMs: number;
  /** Regen/drink downtime after a cleared pull. */
  recoveryMs: number;
  /** Extra downtime after a death (corpse run / rez), on top of recovery. */
  deathPenaltyMs: number;
}

/** Sensible starting downtime — tunable balance. */
export const DEFAULT_PULL_CYCLE: PullCycle = {
  approachMs: 6_000,
  recoveryMs: 12_000,
  deathPenaltyMs: 60_000,
};

export type RiskTier = 'low' | 'risky' | 'deadly';

export interface GrindRates {
  xpPerHour: number;
  killsPerHour: number;
  deathsPerHour: number;
  riskTier: RiskTier;
  // Diagnostics.
  avgPullMs: number;
  avgXpPerPull: number;
  deathRatePerPull: number;
}

/** Deaths/hour → risk tier. Thresholds are tunable balance dials. */
export function riskTier(deathsPerHour: number): RiskTier {
  if (deathsPerHour < 1) return 'low';
  if (deathsPerHour < 5) return 'risky';
  return 'deadly';
}

/**
 * Overlevel devaluation (GDD §5): XP per kill falls once the character is
 * above the zone's band top, down to a 10% floor. Underlevel grants no bonus
 * (capped at 1×). XP only — loot/materials stay fully effective.
 */
export function devalue(xp: number, charLevel: number, bandMax: number): number {
  const factor = Math.min(1, Math.max(0.1, 1 - 0.25 * (charLevel - bandMax)));
  return xp * factor;
}

export interface GrindSetup {
  player: CharacterDef;
  stance: StanceConfig;
  pack: MobPackDefinition;
}

/**
 * Run `iterations` fixed-seed pulls (seed = baseSeed + i, each re-simulatable)
 * and aggregate wall-clock rates. Wall time per pull = approach + the sim's
 * fight duration + recovery, plus a death penalty on pulls that end in death.
 * XP earned in a pull = sum of `xpPerKill` over the mobs that died in it — kept
 * even when the player dies partway (§5).
 */
export function grindRates(
  setup: GrindSetup,
  cycle: PullCycle,
  iterations: number,
  baseSeed: number,
): GrindRates {
  let totalXp = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalWallMs = 0;

  const base: Omit<FightSetup, 'seed'> = {
    player: setup.player,
    stance: setup.stance,
    pack: setup.pack,
  };

  for (let i = 0; i < iterations; i++) {
    const res = runFight({ ...base, seed: baseSeed + i });
    let xp = 0;
    let kills = 0;
    for (const e of res.events) {
      if (e.type === 'death' && e.meta?.['mobId'] !== undefined) {
        xp += Number(e.meta['xpPerKill'] ?? 0);
        kills += 1;
      }
    }
    const died = res.result === 'playerDeath';
    totalXp += xp;
    totalKills += kills;
    totalDeaths += died ? 1 : 0;
    totalWallMs +=
      cycle.approachMs + res.durationMs + cycle.recoveryMs + (died ? cycle.deathPenaltyMs : 0);
  }

  const perHour = (n: number): number => (totalWallMs > 0 ? (n / totalWallMs) * 3_600_000 : 0);
  const deathsPerHour = perHour(totalDeaths);

  return {
    xpPerHour: perHour(totalXp),
    killsPerHour: perHour(totalKills),
    deathsPerHour,
    riskTier: riskTier(deathsPerHour),
    avgPullMs: totalWallMs / iterations,
    avgXpPerPull: totalXp / iterations,
    deathRatePerPull: totalDeaths / iterations,
  };
}
