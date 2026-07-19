import { CLASSES, useStore } from '../store';
import { nextRosterMilestone, rosterSlots } from '../world/roster';
import type { ClassId } from '../world/types';

const CLASS_ORDER: ClassId[] = ['warrior', 'priest', 'mage'];

/**
 * Roster capacity: how many slots are earned, how many are free, and what
 * unlocks the next one (GDD §2 — milestones, never purchase).
 *
 * Filling a slot is a separate, deliberate choice of CLASS: the raid comp rule
 * wants 2 tanks / 3 healers / 5 dps, and no auto-grant could know how the
 * player intends to get there.
 */
export function RecruitBar() {
  const unlocks = useStore((s) => s.unlocks);
  const dungeonCleared = useStore((s) => s.dungeonCleared);
  const rosterOrder = useStore((s) => s.rosterOrder);
  const recruit = useStore((s) => s.recruit);

  // Hidden until the roster itself exists (the phase-4 Cinder Maw gate).
  if (!unlocks.cinderMawKilled) return null;

  const progress = { unlocks, dungeonCleared };
  const slots = rosterSlots(progress);
  const free = Math.max(0, slots - rosterOrder.length);
  const next = nextRosterMilestone(progress);

  return (
    <div className="recruit-bar">
      <div className="preset-row">
        <h3>Roster</h3>
        <span className="chip">
          {rosterOrder.length} / {slots} slots
        </span>
      </div>

      {free > 0 ? (
        <>
          <p className="muted">
            {free === 1 ? 'A slot is open' : `${free} slots are open`} — choose who joins.
            Cinderforge fields 10, so keep the comp in mind.
          </p>
          <div className="segmented">
            {CLASS_ORDER.map((id) => (
              <button
                key={id}
                className="btn btn-small"
                onClick={() => recruit(id)}
                title={`Recruit a ${CLASSES[id].label} (${CLASSES[id].role})`}
              >
                + {CLASSES[id].label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted">
          {next ? `Next slot: ${next.label} (→ ${next.slots})` : 'Every roster slot is filled.'}
        </p>
      )}
    </div>
  );
}
