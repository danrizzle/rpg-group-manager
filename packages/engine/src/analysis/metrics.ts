import type { CombatEvent } from '../core/events';
import { PLAYER_ID, type FightResult, type FightResultKind, type FightSetup } from '../sim/engine';

/**
 * Per-run summary, computed ONLY from the event stream — the invariant
 * that proves the stream is complete enough for any future consumer
 * (bar UI, replays, wipe analysis).
 */
export interface CharacterSummary {
  name: string;
  role?: string;
  dps: number;
  hps: number;
  damageDone: number;
  damageTaken: number;
  healingDone: number;
  mistakes: Record<string, number>;
  died: boolean;
  deathCause?: string;
}

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
  /** Per-character breakdown — party fights only (roster from `join` events). */
  perCharacter?: Record<string, CharacterSummary>;
}

/**
 * The player-side actor ids of a stream: the `join` roster for party fights,
 * else the solo PLAYER_ID (pre-party streams have no joins).
 */
export function playerIdsOf(events: readonly CombatEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const e of events) {
    if (e.type === 'join') ids.add(e.source);
  }
  if (ids.size === 0) ids.add(PLAYER_ID);
  return ids;
}

export function summarizeRun(fight: FightResult): RunSummary {
  const playerIds = playerIdsOf(fight.events);
  const isParty = fight.events.some((e) => e.type === 'join');
  let damageDone = 0;
  let damageTaken = 0;
  let healingDone = 0;
  const mistakes: Record<string, number> = {};
  let deathCause: string | undefined;

  const per: Record<string, CharacterSummary> = {};
  const charOf = (id: string): CharacterSummary => {
    let c = per[id];
    if (!c) {
      c = per[id] = {
        name: id,
        dps: 0,
        hps: 0,
        damageDone: 0,
        damageTaken: 0,
        healingDone: 0,
        mistakes: {},
        died: false,
      };
    }
    return c;
  };

  for (const e of fight.events) {
    switch (e.type) {
      case 'join': {
        const c = charOf(e.source);
        c.name = String(e.meta?.['name'] ?? e.source);
        if (e.meta?.['role'] !== undefined) c.role = String(e.meta['role']);
        break;
      }
      case 'damage':
        if (playerIds.has(e.source)) {
          damageDone += e.value ?? 0;
          if (isParty) charOf(e.source).damageDone += e.value ?? 0;
        }
        if (e.target !== undefined && playerIds.has(e.target)) {
          damageTaken += e.value ?? 0;
          if (isParty) charOf(e.target).damageTaken += e.value ?? 0;
        }
        break;
      case 'heal':
        if (playerIds.has(e.source)) {
          healingDone += e.value ?? 0;
          if (isParty) charOf(e.source).healingDone += e.value ?? 0;
        }
        break;
      case 'mistake': {
        const kind = String(e.meta?.['kind'] ?? 'unknown');
        mistakes[kind] = (mistakes[kind] ?? 0) + 1;
        if (isParty && playerIds.has(e.source)) {
          const c = charOf(e.source);
          c.mistakes[kind] = (c.mistakes[kind] ?? 0) + 1;
        }
        break;
      }
      case 'death':
        if (playerIds.has(e.source)) {
          // Solo: the player's death. Party: the LAST death is the wipe cause.
          deathCause = String(e.meta?.['killedBy'] ?? 'unknown');
          if (isParty) {
            const c = charOf(e.source);
            c.died = true;
            c.deathCause = deathCause;
          }
        }
        break;
    }
  }

  const seconds = Math.max(1, fight.durationMs) / 1000;
  if (isParty) {
    for (const c of Object.values(per)) {
      c.dps = c.damageDone / seconds;
      c.hps = c.healingDone / seconds;
    }
  }
  return {
    result: fight.result,
    durationMs: fight.durationMs,
    dps: damageDone / seconds,
    damageDone,
    damageTaken,
    healingDone,
    mistakes,
    ...(deathCause !== undefined ? { deathCause } : {}),
    ...(isParty ? { perCharacter: per } : {}),
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
  const { boss } = setup;
  // Solo or party, uniformly: a list of (character, stance) pairs.
  const members = setup.party
    ? setup.party.map((m, i) => ({
        id: m.character.id ?? `p${i + 1}`,
        def: m.character,
        stance: m.stance,
      }))
    : [{ id: PLAYER_ID, def: setup.player!, stance: setup.stance! }];
  const playerIds = playerIdsOf(fight.events);

  // Consumable usage: passives are the t=0 consumable-flagged buffs; actives
  // are heals cast by the abilities tagged 'consumable' (the pull-deduction
  // rule, GDD §3 — the stream is the source of truth).
  const consumableIds = new Set(
    members.flatMap((m) =>
      m.def.abilities.filter((a) => a.tags.includes('consumable')).map((a) => a.id),
    ),
  );
  const consumablesUsed: Record<string, number> = {};
  /** `${charId}:${abilityId}` → last use time (per-character potion notes). */
  const lastUseAtMs = new Map<string, number>();
  for (const e of fight.events) {
    if (e.type === 'buffApplied' && e.meta?.['consumable'] === true) {
      const id = String(e.meta['buffId']);
      consumablesUsed[id] = (consumablesUsed[id] ?? 0) + 1;
    } else if (e.type === 'heal' && playerIds.has(e.source)) {
      const id = String(e.meta?.['abilityId'] ?? '');
      if (consumableIds.has(id)) {
        consumablesUsed[id] = (consumablesUsed[id] ?? 0) + 1;
        lastUseAtMs.set(`${e.source}:${id}`, e.t);
      }
    }
  }

  if (fight.result === 'kill') return { summary, consumablesUsed, wipe: null };

  const wipe: WipeAnalysis = { kind: fight.result, atMs: fight.durationMs };
  if (fight.result === 'playerDeath' || summary.deathCause !== undefined) {
    if (summary.deathCause !== undefined) wipe.killedBy = summary.deathCause;
    // The potion note explains the LAST death (solo: the death) from that
    // character's own potion and threshold.
    let lastDeadId = PLAYER_ID;
    for (const e of fight.events) {
      if (e.type === 'death' && playerIds.has(e.source)) lastDeadId = e.source;
    }
    const dead = members.find((m) => m.id === lastDeadId) ?? members[0]!;
    const potion = dead.def.abilities.find((a) => a.tags.includes('consumable'));
    const uses = potion ? consumablesUsed[potion.id] ?? 0 : 0;
    const lastPotionAtMs = potion ? lastUseAtMs.get(`${dead.id}:${potion.id}`) ?? -Infinity : -Infinity;
    wipe.potionNote = !potion
      ? 'no-potion-equipped'
      : dead.stance.potionThresholdPct === 0
        ? 'potion-disabled'
        : uses >= (potion.chargesPerFight ?? Infinity)
          ? 'out-of-charges'
          : fight.durationMs - lastPotionAtMs < potion.cooldownMs
            ? 'on-cooldown'
            : 'too-fast';
  }
  if ((fight.result === 'enrage' || fight.result === 'timeout') && boss) {
    const bossDamage = fight.events
      .filter((e) => e.type === 'damage' && playerIds.has(e.source) && e.target === 'boss')
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
