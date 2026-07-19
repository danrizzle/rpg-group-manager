import {
  addsMechanic,
  timelineMechanics,
  type BossDefinition,
  type BossPlan,
  type PlanAction,
  type PlanEntry,
  type PlanTrigger,
} from '@rpg/engine';
import { useState } from 'react';
import { mmss } from '../fight/replay';
import { useStore, type JournalEntry } from '../store';

/**
 * The boss plan editor (GDD §4): journal entries are the building blocks —
 * only discovered casts/phases appear as triggers (knowledge → levers). The
 * same actions double as the live-call arsenal (slice 6).
 */

const HP_STEPS = [80, 70, 60, 50, 45, 40, 35, 30, 28, 26, 24, 22, 20];

interface ActionOption {
  id: string;
  label: string;
  action: PlanAction;
}

/** Curated action palette; entries are re-sanitized against the real party at pull time. */
const ACTION_OPTIONS: ActionOption[] = [
  { id: 'battle-shout', label: 'Battle Shout (Borin — party burst window)', action: { kind: 'ability', charId: 'warrior', abilityId: 'battle-shout' } },
  { id: 'shield-wall', label: 'Shield Wall (Borin — tank CD)', action: { kind: 'ability', charId: 'warrior', abilityId: 'shield-wall' } },
  { id: 'divine-hymn', label: 'Divine Hymn (Seren — heal CD)', action: { kind: 'ability', charId: 'priest', abilityId: 'divine-hymn' } },
  { id: 'combustion', label: 'Combustion (Elara — burst)', action: { kind: 'ability', charId: 'mage', abilityId: 'combustion' } },
  { id: 'pyroclasm', label: 'Pyroclasm (Elara — burst, talent)', action: { kind: 'ability', charId: 'mage', abilityId: 'pyroclasm' } },
  { id: 'mage-cleave', label: 'Elara → Cleave targets', action: { kind: 'stance', charId: 'mage', patch: { targeting: 1 } } },
  { id: 'mage-focus', label: 'Elara → Focus targets', action: { kind: 'stance', charId: 'mage', patch: { targeting: 0 } } },
  { id: 'hold', label: 'Stop damage! (whole party holds DPS)', action: { kind: 'holdDps', hold: true } },
  { id: 'push', label: 'Push! (resume DPS)', action: { kind: 'holdDps', hold: false } },
];

interface TriggerOption {
  id: string;
  label: string;
  trigger: PlanTrigger;
}

/** Triggers the journal has unlocked for this boss. */
function triggerOptions(boss: BossDefinition, entry: JournalEntry | undefined): TriggerOption[] {
  const seen = new Set(entry?.seen ?? []);
  const opts: TriggerOption[] = [{ id: 'pull', label: 'On pull', trigger: { kind: 'pull' } }];
  for (const t of timelineMechanics(boss)) {
    if (seen.has(`timeline:${t.id}`)) {
      opts.push({
        id: `cast:${t.id}`,
        label: `When ${boss.name.split(' ')[0]} casts ${t.name}`,
        trigger: { kind: 'bossCast', abilityId: t.id },
      });
    }
  }
  if (seen.has('adds')) {
    const atHpPct = addsMechanic(boss)?.atHpPct ?? 0;
    opts.push({ id: 'phase2', label: `Phase 2 (${atHpPct}%)`, trigger: { kind: 'phase', phase: 2 } });
  }
  // Boss HP is on the bars from pull one — always plannable.
  for (const pct of HP_STEPS) {
    opts.push({ id: `hp:${pct}`, label: `Boss below ${pct}%`, trigger: { kind: 'bossHpBelow', pct } });
  }
  return opts;
}

function describeTrigger(t: PlanTrigger, boss: BossDefinition): string {
  switch (t.kind) {
    case 'pull':
      return 'Pull';
    case 'time':
      return `At ${mmss(t.atMs)}`;
    case 'bossCast':
      return timelineMechanics(boss).find((x) => x.id === t.abilityId)?.name ?? t.abilityId;
    case 'phase':
      return `Phase ${t.phase}`;
    case 'bossHpBelow':
      return `Boss < ${t.pct}%`;
  }
}

function describeAction(a: PlanAction): string {
  const match = ACTION_OPTIONS.find((o) => JSON.stringify(o.action) === JSON.stringify(a));
  if (match) return match.label;
  if (a.kind === 'ability') return `${a.charId}: ${a.abilityId}`;
  if (a.kind === 'stance') return `${a.charId}: stance ${JSON.stringify(a.patch)}`;
  if (a.kind === 'retreat') return 'Retreat!';
  return a.hold ? 'Stop damage!' : 'Push!';
}

export function PlanPanel({ boss, journalEntry }: { boss: BossDefinition; journalEntry: JournalEntry | undefined }) {
  const plans = useStore((s) => s.plans);
  const setPlan = useStore((s) => s.setPlan);
  const plan: BossPlan = plans[boss.id] ?? { entries: [] };
  const triggers = triggerOptions(boss, journalEntry);
  const [triggerId, setTriggerId] = useState('pull');
  const [actionId, setActionId] = useState('battle-shout');

  const add = () => {
    const trigger = triggers.find((t) => t.id === triggerId)?.trigger;
    const action = ACTION_OPTIONS.find((a) => a.id === actionId)?.action;
    if (!trigger || !action) return;
    const entry: PlanEntry = { trigger, action };
    setPlan(boss.id, { entries: [...plan.entries, entry] });
  };
  const remove = (i: number) =>
    setPlan(boss.id, { entries: plan.entries.filter((_, idx) => idx !== i) });

  return (
    <div className="review-block">
      <div className="statline">
        Boss plan · {plan.entries.length ? `${plan.entries.length} entr${plan.entries.length === 1 ? 'y' : 'ies'}` : 'auto plan (Battle Shout on pull)'}
      </div>
      {plan.entries.map((e, i) => (
        <div key={i} className="statline">
          {describeTrigger(e.trigger, boss)} → {describeAction(e.action)}{' '}
          <button className="btn btn-small" onClick={() => remove(i)}>
            ✕
          </button>
        </div>
      ))}
      <div className="control">
        <div className="segmented">
          <select value={triggerId} onChange={(e) => setTriggerId(e.target.value)}>
            {triggers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <select value={actionId} onChange={(e) => setActionId(e.target.value)}>
            {ACTION_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button className="btn btn-small" onClick={add}>
            + Add
          </button>
        </div>
        <div className="control-desc">
          Discovered journal entries become triggers; actions use the party's own cooldowns.
          Test plans for free on the training dummy.
        </div>
      </div>
    </div>
  );
}
