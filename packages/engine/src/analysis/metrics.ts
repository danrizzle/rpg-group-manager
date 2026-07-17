import type { CombatEvent } from '../core/events';
import { PLAYER_ID, type FightResult, type FightResultKind, type FightSetup } from '../sim/engine';

/**
 * Per-run summary, computed ONLY from the event stream — the invariant
 * that proves the stream is complete enough for any future consumer
 * (bar UI, replays, wipe analysis).
 */
export interface RunSummary {
  result: FightResultKind;
  durationMs: number;
  dps: number;
  damageDone: number;
  damageTaken: number;
  healingDone: number;
  mistakes: Record<string, number>;
  /** What landed the killing blow, if the player died. */
  deathCause?: string;
}

export function summarizeRun(fight: FightResult): RunSummary {
  let damageDone = 0;
  let damageTaken = 0;
  let healingDone = 0;
  const mistakes: Record<string, number> = {};
  let deathCause: string | undefined;

  for (const e of fight.events) {
    switch (e.type) {
      case 'damage':
        if (e.source === PLAYER_ID) damageDone += e.value ?? 0;
        if (e.target === PLAYER_ID) damageTaken += e.value ?? 0;
        break;
      case 'heal':
        if (e.source === PLAYER_ID) healingDone += e.value ?? 0;
        break;
      case 'mistake': {
        const kind = String(e.meta?.['kind'] ?? 'unknown');
        mistakes[kind] = (mistakes[kind] ?? 0) + 1;
        break;
      }
      case 'death':
        if (e.source === PLAYER_ID) deathCause = String(e.meta?.['killedBy'] ?? 'unknown');
        break;
    }
  }

  const seconds = Math.max(1, fight.durationMs) / 1000;
  return {
    result: fight.result,
    durationMs: fight.durationMs,
    dps: damageDone / seconds,
    damageDone,
    damageTaken,
    healingDone,
    mistakes,
    ...(deathCause !== undefined ? { deathCause } : {}),
  };
}

/**
 * Post-fight review (GDD §3): the decisive facts of one run, computed ONLY
 * from the event stream plus the declarative setup. Structured, not prose —
 * presentation (the wipe line, comparison chips) is the consumer's job.
 */

export type PotionNote =
  | 'no-potion-equipped'
  | 'potion-disabled' // threshold 0 — the policy can never fire
  | 'out-of-charges'
  | 'on-cooldown'
  | 'too-fast'; // potion was available; death outran the reaction window

export interface WipeAnalysis {
  kind: Exclude<FightResultKind, 'kill'>;
  atMs: number;
  /** What landed the killing blow (death wipes). */
  killedBy?: string;
  /** Why the potion didn't save them (death wipes). */
  potionNote?: PotionNote;
  /** How close it was (enrage/timeout wipes): boss HP % remaining. */
  bossHpPctLeft?: number;
}

export interface FightReview {
  summary: RunSummary;
  /** Consumable id → uses this fight (passives count 1, potions per charge). */
  consumablesUsed: Record<string, number>;
  wipe: WipeAnalysis | null;
}

export function fightReview(fight: FightResult, setup: Omit<FightSetup, 'seed'>): FightReview {
  const summary = summarizeRun(fight);
  const { player, boss, stance } = setup;

  // Consumable usage: passives are the t=0 consumable-flagged buffs; actives
  // are heals cast by the abilities tagged 'consumable' (the pull-deduction
  // rule, GDD §3 — the stream is the source of truth).
  const consumableIds = new Set(
    player.abilities.filter((a) => a.tags.includes('consumable')).map((a) => a.id),
  );
  const consumablesUsed: Record<string, number> = {};
  let lastPotionAtMs = -Infinity;
  for (const e of fight.events) {
    if (e.type === 'buffApplied' && e.meta?.['consumable'] === true) {
      const id = String(e.meta['buffId']);
      consumablesUsed[id] = (consumablesUsed[id] ?? 0) + 1;
    } else if (e.type === 'heal' && e.source === PLAYER_ID) {
      const id = String(e.meta?.['abilityId'] ?? '');
      if (consumableIds.has(id)) {
        consumablesUsed[id] = (consumablesUsed[id] ?? 0) + 1;
        lastPotionAtMs = e.t;
      }
    }
  }

  if (fight.result === 'kill') return { summary, consumablesUsed, wipe: null };

  const wipe: WipeAnalysis = { kind: fight.result, atMs: fight.durationMs };
  if (fight.result === 'playerDeath' || summary.deathCause !== undefined) {
    if (summary.deathCause !== undefined) wipe.killedBy = summary.deathCause;
    const potion = player.abilities.find((a) => a.tags.includes('consumable'));
    const uses = potion ? consumablesUsed[potion.id] ?? 0 : 0;
    wipe.potionNote = !potion
      ? 'no-potion-equipped'
      : stance.potionThresholdPct === 0
        ? 'potion-disabled'
        : uses >= (potion.chargesPerFight ?? Infinity)
          ? 'out-of-charges'
          : fight.durationMs - lastPotionAtMs < potion.cooldownMs
            ? 'on-cooldown'
            : 'too-fast';
  }
  if ((fight.result === 'enrage' || fight.result === 'timeout') && boss) {
    const bossDamage = fight.events
      .filter((e) => e.type === 'damage' && e.source === PLAYER_ID && e.target === 'boss')
      .reduce((sum, e) => sum + (e.value ?? 0), 0);
    wipe.bossHpPctLeft = Math.max(0, (1 - bossDamage / boss.hp) * 100);
  }
  return { summary, consumablesUsed, wipe };
}

/** Human-readable tail of an event stream (debugging / wipe review). */
export function formatEvents(events: readonly CombatEvent[]): string[] {
  return events.map((e) => {
    const t = (e.t / 1000).toFixed(1).padStart(6);
    const parts = [`${t}s`, e.type, e.source];
    if (e.target && e.target !== e.source) parts.push(`→ ${e.target}`);
    if (e.value !== undefined) parts.push(String(e.value));
    if (e.meta) parts.push(JSON.stringify(e.meta));
    return parts.join('  ');
  });
}
