/// <reference lib="webworker" />
import {
  COMP_PASSIVES,
  DEFAULT_PULL_CYCLE,
  GROUP_CDS,
  ITEMS_BY_ID,
  LEVEL_CAP,
  ZONES,
  applyComp,
  devalue,
  encounterById,
  grindRates,
  makeCinderMaw,
  makeEmberForge,
  makeCinderforge,
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
  /** Stable roster id — becomes the actor id in the event stream. */
  id?: string;
  /** Display name; falls back to the class default. */
  name?: string;
  /** Which kit to build. Absent = mage (pre-slice-11 requests). */
  classId?: 'mage' | 'warrior' | 'priest';
  /** Own level; absent = the cap, which is where recruits arrive. */
  level?: number;
  /** Earned-stat overrides; PARTIAL, layered on the class base. */
  behavior?: BehaviorInput;
  stance: StanceConfig;
  gear: Record<GearSlot, string>;
  consumables: string[];
  /** Recruit talent selection (slice 6). */
  talents: string[];
}

/**
 * Dungeon/raid dummy sim (phase 4, generalized in slice 11): present ⇒
 * simulate the PARTY against the journal-redacted boss — only revealed
 * mechanics run (GDD §4).
 */
export interface EncounterSimInput {
  id: string;
  knowledge: BossKnowledge;
  /** The party in fight order — three for a dungeon, ten for the raid. */
  party: RosterBuildInput[];
  /** Familiarity bonus discipline per char id. */
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

const MAKERS = { mage: makeMage, warrior: makeWarrior, priest: makePriest } as const;

/**
 * The party at the requested builds — mirrors the store's `assembleParty`.
 * Party-size agnostic: three for a dungeon, ten for the raid.
 *
 * The dummy resolves consumables at NOMINAL charges (no inventory argument):
 * simulating is free, and only real fights spend stock (GDD §3).
 */
function buildParty(req: SimRequest): PartyMember[] {
  const enc = req.encounter!;
  const fam = (id: string) => enc.familiarity[id] ?? 0;
  const defs = applyComp(
    enc.party.map((m) => {
      const classId = m.classId ?? 'mage';
      const id = m.id ?? classId;
      return {
        ...MAKERS[classId](
          { ...m.behavior, discipline: (m.behavior?.discipline ?? 50) + fam(id) },
          resolveItems(m.gear),
          m.level ?? LEVEL_CAP,
          m.talents,
          resolveConsumables(m.consumables),
        ),
        id,
        // Unique ids must be stamped before applyComp — two warriors would
        // otherwise collide on the engine's duplicate-id guard, and the
        // group-CD carrier is chosen by id.
        ...(m.name ? { name: m.name } : {}),
      };
    }),
    GROUP_CDS,
    COMP_PASSIVES,
  );
  return defs.map((character, i) => ({ character, stance: enc.party[i]!.stance }));
}

function runSim(req: SimRequest): SimResponse {
  const started = performance.now();
  let setup;
  if (req.encounter) {
    // Look the encounter up across every dungeon, not just the Ember Forge.
    const enc = [makeEmberForge(), makeCinderforge()]
      .map((d) => encounterById(d, req.encounter!.id))
      .find(Boolean);
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
  // Each character grinds with their own kit, talents included. `behavior` is
  // a partial override layered on the class's own base — never a filled
  // object, or every class would inherit the mage's damageWhileMoving.
  const make =
    req.charId === 'warrior' ? makeWarrior : req.charId === 'priest' ? makePriest : makeMage;
  const player = make(req.behavior, items, req.level, req.talents, []);
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
