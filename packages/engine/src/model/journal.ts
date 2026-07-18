import type { BossDefinition } from './boss';
import type { CombatEvent } from '../core/events';
import { BOSS_ID } from '../sim/engine';

/**
 * Boss discovery (GDD §4): new bosses are unknown; every attempt reveals
 * what the group experienced, straight from the event stream. Knowledge is a
 * monotone set of discovered mechanic keys plus progress markers; the
 * journal UI renders ✓/??? rows from (definition, knowledge), and
 * `redactBoss` builds the dummy-sim version containing ONLY what the
 * journal knows — you can test the next plan against everything you've
 * seen, and nothing you haven't.
 */

/** Fights end at 10 min; anything scheduled beyond can never fire. */
const NEVER_MS = 10_000_000;
const MAX_FIGHT_MS = 600_000;

export type MechanicKey = string;

export interface BossKnowledge {
  /** Discovered mechanic keys (subset of `mechanicsOf(def)`). */
  seen: MechanicKey[];
  /** Best progress: lowest boss HP % reached across attempts (100 = untouched). */
  lowestBossHpPct: number;
  attempts: number;
}

export const EMPTY_KNOWLEDGE: BossKnowledge = { seen: [], lowestBossHpPct: 100, attempts: 0 };

/**
 * The discoverable mechanics a definition actually contains. Melee and the
 * HP pool are visible in any attempt and are not "mechanics"; unused no-op
 * slots (never-firing windows, atHpPct 0) don't count either.
 */
export function mechanicsOf(def: BossDefinition): MechanicKey[] {
  const keys: MechanicKey[] = def.timeline.map((t) => `timeline:${t.id}`);
  if (def.movementWindows.firstAtMs < MAX_FIGHT_MS && def.movementWindows.durationMs > 0) {
    keys.push('movement');
  }
  if (def.enrageAtMs < MAX_FIGHT_MS) keys.push('enrage');
  if (def.addPhase.atHpPct > 0) {
    keys.push('adds');
    if (def.addPhase.tantrumAfterMs < MAX_FIGHT_MS) keys.push('tantrum');
  }
  return keys;
}

/**
 * Fold one attempt's event stream into knowledge (pure, monotone — wipes
 * count, GDD §2). Keys are only added if the definition contains them, so
 * stale streams from retuned bosses can't invent mechanics.
 */
export function discover(
  def: BossDefinition,
  events: readonly CombatEvent[],
  prev: BossKnowledge = EMPTY_KNOWLEDGE,
): BossKnowledge {
  const valid = new Set(mechanicsOf(def));
  const seen = new Set(prev.seen.filter((k) => valid.has(k)));
  let bossDamage = 0;
  for (const e of events) {
    switch (e.type) {
      case 'castEnd':
        if (e.source === BOSS_ID) seen.add(`timeline:${String(e.meta?.['abilityId'])}`);
        break;
      case 'movementStart':
        if (e.source === BOSS_ID) seen.add('movement');
        break;
      case 'enrage':
        seen.add('enrage');
        break;
      case 'phaseChange':
        seen.add('adds');
        break;
      case 'buffApplied':
        if (e.meta?.['buffId'] === 'tantrum') seen.add('tantrum');
        break;
      case 'damage':
        if (e.target === BOSS_ID) bossDamage += e.value ?? 0;
        break;
    }
  }
  const hpPctLeft = Math.max(0, (1 - bossDamage / def.hp) * 100);
  return {
    seen: [...seen].filter((k) => valid.has(k)).sort(),
    lowestBossHpPct: Math.min(prev.lowestBossHpPct, hpPctLeft),
    attempts: prev.attempts + 1,
  };
}

/** 0..1 — how much of the boss the journal has uncovered. */
export function explorationPct(def: BossDefinition, knowledge: BossKnowledge): number {
  const all = mechanicsOf(def);
  if (all.length === 0) return 1;
  const seen = new Set(knowledge.seen);
  return all.filter((k) => seen.has(k)).length / all.length;
}

/**
 * The dummy-sim version of a boss: undiscovered mechanics are no-opped with
 * the same patterns unused slots use in content (GDD §4 — only revealed
 * mechanics are simulatable). Melee and HP are always present.
 */
export function redactBoss(def: BossDefinition, knowledge: BossKnowledge): BossDefinition {
  const seen = new Set(knowledge.seen);
  return {
    ...def,
    timeline: def.timeline.filter((t) => seen.has(`timeline:${t.id}`)),
    movementWindows: seen.has('movement')
      ? def.movementWindows
      : { firstAtMs: NEVER_MS, everyMs: NEVER_MS, durationMs: 0, failDamage: 0, failDamageType: 'physical' },
    enrageAtMs: seen.has('enrage') ? def.enrageAtMs : NEVER_MS,
    addPhase: seen.has('adds')
      ? {
          ...def.addPhase,
          tantrumAfterMs: seen.has('tantrum') ? def.addPhase.tantrumAfterMs : NEVER_MS,
        }
      : { ...def.addPhase, atHpPct: 0 },
  };
}

/**
 * Boss familiarity (GDD §2): every attempt — wipes included — makes the
 * roster better at THIS boss. Implemented as bonus discipline (discipline
 * drives both mistake rate and reaction time, the two things familiarity
 * improves). Additive on top of earned discipline, folded like gear.
 */
export function familiarityBonus(attempts: number): number {
  return Math.min(20, attempts * 2);
}
