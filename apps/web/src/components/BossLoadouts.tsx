import { CLASSES, useStore } from '../store';
import type { CharId } from '../world/types';

/**
 * Per-boss loadout assignment (GDD §2): pick which saved set each raider wears
 * for THIS boss, then equip them all in one click.
 *
 * Deliberately applied on demand rather than silently at pull time. A pull that
 * quietly re-equipped the party would make the character panel lie about what
 * everyone is wearing, and the wipe you'd then debug would be against a build
 * you never saw. This is also what makes the resist-vs-throughput decision
 * (§6) practical at raid scale — ten characters is far too many to re-gear by
 * hand between Ashkar and Vael.
 */
export function BossLoadouts({ encounterId, party }: { encounterId: string; party: CharId[] }) {
  const loadouts = useStore((s) => s.loadouts);
  const characters = useStore((s) => s.characters);
  const bossLoadouts = useStore((s) => s.bossLoadouts);
  const assign = useStore((s) => s.assignBossLoadout);
  const equip = useStore((s) => s.equipForBoss);

  if (loadouts.length === 0) return null;

  const assigned = bossLoadouts[encounterId] ?? {};
  const count = party.filter((id) => assigned[id]).length;

  return (
    <div className="boss-loadouts">
      <div className="preset-row">
        <span className="muted">Loadouts for this boss</span>
        <button
          className="btn btn-small"
          disabled={count === 0}
          onClick={() => equip(encounterId)}
          title={count === 0 ? 'Assign a loadout first' : `Apply ${count} saved set(s)`}
        >
          Equip all ({count})
        </button>
      </div>
      <div className="boss-loadout-grid">
        {party.map((id) => {
          const c = characters[id];
          if (!c) return null;
          const options = loadouts.filter((l) => l.classId === c.classId);
          if (options.length === 0) return null;
          return (
            <label key={id} className="boss-loadout-row">
              <span className="muted">
                {c.name} <span className="chip chip-inline">{CLASSES[c.classId].role}</span>
              </span>
              <select
                value={assigned[id] ?? ''}
                onChange={(e) => assign(encounterId, id, e.target.value)}
              >
                <option value="">— none —</option>
                {options.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
    </div>
  );
}
