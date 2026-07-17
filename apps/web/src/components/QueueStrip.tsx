import { useStore } from '../store';
import { REGIONS } from '../world/tasks';
import type { Task } from '../world/types';

const regionName = (id: string): string => REGIONS.find((r) => r.id === id)?.name ?? id;

function taskLabel(t: Task): string {
  switch (t.kind) {
    case 'travel':
      return `Travel → ${regionName(t.to)}`;
    case 'grind':
      return `Grind ${regionName(t.zone)}`;
    case 'gather':
      return `Gather timber (${regionName(t.zone)})`;
  }
}

export function QueueStrip() {
  const queue = useStore((s) => s.queue);
  const cancelTask = useStore((s) => s.cancelTask);

  return (
    <div className="queue-strip">
      <h3>Task queue</h3>
      {queue.length === 0 && <p className="muted">Idle — send Elara somewhere.</p>}
      {queue.map((t, i) => {
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
