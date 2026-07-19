/// <reference lib="webworker" />
import {
  COMP_PASSIVES,
  DEFAULT_PULL_CYCLE,
  GROUP_CDS,
  ITEMS_BY_ID,
  ZONES,
  applyComp,
  devalue,
  encounterById,
  grindRates,
  makeCinderMaw,
  makeEmberForge,
  makeMage,
  makePriest,
  makeWarrior,
  packBandMax,
  redactBoss,
  runMonteCarlo,
  sanitizePlan,
  type BossKnowledge,
  type BossPlan,
  type GearSlot,
  type GrindRates,
  type Item,
  type PartyMember,
  type StanceConfig,
} from '@rpg/engine';
import type { ZoneId } from '../world/types';
import { BOSS_FACTORIES } from './bosses';
import { resolveConsumables } from '../world/professions';

/**
 * Off-main-thread sim. Handles two request kinds behind a discriminated
 * envelope so replies never get crossed:
 *   - 'sim'   → Monte Carlo vs. Cinder Maw (training dummy)
 *   - 'grind' → sim-derived XP/hour + risk tier vs. a zone's mob pack
 * The engine is a pure module — it loads in a worker unchanged.
 */

/**
 * Earned-stat OVERRIDES, layered on the class's own base by the kit factory.
 * PARTIAL on purpose: the classes ship different bases (damageWhileMoving is
 * 0.6 mage / 0.8 warrior / 0.5 priest), so sending a filled object would
 * flatten every class onto the mage's numbers.
 */
interface BehaviorInput {
  discipline?: number;
  aoeEfficiency?: number;
  damageWhileMoving?: number;
}

export interface RosterBuildInput {
  stance: StanceConfig;
  gear: Record<GearSlot, string>;
  consumables: string[];
  /** Recruit talent selection (slice 6). */
  talents: string[];
}

/**
 * Dungeon-boss dummy sim (phase 4): present ⇒ simulate the TRINITY against
 * the journal-redacted boss — only revealed mechanics run (GDD §4).
 */
export interface EncounterSimInput {
  id: string;
  knowledge: BossKnowledge;
  roster: { warrior: RosterBuildInput; priest: RosterBuildInput };
  /** Familiarity bonus discipline per char id (warrior/priest/mage). */
  familiarity: Record<string, number>;
  /** The boss plan — the dummy tests plans against known mechanics (GDD §4). */
  plan?: BossPlan;
}

export interface SimRequest {
  stance: StanceConfig;
  behavior: BehaviorInput;
  gear: Record<GearSlot, string>;
  level: number;
  talents: string[];
  /** Equipped consumable slot ids — the dummy simulates them for free (GDD §3). */
  consumables: string[];
  /** Dummy target (slice 6 QoL); unknown ids fall back to Cinder Maw. */
  bossId: string;
  encounter?: EncounterSimInput;
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
  /** Which kit grinds — each character farms with their own class (slice 5.1). */
  charId: 'mage' | 'warrior' | 'priest';
  stance: StanceConfig;
  behavior: BehaviorInput;
  gear: Record<GearSlot, string>;
  level: number;
  talents: string[];
  iterations: number;
  baseSeed: number;
}

export type GrindResponse = GrindRates & {
  zone: ZoneId;
  level: number;
  charId: 'mage' | 'warrior' | 'priest';
};

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

/** The trinity at the requested builds — mirrors the store's pullEncounter. */
function buildParty(req: SimRequest): PartyMember[] {
  const enc = req.encounter!;
  const fam = (id: string) => enc.familiarity[id] ?? 0;
  const defs = applyComp(
    [
      makeWarrior(
        { discipline: 50 + fam('warrior') },
        resolveItems(enc.roster.warrior.gear),
        10,
        enc.roster.warrior.talents,
        resolveConsumables(enc.roster.warrior.consumables),
      ),
      makePriest(
        { discipline: 50 + fam('priest') },
        resolveItems(enc.roster.priest.gear),
        10,
        enc.roster.priest.talents,
        resolveConsumables(enc.roster.priest.consumables),
      ),
      makeMage(
        { ...req.behavior, discipline: (req.behavior.discipline ?? 50) + fam('mage') },
        resolveItems(req.gear),
        req.level,
        req.talents,
        resolveConsumables(req.consumables),
      ),
    ],
    GROUP_CDS,
    COMP_PASSIVES,
  );
  const stances = [enc.roster.warrior.stance, enc.roster.priest.stance, req.stance];
  return defs.map((character, i) => ({ character, stance: stances[i]! }));
}

function runSim(req: SimRequest): SimResponse {
  const started = performance.now();
  let setup;
  if (req.encounter) {
    const enc = encounterById(makeEmberForge(), req.encounter.id);
    if (!enc || enc.kind !== 'boss') throw new Error(`unknown boss encounter '${req.encounter.id}'`);
    // The dummy simulates ONLY what the journal knows (GDD §4).
    const party = buildParty(req);
    const plan = req.encounter.plan
      ? sanitizePlan(req.encounter.plan, party.map((m) => m.character))
      : undefined;
    setup = {
      party,
      boss: redactBoss(enc.boss, req.encounter.knowledge),
      ...(plan?.entries.length ? { plan } : {}),
    };
  } else {
    setup = {
      player: makeMage(req.behavior, resolveItems(req.gear), req.level, req.talents, resolveConsumables(req.consumables)),
      boss: (BOSS_FACTORIES[req.bossId] ?? makeCinderMaw)(),
      stance: req.stance,
    };
  }
  const result = runMonteCarlo(setup, req.iterations, req.baseSeed);
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
  // v1: grinding runs on the crafted-consumable economy with EMPTY slots —
  // the free legacy potion must not leak into AFK grinding. Per-task
  // consumable budgets are a possible follow-up.
  // Each character grinds with their own kit. Recruits have no talents and no
  // behavior overrides of their own (see RosterBuild) — the store passes the
  // class defaults, matching what `pullEncounter` already builds them with.
  const player =
    req.charId === 'warrior'
      ? makeWarrior(req.behavior, items, req.level, [])
      : req.charId === 'priest'
        ? makePriest(req.behavior, items, req.level, [])
        : makeMage(req.behavior, items, req.level, req.talents, []);
  const raw = grindRates(
    { player, stance: req.stance, pack },
    DEFAULT_PULL_CYCLE,
    req.iterations,
    req.baseSeed,
  );
  // Overlevel devaluation is applied on top of the raw sim XP (no content scaling).
  const factor = devalue(1, req.level, packBandMax(pack));
  return {
    ...raw,
    xpPerHour: raw.xpPerHour * factor,
    zone: req.zone,
    level: req.level,
    charId: req.charId,
  };
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
