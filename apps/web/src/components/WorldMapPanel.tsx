import { levelForXp } from '@rpg/engine';
import { useEffect } from 'react';
import { useStore } from '../store';
import { MULTIPLIER_PRESETS, REGIONS, buildHash } from '../world/tasks';
import { QueueStrip } from './QueueStrip';
import { RegionCard } from './RegionCard';

export function WorldMapPanel() {
  const xp = useStore((s) => s.xp);
  const gear = useStore((s) => s.gear);
  const stance = useStore((s) => s.stance);
  const behavior = useStore((s) => s.behavior);
  const region = useStore((s) => s.region);
  const multiplier = useStore((s) => s.multiplier);
  const setMultiplier = useStore((s) => s.setMultiplier);
  const requestGrindRates = useStore((s) => s.requestGrindRates);

  const level = levelForXp(xp);
  const build = buildHash(gear, stance, behavior);

  // Warm the per-zone rate cache for the current build (deduped in the store).
  useEffect(() => {
    for (const r of REGIONS) requestGrindRates(r.id);
  }, [level, build, requestGrindRates]);

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
    </section>
  );
}
