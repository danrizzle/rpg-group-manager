import { CONSUMABLES_BY_ID, enrageMechanic, PLAYER_ID, type PlanAction, type PotionNote } from '@rpg/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildLog, mmss, Replay, type ActorView } from '../fight/replay';
import { useStore, type AttemptSummary, type FightState } from '../store';
import type { BossId } from '../world/types';
import {
  CALL_CATEGORY_LABEL,
  CALL_CATEGORY_ORDER,
  LIVE_CALLS,
  type PartyLike,
} from './callCatalog';

const BUFF_NAMES: Record<string, string> = {
  combustion: 'Combustion',
  'ice-barrier': 'Ice Barrier',
  tantrum: 'Tantrum',
  pyroclasm: 'Pyroclasm',
  'flask-of-embers': 'Flask of Embers',
  'fire-ward-potion': 'Fire Ward',
  'battle-shout': 'Battle Shout',
  'shield-wall': 'Shield Wall',
};

const POTION_NOTES: Record<PotionNote, string> = {
  'no-potion-equipped': 'no healing potion equipped',
  'potion-disabled': 'potion threshold set to never',
  'out-of-charges': 'potion charges spent',
  'on-cooldown': 'potion on cooldown',
  'too-fast': 'potion ready, but death outran the reaction',
};

const cause = (id: string): string => id.replace(/-/g, ' ');

/** Human label for one adopted/logged call action (mirrors PlanPanel). */
function callLabel(a: PlanAction, party: PartyLike): string {
  if (a.kind === 'holdDps') return a.hold ? 'Stop damage!' : 'Push!';
  if (a.kind === 'retreat') return 'Retreat!';
  if (a.kind === 'stance') {
    const who = nameOf(a.charId, party);
    const t = a.patch.targeting;
    return t === 1 ? `${who} → Cleave` : t === 0 ? `${who} → Focus` : `${who}: stance`;
  }
  // Name the ability from the actual kit — a 10-man has several of each class,
  // so a per-class lookup would mislabel most of them.
  const member = party.find((m) => (m.character.id ?? 'player') === a.charId);
  const ability = member?.character.abilities.find((ab) => ab.id === a.abilityId);
  return ability ? `${member!.character.name}: ${ability.name}` : a.abilityId;
}

/** Tanks first: during a swap those are the bars you're watching. */
const ROLE_ORDER = ['tank', 'healer', 'dps'] as const;

/** A fighter's role, from the party defs (the replay actors don't carry it). */
function roleOf(id: string, party?: { character: { id?: string; role?: string } }[]): string {
  return party?.find((m) => (m.character.id ?? 'player') === id)?.character.role ?? 'dps';
}

/** Display name for a char id, from the party that is actually fighting. */
function nameOf(charId: string, party: PartyLike): string {
  return party.find((m) => (m.character.id ?? 'player') === charId)?.character.name ?? charId;
}

/** Signed m:ss delta vs a reference kill time. */
const delta = (ms: number, ref: number): string => {
  const d = ms - ref;
  return `${d <= 0 ? '−' : '+'}${mmss(Math.abs(d))}`;
};

const vsText = (label: string, ref: AttemptSummary | undefined, durationMs: number): string | null => {
  if (!ref) return null;
  if (ref.result !== 'kill') return `${label}: wipe (${cause(ref.result)})`;
  return `${label}: ${mmss(ref.durationMs)} (${delta(durationMs, ref.durationMs)})`;
};

/** GDD §3 post-fight review: outcome, comparison, consumables, wipe line. */
function PostFightReview({ fight }: { fight: FightState }) {
  const { review, compare, result } = fight;
  const kill = result.result === 'kill';
  const newBest =
    kill && (compare.best === undefined || result.durationMs < compare.best.durationMs);

  const used = Object.entries(review.consumablesUsed).map(([id, n]) =>
    `${n > 1 ? `${n}× ` : ''}${CONSUMABLES_BY_ID[id]?.name ?? id}`,
  );

  // Who the wipe line is about: the last player-side death in the stream.
  const names: Record<string, string> = {};
  for (const p of fight.party ?? []) names[p.id ?? PLAYER_ID] = p.name;
  if (fight.player) names[PLAYER_ID] = fight.player.name;
  let lastDead: string | undefined;
  for (const e of result.events) {
    if (e.type === 'death' && names[e.source]) lastDead = names[e.source];
  }
  const wipeLine = review.wipe
    ? review.wipe.killedBy !== undefined
      ? `${mmss(review.wipe.atMs)}: ${cause(review.wipe.killedBy)} killed ${lastDead ?? 'the party'} — ${
          review.wipe.potionNote ? POTION_NOTES[review.wipe.potionNote] : ''
        }`
      : `${cause(review.wipe.kind)} at ${mmss(review.wipe.atMs)}${
          review.wipe.bossHpPctLeft !== undefined
            ? ` with the boss at ${review.wipe.bossHpPctLeft.toFixed(0)}%`
            : ''
        }`
    : null;

  const per = review.summary.perCharacter;

  return (
    <div className="review-block">
      <div className="statline">
        {Math.round(review.summary.dps)} DPS · {mmss(result.durationMs)}
        {newBest && <span className="chip chip-warn"> new best</span>}
        {kill && !newBest && vsText('best', compare.best, result.durationMs) && (
          <span className="muted"> · {vsText('best', compare.best, result.durationMs)}</span>
        )}
        {kill && vsText('last', compare.last, result.durationMs) && (
          <span className="muted"> · {vsText('last', compare.last, result.durationMs)}</span>
        )}
      </div>
      {per && (
        <div className="statline muted">
          {Object.values(per)
            .map(
              (c) =>
                `${c.name}: ${Math.round(c.dps)} dps${c.healingDone > 0 ? ` / ${Math.round(c.hps)} hps` : ''}${c.died ? ' †' : ''}`,
            )
            .join(' · ')}
        </div>
      )}
      {wipeLine && <div className="statline log-loss">{wipeLine}</div>}
      <div className="statline muted">
        Used: {used.length ? used.join(', ') : 'no consumables'}
      </div>
      {fight.live && fight.calls.length > 0 && <CallsAdoption fight={fight} />}
    </div>
  );
}

/** GDD §3 ground rule 2: active play writes your plan — adopt the calls you
 *  made (bossCast-anchored where a discovered cast preceded them, else time). */
function CallsAdoption({ fight }: { fight: FightState }) {
  const adoptCall = useStore((s) => s.adoptCall);
  const [adopted, setAdopted] = useState<Set<number>>(new Set());
  const adopt = (i: number, action: PlanAction, atMs: number) => {
    adoptCall(action, atMs);
    setAdopted((s) => new Set(s).add(i));
  };
  const adoptAll = () =>
    fight.calls.forEach((c, i) => {
      if (!adopted.has(i)) adoptCall(c.action, c.atMs);
    });
  return (
    <div className="calls-review">
      <div className="statline">
        Calls made
        <button className="btn btn-small" onClick={adoptAll} disabled={adopted.size === fight.calls.length}>
          Adopt all into plan
        </button>
      </div>
      {fight.calls.map((c, i) => (
        <div key={i} className="statline muted">
          {mmss(c.atMs)} — {callLabel(c.action, fight.partyMembers ?? [])}{' '}
          {adopted.has(i) ? (
            <span className="chip">adopted ✓</span>
          ) : (
            <button className="btn btn-small" onClick={() => adopt(i, c.action, c.atMs)}>
              Adopt
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function HpBar({ actor, big }: { actor: ActorView; big?: boolean }) {
  const pct = (actor.hp / actor.maxHp) * 100;
  return (
    <div className={`frame ${big ? 'frame-big' : ''} ${actor.alive ? '' : 'frame-dead'}`}>
      <div className="frame-head">
        <span className="frame-name">
          {actor.name}
          {actor.role ? <span className="muted"> · {actor.role}</span> : null}
        </span>
        <span className="frame-buffs">
          {actor.buffs.map((b) => (
            <span key={b} className={`chip ${b === 'tantrum' ? 'chip-warn' : ''}`}>
              {BUFF_NAMES[b] ?? b}
            </span>
          ))}
        </span>
        <span className="frame-hp">
          {actor.alive ? `${Math.round(pct)}%` : 'DEAD'}
        </span>
      </div>
      <div className="bar">
        <div
          className={`bar-fill ${actor.side === 'players' ? 'bar-player' : 'bar-enemy'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CastBar({ actor, playT }: { actor: ActorView; playT: number }) {
  if (!actor.casting || actor.casting.durationMs <= 0) return null;
  return (
    <div className="castbar">
      <div
        className="castbar-fill"
        style={{
          width: `${Math.min(100, ((playT - actor.casting.startT) / actor.casting.durationMs) * 100)}%`,
        }}
      />
      <span className="castbar-label">{actor.casting.abilityId}</span>
    </div>
  );
}

export function FightView() {
  const fight = useStore((s) => s.fight);
  const pull = useStore((s) => s.pull);
  const pullEncounter = useStore((s) => s.pullEncounter);
  const playT = useStore((s) => s.playT);
  const frontierMs = useStore((s) => s.frontierMs);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setPlayback = useStore((s) => s.setPlayback);
  const recordBossKill = useStore((s) => s.recordBossKill);
  const recordEncounterCleared = useStore((s) => s.recordEncounterCleared);
  const issueCall = useStore((s) => s.issueCall);
  const finalizeFight = useStore((s) => s.finalizeFight);
  const logRef = useRef<HTMLDivElement>(null);

  const replayCfg = useMemo(() => {
    if (!fight) return null;
    return {
      players: fight.party ?? [{ ...fight.player!, id: PLAYER_ID }],
      ...(fight.boss ? { boss: fight.boss } : {}),
      ...(fight.pack ? { pack: fight.pack } : {}),
    };
  }, [fight]);

  const replay = useMemo(
    () => (fight && replayCfg ? new Replay(fight.result.events, replayCfg) : null),
    [fight, replayCfg],
  );
  const log = useMemo(
    () => (fight && replayCfg ? buildLog(fight.result.events, replayCfg) : []),
    [fight, replayCfg],
  );

  // Playback clock: advance playT with real time × speed.
  useEffect(() => {
    if (!playing || !fight) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      const { playT: t, frontierMs: f } = useStore.getState();
      const next = Math.min(fight.result.durationMs, t + dt);
      // The frontier is the furthest point ever watched — live pulls lock the
      // scrubber and the call palette to it (no scrubbing/calling ahead).
      const frontier = Math.max(f, next);
      setPlayback(
        next >= fight.result.durationMs
          ? { playT: next, frontierMs: frontier, playing: false }
          : { playT: next, frontierMs: frontier },
      );
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, fight, setPlayback]);

  const view = replay?.seek(playT) ?? null;

  // Reaching the natural end resolves the fight. Live (party) pulls defer ALL
  // recording to here so live-call re-runs never double-count (slice 6);
  // finalizeFight is idempotent (guarded on fight.finalized) and unlocks the
  // next encounter on a kill. Solo pulls keep the legacy eager path.
  useEffect(() => {
    if (!view?.ended || !fight) return;
    if (fight.live) {
      finalizeFight();
      return;
    }
    if (view.ended !== 'kill') return;
    if (fight.encounterId) recordEncounterCleared(fight.encounterId);
    else recordBossKill(fight.bossId as BossId);
  }, [view?.ended, fight, recordBossKill, recordEncounterCleared, finalizeFight]);

  const visibleLog = useMemo(() => {
    const upTo = log.filter((l) => l.t <= playT);
    return upTo.slice(-100);
  }, [log, playT]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [visibleLog.length]);

  if (!fight || !view) {
    return (
      <section className="panel fight-panel">
        <h2>Real Fight</h2>
        <p className="muted">
          One rolled run — same setup, different outcome every pull. Costs time and the consumables
          you bring; the training dummy on the right is free.
        </p>
        <button className="btn btn-primary" onClick={() => pull()}>
          Pull Cinder Maw
        </button>
      </section>
    );
  }

  const title = fight.boss?.name ?? fight.pack?.name ?? 'Fight';
  const players = view.actors.filter((a) => a.side === 'players');
  const enemies = view.actors.filter((a) => a.side === 'enemies');
  const boss = fight.boss ? enemies.find((a) => a.id === 'boss') : undefined;
  const otherEnemies = enemies.filter((a) => a !== boss && (a.alive || a.hp > 0));
  const livingOthers = enemies.filter((a) => a !== boss && a.alive);
  const enrageIn = fight.boss ? (enrageMechanic(fight.boss)?.atMs ?? 0) - playT : 0;

  // Live pulls (party): the scrubber and call palette are locked to the
  // frontier until the fight resolves once; then it's a normal replay.
  const resolved = !fight.live || frontierMs >= fight.result.durationMs;
  const scrubMax = resolved ? fight.result.durationMs : frontierMs;
  // Calls fire at the live edge only — a rewound view can't rewrite watched events.
  const atLiveEdge = !!fight.live && !resolved && Math.abs(frontierMs - playT) < 200;
  const lastHold = [...fight.calls].reverse().find((c) => c.action.kind === 'holdDps');
  const isHolding = lastHold?.action.kind === 'holdDps' ? lastHold.action.hold : false;
  // Roster-derived call palette (comp/talent CDs appear automatically).
  const party = (fight.partyMembers ?? []) as PartyLike;

  return (
    <section className="panel fight-panel">
      <div className="fight-header">
        <h2>{title}</h2>
        <span className="muted">seed {fight.seed}</span>
        <button
          className="btn"
          onClick={() => (fight.encounterId ? pullEncounter(fight.encounterId) : pull(fight.bossId))}
        >
          Pull again
        </button>
      </div>

      <div className="fight-status">
        <span className="time">{mmss(playT)}</span>
        {fight.boss && (
          <span className={`chip ${view.enraged ? 'chip-danger' : ''}`}>
            {view.enraged ? 'ENRAGED' : `enrage in ${mmss(Math.max(0, enrageIn))}`}
          </span>
        )}
        {fight.boss && <span className="chip">phase {view.phase}</span>}
        {view.moving && <span className="chip chip-warn">moving</span>}
        <span className="dps">DPS {Math.round(view.dps)}</span>
      </div>

      {boss && <HpBar actor={boss} big />}
      {fight.boss
        ? livingOthers.length > 0 && (
            <div className="adds">{livingOthers.map((a) => <HpBar key={a.id} actor={a} />)}</div>
          )
        : otherEnemies.length > 0 && (
            <div className="adds">{otherEnemies.map((a) => <HpBar key={a.id} actor={a} />)}</div>
          )}

      <div className="spacer" />
      {/*
        At raid size a flat list of 10 frames pushes the combat log off-screen,
        and an unsorted one makes the tanks (the bars that matter during a swap)
        hard to find. Group by role and go two-column; the trinity is unaffected.
      */}
      {players.length > 5 ? (
        <div className="raid-frames">
          {ROLE_ORDER.map((role) => {
            const group = players.filter((p) => roleOf(p.id, fight.partyMembers) === role);
            if (group.length === 0) return null;
            return (
              <div key={role} className="raid-group">
                <div className="raid-group-label muted">{role}</div>
                <div className="raid-group-frames">
                  {group.map((p) => (
                    <div key={p.id} className="raid-frame">
                      <HpBar actor={p} />
                      <CastBar actor={p} playT={playT} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        players.map((p) => (
          <div key={p.id}>
            <HpBar actor={p} big={players.length === 1} />
            <CastBar actor={p} playT={playT} />
          </div>
        ))
      )}

      {view.ended && (
        <>
          <div className={`banner ${view.ended === 'kill' ? 'banner-win' : 'banner-loss'}`}>
            {view.ended === 'kill'
              ? `VICTORY — ${mmss(fight.result.durationMs)}`
              : view.ended === 'retreat'
                ? `RETREAT — ${mmss(fight.result.durationMs)}`
                : `WIPE — ${view.ended}`}
          </div>
          <PostFightReview fight={fight} />
        </>
      )}

      {fight.live && !resolved && (
        <div className="call-palette">
          {CALL_CATEGORY_ORDER.map((cat) => {
            const calls = LIVE_CALLS.filter((c) => c.category === cat);
            const isMeta = cat === 'meta';
            // Meta's only call is the stateful hold-DPS toggle, rendered below.
            if (calls.length === 0 && !isMeta) return null;
            return (
              <div key={cat} className="call-group">
                <div className="call-group-label muted">{CALL_CATEGORY_LABEL[cat]}</div>
                <div className="call-group-btns">
                  {calls.map((call) => {
                    const actions = call.derive(party);
                    // Retreat aborts the attempt — confirm before throwing the run away.
                    const fire =
                      call.id === 'retreat'
                        ? () => {
                            if (window.confirm('Retreat — end the attempt now? The party lives and keeps journal progress.'))
                              issueCall(actions);
                          }
                        : () => issueCall(actions);
                    return (
                      <button
                        key={call.id}
                        className="btn btn-small"
                        disabled={!atLiveEdge || actions.length === 0}
                        onClick={fire}
                      >
                        {call.label}
                      </button>
                    );
                  })}
                  {isMeta && (
                    <button
                      className="btn btn-small"
                      disabled={!atLiveEdge}
                      onClick={() => issueCall([{ kind: 'holdDps', hold: !isHolding }])}
                    >
                      {isHolding ? 'Push!' : 'Stop damage!'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <span className="muted call-hint">
            {atLiveEdge ? 'Call at the live moment.' : 'Pause at the frontier to call.'}
          </span>
        </div>
      )}

      <div className="playback">
        <button className="btn" onClick={() => setPlayback({ playing: !playing })}>
          {playing ? 'Pause' : 'Play'}
        </button>
        {[1, 2, 4, 16].map((s) => (
          <button key={s} className={`btn btn-small ${speed === s ? 'btn-active' : ''}`} onClick={() => setPlayback({ speed: s })}>
            {s}×
          </button>
        ))}
        {resolved && (
          <button className="btn btn-small" onClick={() => setPlayback({ playT: fight.result.durationMs, playing: false })}>
            End
          </button>
        )}
        <input
          className="scrubber"
          type="range"
          min={0}
          max={scrubMax}
          step={100}
          value={Math.min(playT, scrubMax)}
          onChange={(e) => setPlayback({ playT: Number(e.target.value), playing: false })}
        />
      </div>

      <div className="log" ref={logRef}>
        {visibleLog.map((l, i) => (
          <div key={`${l.t}-${i}`} className={`log-line log-${l.cls}`}>
            <span className="log-t">{mmss(l.t)}</span> {l.text}
          </div>
        ))}
      </div>
    </section>
  );
}
