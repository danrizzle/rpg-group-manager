import { useEffect } from 'react';
import { useCharBuild, useStore } from '../store';
import { MULTIPLIER_PRESETS, REGIONS, buildHash } from '../world/tasks';
import { DungeonPanel } from './DungeonPanel';
import { QueueStrip } from './QueueStrip';
import { RegionCard } from './RegionCard';

export function WorldMapPanel() {
  const charId = useStore((s) => s.activeWorldChar);
  const b = useCharBuild(charId);
  const region = useStore((s) => s.chars[s.activeWorldChar].region);
  const multiplier = useStore((s) => s.multiplier);
  const setMultiplier = useStore((s) => s.setMultiplier);
  const requestGrindRates = useStore((s) => s.requestGrindRates);

  const build = buildHash(b.gear, b.stance, b.behavior, b.talents);

  // Warm the per-zone rate cache for the ACTING character's build (deduped in
  // the store). Rates are per character now, so switching hero re-warms.
  useEffect(() => {
    for (const r of REGIONS) requestGrindRates(charId, r.id);
  }, [charId, b.level, build, requestGrindRates]);

  return (
    <section className="panel map-panel">
      <div className="fight-header">
        <h2>World Map</h2>
        <span className="muted">in {REGIONS.find((r) => r.id === region)?.name}</span>
      </div>

      <div className="control">
        <div className="control-label">World speed (dev)</div>
        <div className="segmented">
          {MULTIPLIER_PRESETS.map((m) => (
            <button
              key={m.value}
              className={`btn btn-small ${multiplier === m.value ? 'btn-active' : ''}`}
              onClick={() => setMultiplier(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <QueueStrip />

      <div className="region-grid">
        {REGIONS.map((r) => (
          <RegionCard key={r.id} region={r} />
        ))}
      </div>

      <DungeonPanel />

      <p className="muted">Alchemy has moved to your Home Base.</p>
    </section>
  );
}
