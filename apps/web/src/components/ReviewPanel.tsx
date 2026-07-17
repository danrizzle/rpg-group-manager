import { levelForXp } from '@rpg/engine';
import { simIsStale, useStore } from '../store';
import { SIM_TARGETS } from '../sim/bosses';
import { mmss } from '../fight/replay';
import { Histogram } from './Histogram';

const LOSS_LABELS: Record<string, string> = {
  enrage: 'enrage timer',
  playerDeath: 'death',
  timeout: 'timeout',
};

const MISTAKE_LABELS: Record<string, string> = {
  hesitation: 'hesitated',
  'wrong-ability': 'wrong ability',
  'stayed-in-fire': 'stood in fire',
  'slow-potion': 'slow potion',
};

export function ReviewPanel() {
  const sim = useStore((s) => s.sim);
  const runSim = useStore((s) => s.runSim);
  const stance = useStore((s) => s.stance);
  const behavior = useStore((s) => s.behavior);
  const gear = useStore((s) => s.gear);
  const xp = useStore((s) => s.xp);
  const talents = useStore((s) => s.talents);
  const equippedConsumables = useStore((s) => s.equippedConsumables);
  const simTarget = useStore((s) => s.simTarget);
  const setSimTarget = useStore((s) => s.setSimTarget);
  const unlocks = useStore((s) => s.unlocks);
  const stale = simIsStale(
    sim, stance, behavior, gear, levelForXp(xp), talents, equippedConsumables, simTarget,
  );
  const r = sim.result;

  return (
    <section className="panel">
      <h2>Training Dummy</h2>
      <p className="muted">Free, instant, unlimited — distributions instead of single rolls.</p>
      <div className="control">
        <div className="control-label">Simulate against</div>
        <div className="segmented">
          {SIM_TARGETS.map((t) => {
            // Same reachability as the world map's Challenge buttons.
            const locked = t.id === 'emberwing' && !unlocks.bridgeBuilt;
            return (
              <button
                key={t.id}
                className={`btn btn-small ${simTarget === t.id ? 'btn-active' : ''}`}
                disabled={locked}
                title={locked ? 'Build the Bridge first' : `Simulate vs ${t.name}`}
                onClick={() => setSimTarget(t.id)}
              >
                {t.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="sim-actions">
        {[1000, 5000].map((n) => (
          <button key={n} className="btn btn-primary" disabled={sim.running} onClick={() => runSim(n)}>
            {sim.running ? 'Simulating…' : `Simulate ${n.toLocaleString()}×`}
          </button>
        ))}
      </div>

      {r && (
        <div className={stale ? 'sim-results sim-stale' : 'sim-results'}>
          {stale && <div className="stale-note">sliders changed — re-run to update</div>}

          <div className="hero">
            <div className="hero-number">{(r.killRate * 100).toFixed(1)}%</div>
            <div className="hero-label">
              vs {SIM_TARGETS.find((t) => t.id === r.request.bossId)?.name ?? r.request.bossId} —
              damage check passed in {Math.round(r.killRate * r.iterations).toLocaleString()} of{' '}
              {r.iterations.toLocaleString()} runs
            </div>
          </div>

          {Object.keys(r.lossBreakdown).length > 0 && (
            <div className="loss-row">
              {Object.entries(r.lossBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([kind, count]) => (
                  <span key={kind} className="chip chip-danger">
                    {LOSS_LABELS[kind] ?? kind}: {((count / r.iterations) * 100).toFixed(1)}%
                  </span>
                ))}
            </div>
          )}

          <h3>DPS — {Math.round(r.dps.mean)} ± {Math.round(r.dps.stddev)}</h3>
          <Histogram values={r.dpsValues} mean={r.dps.mean} />

          <dl className="kv">
            {r.timeToKillMs.mean > 0 && (
              <>
                <dt>Time to kill</dt>
                <dd>
                  {mmss(r.timeToKillMs.mean)} ± {Math.round(r.timeToKillMs.stddev / 1000)}s (p10 {mmss(r.timeToKillMs.p10)},
                  p90 {mmss(r.timeToKillMs.p90)})
                </dd>
              </>
            )}
            <dt>Mistakes</dt>
            <dd>
              {r.avgMistakesPerRun.toFixed(1)}/run
              {Object.entries(r.mistakeCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([kind, count]) => ` · ${MISTAKE_LABELS[kind] ?? kind} ${(count / r.iterations).toFixed(1)}`)
                .join('')}
            </dd>
            {Object.keys(r.deathCauses).length > 0 && (
              <>
                <dt>Deaths to</dt>
                <dd>
                  {Object.entries(r.deathCauses)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([cause, count]) => `${cause} (${count})`)
                    .join(', ')}
                </dd>
              </>
            )}
            <dt>Compute</dt>
            <dd>{(r.elapsedMs / 1000).toFixed(1)}s in a worker</dd>
          </dl>
        </div>
      )}
    </section>
  );
}
