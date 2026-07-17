import { runFight, type FightResultKind, type FightSetup } from '../sim/engine';
import { distribution, type Distribution } from './distribution';
import { summarizeRun, type RunSummary } from './metrics';

/**
 * Monte Carlo sim (GDD §3): many rolled runs, distributions instead of
 * single values. Run i uses seed baseSeed + i, so any individual run can
 * be re-simulated with its full event stream on demand.
 */

export interface MonteCarloResult {
  iterations: number;
  baseSeed: number;
  killRate: number;
  lossBreakdown: Partial<Record<FightResultKind, number>>;
  dps: Distribution;
  /** Over kills only. */
  timeToKillMs: Distribution;
  avgMistakesPerRun: number;
  mistakeCounts: Record<string, number>;
  deathCauses: Record<string, number>;
  runs: RunSummary[];
}

export function runMonteCarlo(
  setup: Omit<FightSetup, 'seed'>,
  iterations: number,
  baseSeed: number,
): MonteCarloResult {
  const runs: RunSummary[] = [];
  for (let i = 0; i < iterations; i++) {
    runs.push(summarizeRun(runFight({ ...setup, seed: baseSeed + i })));
  }

  const kills = runs.filter((r) => r.result === 'kill');
  const lossBreakdown: Partial<Record<FightResultKind, number>> = {};
  const mistakeCounts: Record<string, number> = {};
  const deathCauses: Record<string, number> = {};
  let totalMistakes = 0;

  for (const r of runs) {
    if (r.result !== 'kill') {
      lossBreakdown[r.result] = (lossBreakdown[r.result] ?? 0) + 1;
    }
    for (const [kind, n] of Object.entries(r.mistakes)) {
      mistakeCounts[kind] = (mistakeCounts[kind] ?? 0) + n;
      totalMistakes += n;
    }
    if (r.deathCause) {
      deathCauses[r.deathCause] = (deathCauses[r.deathCause] ?? 0) + 1;
    }
  }

  return {
    iterations,
    baseSeed,
    killRate: kills.length / iterations,
    lossBreakdown,
    dps: distribution(runs.map((r) => r.dps)),
    timeToKillMs: distribution(kills.map((r) => r.durationMs)),
    avgMistakesPerRun: totalMistakes / iterations,
    mistakeCounts,
    deathCauses,
    runs,
  };
}
