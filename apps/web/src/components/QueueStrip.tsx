import { useStore } from '../store';
import { MATERIAL_LABELS, RECIPES_BY_ID } from '../world/professions';
import { REGIONS } from '../world/tasks';
import { WORLD_CHARS, WORLD_CHAR_NAMES, type Task, type WorldCharId } from '../world/types';

const regionName = (id: string): string => REGIONS.find((r) => r.id === id)?.name ?? id;

function taskLabel(t: Task): string {
  switch (t.kind) {
    case 'travel':
      return `Travel → ${regionName(t.to)}`;
    case 'grind':
      return `Grind ${regionName(t.zone)}`;
    case 'gather':
      return `Gather ${MATERIAL_LABELS[t.material]} (${regionName(t.zone)})`;
    case 'craft':
      return `Craft ${t.count}× ${RECIPES_BY_ID[t.recipeId]?.name ?? t.recipeId}`;
  }
}

/** One character's lane. Only the head task accrues — that's per queue now. */
function CharQueue({ charId }: { charId: WorldCharId }) {
  const cw = useStore((s) => s.chars[charId]);
  const activeWorldChar = useStore((s) => s.activeWorldChar);
  const setActiveWorldChar = useStore((s) => s.setActiveWorldChar);
  const cancelTask = useStore((s) => s.cancelTask);
  const acting = activeWorldChar === charId;

  return (
    <div className={`queue-lane ${acting ? 'queue-lane-acting' : ''}`}>
      <div className="queue-lane-head">
        <button
          className={`btn btn-small ${acting ? 'btn-active' : ''}`}
          onClick={() => setActiveWorldChar(charId)}
          title={`Send ${WORLD_CHAR_NAMES[charId]} on the next task you pick`}
        >
          {WORLD_CHAR_NAMES[charId]}
        </button>
        <span className="muted">
          in {regionName(cw.region)}
          {cw.queue.length === 0 ? ' · idle' : ` · ${cw.queue.length} queued`}
        </span>
      </div>
      {cw.queue.map((t, i) => {
        const pct = Math.min(100, (t.accruedGameMs / t.durationGameMs) * 100);
        return (
          <div key={t.id} className={`queue-item ${i === 0 ? 'queue-active' : ''}`}>
            <div className="queue-row">
              <span>{i === 0 ? '▶ ' : ''}{taskLabel(t)}</span>
              <button className="btn btn-small" onClick={() => cancelTask(t.id)}>
                ✕
              </button>
            </div>
            <div className="bar">
              <div className="bar-fill bar-task" style={{ width: `${i === 0 ? pct : 0}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Task queues, one lane per character — they run in PARALLEL (GDD §2 division
 * of labor, §5). The recruits' lanes appear once they've been earned.
 */
export function QueueStrip() {
  const hasRoster = useStore((s) => s.unlocks.cinderMawKilled);
  const chars = hasRoster ? WORLD_CHARS : (['mage'] as const);

  return (
    <div className="queue-strip">
      <h3>Task queues</h3>
      {hasRoster && (
        <p className="muted queue-hint">
          Each hero runs their own queue at the same time — pick who acts, then choose a task below.
        </p>
      )}
      {chars.map((id) => (
        <CharQueue key={id} charId={id} />
      ))}
    </div>
  );
}
