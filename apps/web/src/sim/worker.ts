/// <reference lib="webworker" />
import {
  DEFAULT_PULL_CYCLE,
  ITEMS_BY_ID,
  ZONES,
  devalue,
  grindRates,
  makeCinderMaw,
  makeMage,
  packBandMax,
  runMonteCarlo,
  type GearSlot,
  type GrindRates,
  type Item,
  type StanceConfig,
} from '@rpg/engine';
import type { ZoneId } from '../world/types';

/**
 * Off-main-thread sim. Handles two request kinds behind a discriminated
 * envelope so replies never get crossed:
 *   - 'sim'   → Monte Carlo vs. Cinder Maw (training dummy)
 *   - 'grind' → sim-derived XP/hour + risk tier vs. a zone's mob pack
 * The engine is a pure module — it loads in a worker unchanged.
 */

interface BehaviorInput {
  discipline: number;
  aoeEfficiency: number;
  damageWhileMoving: number;
}

export interface SimRequest {
  stance: StanceConfig;
  behavior: BehaviorInput;
  gear: Record<GearSlot, string>;
  level: number;
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
  dpsValues: number[];
}

export interface GrindRequest {
  zone: ZoneId;
  stance: StanceConfig;
  behavior: BehaviorInput;
  gear: Record<GearSlot, string>;
  level: number;
  iterations: number;
  baseSeed: number;
}

export type GrindResponse = GrindRates & { zone: ZoneId; level: number };

export type WorkerRequest =
  | { kind: 'sim'; id: number; req: SimRequest }
  | { kind: 'grind'; id: number; req: GrindRequest };

export type WorkerResponse =
  | { kind: 'sim'; id: number; res: SimResponse }
  | { kind: 'grind'; id: number; res: GrindResponse };

const resolveItems = (gear: Record<GearSlot, string>): Item[] =>
  Object.values(gear)
    .map((id) => ITEMS_BY_ID[id])
    .filter((i): i is Item => Boolean(i));

function runSim(req: SimRequest): SimResponse {
  const items = resolveItems(req.gear);
  const started = performance.now();
  const result = runMonteCarlo(
    { player: makeMage(req.behavior, items, req.level), boss: makeCinderMaw(), stance: req.stance },
    req.iterations,
    req.baseSeed,
  );
  return {
    iterations: req.iterations,
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
}

function runGrind(req: GrindRequest): GrindResponse {
  const items = resolveItems(req.gear);
  const pack = ZONES[req.zone]!();
  const raw = grindRates(
    { player: makeMage(req.behavior, items, req.level), stance: req.stance, pack },
    DEFAULT_PULL_CYCLE,
    req.iterations,
    req.baseSeed,
  );
  // Overlevel devaluation is applied on top of the raw sim XP (no content scaling).
  const factor = devalue(1, req.level, packBandMax(pack));
  return { ...raw, xpPerHour: raw.xpPerHour * factor, zone: req.zone, level: req.level };
}

self.onmessage = (msg: MessageEvent<WorkerRequest>) => {
  const m = msg.data;
  if (m.kind === 'sim') {
    const res = runSim(m.req);
    self.postMessage({ kind: 'sim', id: m.id, res } satisfies WorkerResponse);
  } else {
    const res = runGrind(m.req);
    self.postMessage({ kind: 'grind', id: m.id, res } satisfies WorkerResponse);
  }
};
