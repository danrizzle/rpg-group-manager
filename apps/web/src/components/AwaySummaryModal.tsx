import { useStore } from '../store';
import { REGIONS } from '../world/tasks';
import type { AwayEvent } from '../world/types';

const regionName = (id?: string): string => REGIONS.find((r) => r.id === id)?.name ?? id ?? '';

function line(e: AwayEvent): string {
  switch (e.kind) {
    case 'travel':
      return `Arrived in ${regionName(e.to)}`;
    case 'grind':
      return `Grinded ${regionName(e.zone)}: +${Math.round(e.xpGained ?? 0).toLocaleString()} XP${
        e.estimatedDeaths && e.estimatedDeaths >= 0.5 ? ` (~${Math.round(e.estimatedDeaths)} close calls)` : ''
      }`;
    case 'gather':
      return `Gathered ${Math.round(e.materialGained ?? 0)} timber in ${regionName(e.zone)}`;
  }
}

export function AwaySummaryModal() {
  const summary = useStore((s) => s.awaySummary);
  const dismiss = useStore((s) => s.dismissAwaySummary);
  if (!summary) return null;

  const minutes = Math.round(summary.elapsedGameMs / 60_000);

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>While you were away</h2>
        <p className="muted">{minutes.toLocaleString()} game-minutes elapsed.</p>
        <ul className="away-list">
          {summary.events.map((e, i) => (
            <li key={i}>{line(e)}</li>
          ))}
        </ul>
        <button className="btn btn-primary" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
