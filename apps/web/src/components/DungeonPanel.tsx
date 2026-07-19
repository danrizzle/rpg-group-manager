import {
  addsMechanic,
  enrageMechanic,
  explorationPct,
  familiarityBonus,
  mechanicsOf,
  movementMechanics,
  timelineMechanics,
  type BossDefinition,
  type DungeonDefinition,
  type MechanicKey,
} from '@rpg/engine';
import { useMemo } from 'react';
import { mmss } from '../fight/replay';
import { usePreviewParty, useRoster, useStore, type JournalEntry } from '../store';

/** The three founders — the dungeon party (raids use the saved selection). */
const TRINITY_IDS = ['warrior', 'priest', 'mage'];
import { PlanPanel } from './PlanPanel';
import { BossLoadouts } from './BossLoadouts';
import { RaidRosterPicker } from './RaidRosterPicker';

const secs = (ms: number) => `${Math.round(ms / 1000)} s`;

/** Human line for a discovered mechanic — numbers straight from the def. */
function mechanicLine(def: BossDefinition, key: MechanicKey): string {
  if (key.startsWith('timeline:')) {
    const t = timelineMechanics(def).find((x) => `timeline:${x.id}` === key);
    if (!t) return key;
    return `${t.name} — every ${secs(t.everyMs)}, ${t.damage} ${t.damageType} to the whole group`;
  }
  const mv = movementMechanics(def)[0];
  const enr = enrageMechanic(def);
  const adds = addsMechanic(def);
  switch (key) {
    case 'movement':
      return mv
        ? `Eruptions — every ${secs(mv.everyMs)} everyone must move or take ${mv.failDamage} ${mv.failDamageType}`
        : key;
    case 'enrage':
      return enr ? `Enrage at ${mmss(enr.atMs)} — damage ×${enr.damageMult}` : key;
    case 'adds':
      return adds
        ? `Phase 2 at ${adds.atHpPct}% — ${adds.addsPerWave}× ${adds.add.name} every ${secs(adds.waveEveryMs)}`
        : key;
    case 'tantrum':
      return adds
        ? `Tantrum — an add alive longer than ${secs(adds.tantrumAfterMs)} enrages the boss (×${adds.tantrumDamageMult})`
        : key;
    default:
      return key;
  }
}

/** Boss journal (GDD §4): ✓ discovered rows, ??? for the rest, wipe line. */
function JournalCard({ boss, entry }: { boss: BossDefinition; entry: JournalEntry | undefined }) {
  const familiarity = useStore((s) => s.familiarity);
  const roster = useRoster();
  if (!entry || entry.attempts === 0) {
    return <div className="control-desc">Journal empty — send the group in to learn its tricks.</div>;
  }
  const keys = mechanicsOf(boss);
  const seen = new Set(entry.seen);
  const pct = Math.round(explorationPct(boss, entry) * 100);
  const famChips = roster
    .map(({ id, name }) => ({ name, bonus: familiarityBonus(familiarity[id]?.[boss.id] ?? 0) }))
    .filter((c) => c.bonus > 0);
  return (
    <div className="review-block">
      <div className="statline">
        Journal — {pct}% explored · {entry.attempts} attempt{entry.attempts === 1 ? '' : 's'} · best
        pull {entry.lowestBossHpPct <= 0 ? 'kill' : `${Math.round(entry.lowestBossHpPct)}% boss HP`}
      </div>
      {keys.map((key) => (
        <div key={key} className={`statline ${seen.has(key) ? '' : 'muted'}`}>
          {seen.has(key) ? `✓ ${mechanicLine(boss, key)}` : '? ———'}
        </div>
      ))}
      {entry.lastWipe && (
        <div className="statline log-loss">
          ⚰ last wipe at {mmss(entry.lastWipe.atMs)}
          {entry.lastWipe.deadName && entry.lastWipe.killedBy
            ? ` — ${entry.lastWipe.killedBy.replace(/-/g, ' ')} killed ${entry.lastWipe.deadName}`
            : entry.lastWipe.bossHpPctLeft !== undefined
              ? ` — boss at ${Math.round(entry.lastWipe.bossHpPctLeft)}%`
              : ''}
        </div>
      )}
      {famChips.length > 0 && (
        <div className="statline muted">
          Familiarity: {famChips.map((c) => `${c.name} +${c.bonus} discipline`).join(' · ')}
        </div>
      )}
    </div>
  );
}

/**
 * The Ember Forge (phase 4): the locked door in the Cinder Wastes. Encounters
 * unlock linearly (trash gates the first boss, Slagmaw gates Vulkan);
 * attempts — wipes included — feed the boss journal and the roster's
 * familiarity. Dungeons run the trinity; raids field the saved selection.
 */
export function DungeonPanel({ make }: { make: () => DungeonDefinition }) {
  const unlocks = useStore((s) => s.unlocks);
  const roster = useRoster();
  const dungeonCleared = useStore((s) => s.dungeonCleared);
  const attempts = useStore((s) => s.attempts);
  const journal = useStore((s) => s.journal);
  const pullEncounter = useStore((s) => s.pullEncounter);
  const raidRoster = useStore((s) => s.raidRoster);
  const characters = useStore((s) => s.characters);
  const dungeon = useMemo(() => make(), [make]);
  const isRaid = dungeon.partySize.min > 5;
  const previewParty = usePreviewParty(isRaid);
  // A raid can't pull with the wrong comp — `pullEncounter` guards it anyway,
  // but a button that silently does nothing is worse than a disabled one.
  const compShort = isRaid && raidRoster.filter((id) => characters[id]).length !== dungeon.partySize.min;

  if (!unlocks.emberwingKilled) return null; // the Wastes themselves are locked

  // The raid needs its access building before it is even listed (slice 10).
  if (isRaid && !unlocks.raidAccess) return null;

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
        <span className="chip">
          {isRaid ? 'raid' : 'dungeon'} · {dungeon.partySize.min}-char party
        </span>
      </div>
      {isRaid ? (
        <RaidRosterPicker dungeon={dungeon} />
      ) : (
        <div className="statline muted">
          Party: {roster
            .filter((c) => TRINITY_IDS.includes(c.id))
            .map((c) => c.name)
            .join(', ')} — build them in the character panel.
        </div>
      )}
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
                disabled={gated || compShort}
                title={
                  gated
                    ? `Clear ${dungeon.encounters[i - 1]!.name} first`
                    : compShort
                      ? `Pick ${dungeon.partySize.min} raiders first`
                      : `Pull ${enc.name}`
                }
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
            {enc.kind === 'boss' && !gated && (
              <>
                <JournalCard boss={enc.boss} entry={journal[enc.id]} />
                {(journal[enc.id]?.attempts ?? 0) > 0 && (
                  <>
                <BossLoadouts
                  encounterId={enc.id}
                  party={isRaid ? raidRoster : TRINITY_IDS}
                />
                <PlanPanel boss={enc.boss} journalEntry={journal[enc.id]} party={previewParty} />
              </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
