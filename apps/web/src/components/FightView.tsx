import { CONSUMABLES_BY_ID, PLAYER_ID, type PotionNote } from '@rpg/engine';
import { useEffect, useMemo, useRef } from 'react';
import { buildLog, mmss, Replay, type ActorView } from '../fight/replay';
import { useStore, type AttemptSummary, type FightState } from '../store';
import type { BossId } from '../world/types';

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
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setPlayback = useStore((s) => s.setPlayback);
  const recordBossKill = useStore((s) => s.recordBossKill);
  const recordEncounterCleared = useStore((s) => s.recordEncounterCleared);
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
      const { playT: t } = useStore.getState();
      const next = Math.min(fight.result.durationMs, t + dt);
      setPlayback(next >= fight.result.durationMs ? { playT: next, playing: false } : { playT: next });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, fight, setPlayback]);

  const view = replay?.seek(playT) ?? null;

  // A watched kill unlocks: zone bosses set region flags, dungeon encounters
  // open the next one in the chain.
  useEffect(() => {
    if (view?.ended !== 'kill' || !fight) return;
    if (fight.encounterId) recordEncounterCleared(fight.encounterId);
    else recordBossKill(fight.bossId as BossId);
  }, [view?.ended, fight, recordBossKill, recordEncounterCleared]);

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
  const enrageIn = fight.boss ? fight.boss.enrageAtMs - playT : 0;

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
      {players.map((p) => (
        <div key={p.id}>
          <HpBar actor={p} big={players.length === 1} />
          <CastBar actor={p} playT={playT} />
        </div>
      ))}

      {view.ended && (
        <>
          <div className={`banner ${view.ended === 'kill' ? 'banner-win' : 'banner-loss'}`}>
            {view.ended === 'kill' ? `VICTORY — ${mmss(fight.result.durationMs)}` : `WIPE — ${view.ended}`}
          </div>
          <PostFightReview fight={fight} />
        </>
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
        <button className="btn btn-small" onClick={() => setPlayback({ playT: fight.result.durationMs, playing: false })}>
          End
        </button>
        <input
          className="scrubber"
          type="range"
          min={0}
          max={fight.result.durationMs}
          step={100}
          value={playT}
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
