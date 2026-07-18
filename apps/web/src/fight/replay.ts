import {
  BOSS_ID,
  CONSUMABLES_BY_ID,
  PLAYER_ID,
  type BossDefinition,
  type CharacterDef,
  type CombatEvent,
  type MobPackDefinition,
} from '@rpg/engine';

/**
 * Presentation layer = pure consumer of the event stream (GDD §3).
 * Reconstructs bars/buffs/casts at any time t from events alone — the
 * proof that replays and richer views later need nothing more.
 * Party-generalized (phase 4): any number of players (ids must match the
 * stream — solo streams use PLAYER_ID), boss or pack enemies.
 */

export interface ActorView {
  id: string;
  name: string;
  side: 'players' | 'enemies';
  role?: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  buffs: string[];
  casting: { abilityId: string; startT: number; durationMs: number } | null;
}

export interface ViewState {
  t: number;
  actors: ActorView[];
  damageDone: number;
  dps: number;
  moving: boolean;
  enraged: boolean;
  phase: number;
  ended: string | null;
}

export interface LogLine {
  t: number;
  text: string;
  cls: 'dealt' | 'taken' | 'heal' | 'mistake' | 'system' | 'buff';
}

export interface ReplayConfig {
  /** In fight order; ids must match the stream (solo: [{...def, id: PLAYER_ID}]). */
  players: CharacterDef[];
  boss?: BossDefinition;
  pack?: MobPackDefinition;
}

export class Replay {
  private idx = 0;
  private actors = new Map<string, ActorView>();
  private damageDone = 0;
  private moving = false;
  private enraged = false;
  private phase = 1;
  private ended: string | null = null;
  private lastT = -1;
  private castTimes: Record<string, number>;
  private playerIds: Set<string>;

  constructor(
    private events: readonly CombatEvent[],
    private cfg: ReplayConfig,
  ) {
    this.castTimes = Object.fromEntries(
      cfg.players.flatMap((p) => p.abilities.map((a) => [a.id, a.castTimeMs])),
    );
    this.playerIds = new Set(cfg.players.map((p) => p.id ?? PLAYER_ID));
    this.reset();
  }

  private reset(): void {
    this.idx = 0;
    this.damageDone = 0;
    this.moving = false;
    this.enraged = false;
    this.phase = 1;
    this.ended = null;
    this.actors = new Map();
    for (const p of this.cfg.players) {
      const id = p.id ?? PLAYER_ID;
      this.actors.set(id, {
        id,
        name: p.name,
        side: 'players',
        ...(p.role ? { role: p.role } : {}),
        hp: p.stats.maxHp,
        maxHp: p.stats.maxHp,
        alive: true,
        buffs: [],
        casting: null,
      });
    }
    if (this.cfg.boss) {
      this.actors.set(BOSS_ID, {
        id: BOSS_ID,
        name: this.cfg.boss.name,
        side: 'enemies',
        hp: this.cfg.boss.hp,
        maxHp: this.cfg.boss.hp,
        alive: true,
        buffs: [],
        casting: null,
      });
    }
    for (const mob of this.cfg.pack?.mobs ?? []) {
      this.actors.set(mob.id, {
        id: mob.id,
        name: mob.name,
        side: 'enemies',
        hp: mob.hp,
        maxHp: mob.hp,
        alive: true,
        buffs: [],
        casting: null,
      });
    }
  }

  seek(t: number): ViewState {
    if (t < this.lastT) this.reset();
    this.lastT = t;
    while (this.idx < this.events.length && this.events[this.idx]!.t <= t) {
      this.apply(this.events[this.idx]!);
      this.idx++;
    }
    return {
      t,
      actors: [...this.actors.values()].map((a) => ({ ...a, buffs: [...a.buffs] })),
      damageDone: this.damageDone,
      dps: t > 0 ? this.damageDone / (t / 1000) : 0,
      moving: this.moving,
      enraged: this.enraged,
      phase: this.phase,
      ended: this.ended,
    };
  }

  private apply(e: CombatEvent): void {
    const src = this.actors.get(e.source);
    const tgt = e.target ? this.actors.get(e.target) : undefined;
    switch (e.type) {
      case 'join':
        // Roster is prebuilt from cfg; joins carry no extra state.
        break;
      case 'damage':
        if (tgt) {
          tgt.hp = Math.max(0, tgt.hp - (e.value ?? 0));
        }
        if (this.playerIds.has(e.source)) this.damageDone += e.value ?? 0;
        break;
      case 'heal':
        if (tgt) tgt.hp = Math.min(tgt.maxHp, tgt.hp + (e.value ?? 0));
        break;
      case 'castStart':
        if (src) {
          const abilityId = String(e.meta?.['abilityId'] ?? '');
          src.casting = { abilityId, startT: e.t, durationMs: this.castTimes[abilityId] ?? 0 };
        }
        break;
      case 'castEnd':
        if (src) src.casting = null;
        break;
      case 'buffApplied': {
        const buffId = String(e.meta?.['buffId'] ?? '');
        if (tgt && !tgt.buffs.includes(buffId)) tgt.buffs.push(buffId);
        break;
      }
      case 'buffExpired': {
        const buffId = String(e.meta?.['buffId'] ?? '');
        if (tgt) tgt.buffs = tgt.buffs.filter((b) => b !== buffId);
        break;
      }
      case 'addSpawn': {
        if (this.actors.has(e.source)) break; // pack mobs are prebuilt
        const hp = this.cfg.boss?.addPhase.add.hp ?? 1;
        this.actors.set(e.source, {
          id: e.source,
          name: String(e.meta?.['name'] ?? 'Add'),
          side: 'enemies',
          hp,
          maxHp: hp,
          alive: true,
          buffs: [],
          casting: null,
        });
        break;
      }
      case 'death':
        if (src) {
          src.alive = false;
          src.hp = 0;
        }
        break;
      case 'movementStart':
        this.moving = true;
        break;
      case 'movementEnd':
        this.moving = false;
        break;
      case 'phaseChange':
        this.phase = Number(e.meta?.['phase'] ?? this.phase);
        break;
      case 'enrage':
        this.enraged = true;
        break;
      case 'fightEnd':
        this.ended = String(e.meta?.['result'] ?? 'unknown');
        break;
      case 'mistake':
        break;
    }
  }
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Precompute human-readable log lines for the whole stream. */
export function buildLog(events: readonly CombatEvent[], cfg: ReplayConfig): LogLine[] {
  const names: Record<string, string> = { melee: 'Melee', 'lava-surge': 'Lava Surge' };
  for (const [id, c] of Object.entries(CONSUMABLES_BY_ID)) names[id] = c.name;
  for (const p of cfg.players) for (const a of p.abilities) names[a.id] = a.name;
  for (const t of cfg.boss?.timeline ?? []) names[t.id] = t.name;
  const abilityName = (e: CombatEvent) => names[String(e.meta?.['abilityId'] ?? '')] ?? 'Attack';

  const playerIds = new Set(cfg.players.map((p) => p.id ?? PLAYER_ID));
  const actorNames: Record<string, string> = {};
  for (const p of cfg.players) actorNames[p.id ?? PLAYER_ID] = p.name;
  if (cfg.boss) actorNames[BOSS_ID] = cfg.boss.name;
  for (const mob of cfg.pack?.mobs ?? []) actorNames[mob.id] = mob.name;
  const actorName = (id: string | undefined) =>
    (id !== undefined && actorNames[id]) || cfg.boss?.addPhase.add.name || 'Add';

  const lines: LogLine[] = [];
  const push = (t: number, text: string, cls: LogLine['cls']) => lines.push({ t, text, cls });

  for (const e of events) {
    switch (e.type) {
      case 'addSpawn':
        actorNames[e.source] = String(e.meta?.['name'] ?? actorName(e.source));
        push(e.t, `${actorNames[e.source]} joins the fight`, 'system');
        break;
      case 'damage': {
        const crit = e.meta?.['crit'] === true ? ' (crit!)' : '';
        if (playerIds.has(e.source)) {
          push(e.t, `${actorName(e.source)}'s ${abilityName(e)} hits ${actorName(e.target)} for ${e.value}${crit}`, 'dealt');
        } else {
          const absorbed = Number(e.meta?.['absorbed'] ?? 0);
          const suffix = absorbed > 0 ? ` (${absorbed} absorbed)` : '';
          push(e.t, `${actorName(e.source)}'s ${abilityName(e)} hits ${actorName(e.target)} for ${e.value}${suffix}`, 'taken');
        }
        break;
      }
      case 'heal': {
        const toOther = e.target !== undefined && e.target !== e.source;
        push(
          e.t,
          `${abilityName(e)} restores ${e.value} HP${toOther ? ` to ${actorName(e.target)}` : ''}`,
          'heal',
        );
        break;
      }
      case 'mistake': {
        const kind = String(e.meta?.['kind']);
        const who = actorName(e.source);
        const text =
          kind === 'stayed-in-fire'
            ? `${who} stands in the fire!`
            : kind === 'wrong-ability'
              ? `${who} mistake: cast ${names[String(e.meta?.['chose'])] ?? '?'} instead of ${names[String(e.meta?.['insteadOf'])] ?? '?'}`
              : kind === 'hesitation'
                ? `${who} hesitates for ${((Number(e.meta?.['delayMs']) || 0) / 1000).toFixed(1)}s`
                : `${who} fumbles for the potion (+${((Number(e.meta?.['delayMs']) || 0) / 1000).toFixed(1)}s)`;
        push(e.t, text, 'mistake');
        break;
      }
      case 'buffApplied':
        if (e.meta?.['buffId'] === 'tantrum') {
          push(e.t, `${actorName(BOSS_ID)} flies into a TANTRUM — adds are overdue!`, 'mistake');
        } else if (e.meta?.['consumable'] !== true || e.t > 0) {
          push(e.t, `${actorName(e.target)} gains ${names[String(e.meta?.['buffId'])] ?? e.meta?.['buffId']}`, 'buff');
        } else {
          push(e.t, `${actorName(e.target)} is fortified by ${names[String(e.meta?.['buffId'])] ?? e.meta?.['buffId']}`, 'buff');
        }
        break;
      case 'buffExpired':
        push(e.t, `${names[String(e.meta?.['buffId'])] ?? e.meta?.['buffId']} fades from ${actorName(e.target)}`, 'buff');
        break;
      case 'phaseChange':
        push(
          e.t,
          `— Phase ${e.meta?.['phase']}${cfg.boss ? `: ${cfg.boss.addPhase.add.name}s emerge!` : ''} —`,
          'system',
        );
        break;
      case 'movementStart':
        push(e.t, `The ground erupts — move out!`, 'system');
        break;
      case 'planAction': {
        const origin = e.meta?.['origin'] === 'call' ? 'CALL' : 'PLAN';
        const kind = String(e.meta?.['kind']);
        const text =
          kind === 'holdDps'
            ? e.meta?.['hold'] === true
              ? 'Stop damage!'
              : 'Push!'
            : kind === 'ability'
              ? `${actorName(String(e.meta?.['charId']))}: ${names[String(e.meta?.['abilityId'])] ?? e.meta?.['abilityId']}!`
              : `${actorName(String(e.meta?.['charId']))}: switch stance!`;
        push(e.t, `${origin} — ${text}`, 'system');
        break;
      }
      case 'death':
        push(e.t, `${actorName(e.source)} dies`, playerIds.has(e.source) ? 'mistake' : 'system');
        break;
      case 'enrage':
        push(e.t, `${actorName(BOSS_ID)} ENRAGES!`, 'mistake');
        break;
      case 'fightEnd': {
        const r = String(e.meta?.['result']);
        push(
          e.t,
          r === 'kill'
            ? `Victory at ${mmss(e.t)}`
            : `Wipe (${r}) at ${mmss(e.t)}`,
          'system',
        );
        break;
      }
    }
  }
  return lines;
}

export { mmss };
