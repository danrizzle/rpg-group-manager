import { useStore } from '../store';
import { MATERIAL_LABELS, RECIPES_BY_ID } from '../world/professions';
import { REGIONS } from '../world/tasks';
import { type AwayEvent } from '../world/types';

const regionName = (id?: string): string => REGIONS.find((r) => r.id === id)?.name ?? id ?? '';

/** "Borin: Gathered 40 timber" — who did what, now that queues run in parallel. */
function line(e: AwayEvent, names: Record<string, string>): string {
  const who = e.charId ? `${names[e.charId] ?? e.charId}: ` : '';
  return who + body(e);
}

function body(e: AwayEvent): string {
  switch (e.kind) {
    case 'travel':
      return `Arrived in ${regionName(e.to)}`;
    case 'grind':
      return `Grinded ${regionName(e.zone)}: +${Math.round(e.xpGained ?? 0).toLocaleString()} XP${
        e.estimatedDeaths && e.estimatedDeaths >= 0.5 ? ` (~${Math.round(e.estimatedDeaths)} close calls)` : ''
      }`;
    case 'gather':
      return `Gathered ${Math.round(e.materialGained ?? 0)} ${
        e.material ? MATERIAL_LABELS[e.material] : 'materials'
      } in ${regionName(e.zone)}${lostNote(e.lostToCapacity)}`;
    case 'craft':
      return `Crafted ${e.craftedCount ?? 0}× ${
        RECIPES_BY_ID[e.recipeId ?? '']?.name ?? e.recipeId
      }${lostNote(e.lostToCapacity)}`;
  }
}

const lostNote = (lost?: number): string =>
  lost !== undefined ? ` (bank full — ${Math.round(lost)} lost)` : '';

export function AwaySummaryModal() {
  const summary = useStore((s) => s.awaySummary);
  const dismiss = useStore((s) => s.dismissAwaySummary);
  const characters = useStore((s) => s.characters);
  if (!summary) return null;

  const names = Object.fromEntries(
    Object.entries(characters).map(([id, c]) => [id, c.name]),
  );

  const minutes = Math.round(summary.elapsedGameMs / 60_000);

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>While you were away</h2>
        <p className="muted">{minutes.toLocaleString()} game-minutes elapsed.</p>
        <ul className="away-list">
          {summary.events.map((e, i) => (
            <li key={i}>{line(e, names)}</li>
          ))}
        </ul>
        <button className="btn btn-primary" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
