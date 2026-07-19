import { useState } from 'react';
import { CLASSES, useCharBuild, useStore } from '../store';
import type { CharId } from '../world/types';

/**
 * Loadouts (GDD §2): save a whole build — stance, talents, gear and consumable
 * slots — under a name and re-apply it later.
 *
 * The library is scoped to the character's CLASS. Applying a mage's set to a
 * warrior would sanitize its gear and talents away to nothing, so those sets
 * are not offered at all rather than offered and quietly ruined. Names are
 * unique per class, so every class can have its own "Raid" and "Farm".
 */
export function LoadoutPanel({ charId }: { charId: CharId }) {
  const { classId, name: charName } = useCharBuild(charId);
  const loadouts = useStore((s) => s.loadouts);
  const saveLoadout = useStore((s) => s.saveLoadout);
  const applyLoadout = useStore((s) => s.applyLoadout);
  const deleteLoadout = useStore((s) => s.deleteLoadout);
  const [name, setName] = useState('');

  const mine = loadouts.filter((l) => l.classId === classId);
  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveLoadout(charId, trimmed);
    setName('');
  };

  return (
    <>
      <div className="preset-row">
        <h3>Loadouts</h3>
        <span className="chip">{CLASSES[classId].label}</span>
      </div>
      <div className="loadout-save">
        <input
          type="text"
          placeholder="Loadout name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
        <button
          className="btn btn-small"
          disabled={!name.trim()}
          onClick={save}
          title={`Save ${charName}'s stance, talents, gear and consumable slots (an existing name is overwritten)`}
        >
          Save
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="muted">
          No {CLASSES[classId].label.toLowerCase()} loadouts yet — save one to reuse it on any{' '}
          {CLASSES[classId].label.toLowerCase()}.
        </p>
      ) : (
        <ul className="loadout-list">
          {mine.map((l) => (
            <li key={l.name} className="loadout-row">
              <span className="loadout-name">{l.name}</span>
              <button className="btn btn-small" onClick={() => applyLoadout(charId, l.name)}>
                Apply
              </button>
              <button className="btn btn-small" onClick={() => deleteLoadout(classId, l.name)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
