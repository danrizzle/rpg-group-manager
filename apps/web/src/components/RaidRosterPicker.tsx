import {
  CINDERFORGE_COMP_RULE,
  checkRaidComp,
  familiarityBonus,
  type CharacterDef,
  type DungeonDefinition,
} from '@rpg/engine';
import { CLASSES, useRoster, useStore } from '../store';

/**
 * Pick who raids (GDD §2 via the slice-9 ramp: the roster is bigger than the
 * raid, so this is a real decision rather than a formality).
 *
 * The comp rule is surfaced live and per-requirement rather than as one
 * pass/fail, because "2/3 healers" tells you what to do next and "invalid
 * comp" doesn't. Familiarity is shown per candidate: benching someone is
 * cheap now and expensive later, which is the pressure §2 wants.
 */
export function RaidRosterPicker({ dungeon }: { dungeon: DungeonDefinition }) {
  const roster = useRoster();
  const characters = useStore((s) => s.characters);
  const raidRoster = useStore((s) => s.raidRoster);
  const toggle = useStore((s) => s.toggleRaidMember);
  const familiarity = useStore((s) => s.familiarity);

  const size = dungeon.partySize.min;
  const bossIds = dungeon.encounters.filter((e) => e.kind === 'boss').map((e) => e.id);

  // Check the SELECTION as the engine will see it — role comes from the class.
  const selected: CharacterDef[] = raidRoster
    .filter((id) => characters[id])
    .map((id) => {
      const c = characters[id]!;
      return {
        id,
        name: c.name,
        classId: c.classId,
        role: CLASSES[c.classId].role as CharacterDef['role'],
        stats: {} as CharacterDef['stats'],
        behavior: {} as CharacterDef['behavior'],
        abilities: [],
      };
    });
  const report = checkRaidComp(selected, CINDERFORGE_COMP_RULE);

  /** Best familiarity this character has anywhere in the raid, as a hint. */
  const famOf = (id: string): number =>
    Math.max(0, ...bossIds.map((b) => familiarityBonus(familiarity[id]?.[b] ?? 0)));

  return (
    <div className="raid-picker">
      <div className="preset-row">
        <span className="muted">Raid roster</span>
        <span className={`chip ${report.size.ok ? '' : 'chip-warn'}`}>
          {report.size.have} / {size}
        </span>
        {report.roles.map((r) => (
          <span key={r.role} className={`chip ${r.ok ? '' : 'chip-warn'}`}>
            {r.have}/{r.need} {r.role}
          </span>
        ))}
      </div>

      <div className="raid-picker-grid">
        {roster.map((c) => {
          const picked = raidRoster.includes(c.id);
          const full = raidRoster.length >= size;
          const fam = famOf(c.id);
          return (
            <button
              key={c.id}
              className={`btn btn-small ${picked ? 'btn-active' : ''}`}
              disabled={!picked && full}
              onClick={() => toggle(c.id)}
              title={
                `${c.name} — ${c.classLabel} (${c.role})` +
                (fam > 0 ? ` · +${fam} discipline here` : ' · never raided this')
              }
            >
              {c.name}
              <span className="muted"> {c.role.slice(0, 1).toUpperCase()}</span>
              {fam > 0 && <span className="chip chip-inline">+{fam}</span>}
            </button>
          );
        })}
      </div>

      {!report.ok && <div className="control-desc">{report.reasons.join(' · ')}</div>}
    </div>
  );
}
