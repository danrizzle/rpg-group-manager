import { useEffect, useMemo, useRef } from 'react';
import { buildLog, mmss, Replay, type ActorView } from '../fight/replay';
import { useStore } from '../store';
import type { BossId } from '../world/types';

const BUFF_NAMES: Record<string, string> = {
  combustion: 'Combustion',
  'ice-barrier': 'Ice Barrier',
  tantrum: 'Tantrum',
  pyroclasm: 'Pyroclasm',
  'flask-of-embers': 'Flask of Embers',
  'fire-ward-potion': 'Fire Ward',
};

function HpBar({ actor, big }: { actor: ActorView; big?: boolean }) {
  const pct = (actor.hp / actor.maxHp) * 100;
  return (
    <div className={`frame ${big ? 'frame-big' : ''} ${actor.alive ? '' : 'frame-dead'}`}>
      <div className="frame-head">
        <span className="frame-name">{actor.name}</span>
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

export function FightView() {
  const fight = useStore((s) => s.fight);
  const pull = useStore((s) => s.pull);
  const playT = useStore((s) => s.playT);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.speed);
  const setPlayback = useStore((s) => s.setPlayback);
  const recordBossKill = useStore((s) => s.recordBossKill);
  const logRef = useRef<HTMLDivElement>(null);

  const replay = useMemo(
    () => (fight ? new Replay(fight.result.events, { player: fight.player, boss: fight.boss }) : null),
    [fight],
  );
  const log = useMemo(
    () => (fight ? buildLog(fight.result.events, { player: fight.player, boss: fight.boss }) : []),
    [fight],
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

  // A zone boss unlocks the next region once its kill has been watched to the end.
  useEffect(() => {
    if (view?.ended === 'kill' && fight) recordBossKill(fight.bossId as BossId);
  }, [view?.ended, fight, recordBossKill]);

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

  const boss = view.actors.find((a) => a.id === 'boss')!;
  const player = view.actors.find((a) => a.id === 'player')!;
  const livingAdds = view.actors.filter((a) => a.id.startsWith('add-') && a.alive);
  const enrageIn = fight.boss.enrageAtMs - playT;

  return (
    <section className="panel fight-panel">
      <div className="fight-header">
        <h2>{fight.boss.name}</h2>
        <span className="muted">seed {fight.seed}</span>
        <button className="btn" onClick={() => pull(fight.bossId)}>
          Pull again
        </button>
      </div>

      <div className="fight-status">
        <span className="time">{mmss(playT)}</span>
        <span className={`chip ${view.enraged ? 'chip-danger' : ''}`}>
          {view.enraged ? 'ENRAGED' : `enrage in ${mmss(Math.max(0, enrageIn))}`}
        </span>
        <span className="chip">phase {view.phase}</span>
        {view.moving && <span className="chip chip-warn">moving</span>}
        <span className="dps">DPS {Math.round(view.dps)}</span>
      </div>

      <HpBar actor={boss} big />
      {livingAdds.length > 0 && <div className="adds">{livingAdds.map((a) => <HpBar key={a.id} actor={a} />)}</div>}

      <div className="spacer" />
      <HpBar actor={player} big />
      {player.casting && player.casting.durationMs > 0 && (
        <div className="castbar">
          <div
            className="castbar-fill"
            style={{
              width: `${Math.min(100, ((playT - player.casting.startT) / player.casting.durationMs) * 100)}%`,
            }}
          />
          <span className="castbar-label">{player.casting.abilityId}</span>
        </div>
      )}

      {view.ended && (
        <div className={`banner ${view.ended === 'kill' ? 'banner-win' : 'banner-loss'}`}>
          {view.ended === 'kill' ? `VICTORY — ${mmss(fight.result.durationMs)}` : `WIPE — ${view.ended}`}
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
