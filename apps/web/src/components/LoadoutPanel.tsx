import { useState } from 'react';
import { useStore } from '../store';

/**
 * Loadouts (GDD §2): save the whole build — stance, talents, gear and
 * consumable slots — under a name and re-apply it later.
 */
export function LoadoutPanel() {
  const loadouts = useStore((s) => s.loadouts);
  const saveLoadout = useStore((s) => s.saveLoadout);
  const applyLoadout = useStore((s) => s.applyLoadout);
  const deleteLoadout = useStore((s) => s.deleteLoadout);
  const [name, setName] = useState('');

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    saveLoadout(trimmed);
    setName('');
  };

  return (
    <>
      <h3>Loadouts</h3>
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
          title="Save the current stance, talents, gear and consumable slots (an existing name is overwritten)"
        >
          Save
        </button>
      </div>
      {loadouts.length === 0 ? (
        <p className="muted">No saved loadouts yet.</p>
      ) : (
        <ul className="loadout-list">
          {loadouts.map((l) => (
            <li key={l.name} className="loadout-row">
              <span className="loadout-name">{l.name}</span>
              <button className="btn btn-small" onClick={() => applyLoadout(l.name)}>
                Apply
              </button>
              <button className="btn btn-small" onClick={() => deleteLoadout(l.name)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
