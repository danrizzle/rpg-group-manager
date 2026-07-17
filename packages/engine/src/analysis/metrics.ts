import type { CombatEvent } from '../core/events';
import { PLAYER_ID, type FightResult, type FightResultKind } from '../sim/engine';

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
