import { makeEmberForge } from '@rpg/engine';
import { useMemo } from 'react';
import { mmss } from '../fight/replay';
import { ROSTER_CHARS, useStore } from '../store';

/**
 * The Ember Forge (phase 4): the locked door in the Cinder Wastes. Encounters
 * unlock linearly (trash gates the first boss, Slagmaw gates Vulkan);
 * attempts — wipes included — are how the journal will learn each boss
 * (slice 4). Pulls run the full trinity: Borin, Seren and Elara.
 */
export function DungeonPanel() {
  const unlocks = useStore((s) => s.unlocks);
  const dungeonCleared = useStore((s) => s.dungeonCleared);
  const attempts = useStore((s) => s.attempts);
  const pullEncounter = useStore((s) => s.pullEncounter);
  const dungeon = useMemo(() => makeEmberForge(), []);

  if (!unlocks.emberwingKilled) return null; // the Wastes themselves are locked

  if (!unlocks.cinderMawKilled) {
    return (
      <div className="panel region-card region-locked">
        <div className="region-head">
          <span className="region-name">{dungeon.name}</span>
          <span className="chip">dungeon</span>
        </div>
        <div className="region-gate muted">
          A sealed door in the Cinder Wastes. Defeat Cinder Maw to prove your worth — adventurers
          will follow.
        </div>
      </div>
    );
  }

  return (
    <div className="panel region-card">
      <div className="region-head">
        <span className="region-name">{dungeon.name}</span>
        <span className="chip">dungeon · 3-char party</span>
      </div>
      <div className="statline muted">
        Party: {ROSTER_CHARS.map((c) => c.name).join(', ')} and Elara — build them in the character
        panel.
      </div>
      {dungeon.encounters.map((enc, i) => {
        const cleared = Boolean(dungeonCleared[enc.id]);
        const gated = i > 0 && !dungeonCleared[dungeon.encounters[i - 1]!.id];
        const record = attempts[enc.id];
        return (
          <div className="control" key={enc.id}>
            <div className="region-head">
              <span>
                {enc.name}
                {cleared && <span className="chip chip-warn"> cleared</span>}
              </span>
              <button
                className="btn btn-small btn-primary"
                disabled={gated}
                title={gated ? `Clear ${dungeon.encounters[i - 1]!.name} first` : `Pull ${enc.name}`}
                onClick={() => pullEncounter(enc.id)}
              >
                Pull
              </button>
            </div>
            <div className="control-desc">
              {gated
                ? `locked — clear ${dungeon.encounters[i - 1]!.name} first`
                : record?.last
                  ? `last: ${record.last.result === 'kill' ? `kill in ${mmss(record.last.durationMs)}` : `wipe (${record.last.result})`}${
                      record.best ? ` · best ${mmss(record.best.durationMs)}` : ''
                    }`
                  : 'never attempted'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
