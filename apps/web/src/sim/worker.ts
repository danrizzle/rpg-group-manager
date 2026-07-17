/// <reference lib="webworker" />
import {
  makeCinderMaw,
  makeMage,
  runMonteCarlo,
  type StanceConfig,
} from '@rpg/engine';

/**
 * Monte Carlo runs off the main thread so the sliders stay live.
 * The engine is a pure module — it loads in a worker unchanged.
 */

export interface SimRequest {
  stance: StanceConfig;
  behavior: { discipline: number; aoeEfficiency: number; damageWhileMoving: number };
  iterations: number;
  baseSeed: number;
}

export interface SimResponse {
  iterations: number;
  elapsedMs: number;
  killRate: number;
  lossBreakdown: Record<string, number>;
  dps: { mean: number; stddev: number; p10: number; p50: number; p90: number };
  timeToKillMs: { mean: number; stddev: number; p10: number; p50: number; p90: number };
  avgMistakesPerRun: number;
  mistakeCounts: Record<string, number>;
  deathCauses: Record<string, number>;
  /** Per-run DPS values for the histogram. */
  dpsValues: number[];
}

self.onmessage = (msg: MessageEvent<SimRequest>) => {
  const { stance, behavior, iterations, baseSeed } = msg.data;
  const started = performance.now();
  const result = runMonteCarlo(
    { player: makeMage(behavior), boss: makeCinderMaw(), stance },
    iterations,
    baseSeed,
  );
  const response: SimResponse = {
    iterations,
    elapsedMs: performance.now() - started,
    killRate: result.killRate,
    lossBreakdown: result.lossBreakdown as Record<string, number>,
    dps: result.dps,
    timeToKillMs: result.timeToKillMs,
    avgMistakesPerRun: result.avgMistakesPerRun,
    mistakeCounts: result.mistakeCounts,
    deathCauses: result.deathCauses,
    dpsValues: result.runs.map((r) => r.dps),
  };
  self.postMessage(response);
};
