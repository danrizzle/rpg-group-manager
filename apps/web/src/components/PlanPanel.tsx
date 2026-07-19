import {
  addsMechanic,
  timelineMechanics,
  type BossDefinition,
  type BossPlan,
  type PlanAction,
  type PlanEntry,
  type PlanTrigger,
} from '@rpg/engine';
import { useMemo, useState } from 'react';
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

/**
 * The action palette, derived from the party that will actually pull this boss.
 *
 * It used to be a hardcoded list keyed on 'warrior'/'priest'/'mage'. At raid
 * size that silently misbinds: ten members share three class ids, so every
 * `charId: 'warrior'` entry would resolve to whichever single def happened to
 * own that id — one tank gets all the plan actions and the other gets none.
 * Deriving from the party keys each entry on a unique roster id instead.
 *
 * Still curated, not a full char × ability matrix (GDD §3 bans list-maintenance
 * feel): only the tagged cooldowns that are worth planning around, plus the
 * party-wide levers.
 */
const PLANNABLE_TAGS = ['burst', 'heal-cd', 'defensive', 'battle-res'];

function actionOptions(party: PartyLike): ActionOption[] {
  const opts: ActionOption[] = [];
  for (const m of party) {
    const c = m.character;
    const charId = c.id ?? 'player';
    for (const ability of c.abilities) {
      if (!ability.tags.some((t) => PLANNABLE_TAGS.includes(t))) continue;
      opts.push({
        id: `${charId}:${ability.id}`,
        label: `${ability.name} (${c.name} — ${ability.tags[0]})`,
        action: { kind: 'ability', charId, abilityId: ability.id },
      });
    }
  }
  // Target switches for the dps, then the party-wide levers.
  for (const m of party) {
    const c = m.character;
    if (c.role !== 'dps') continue;
    const charId = c.id ?? 'player';
    opts.push({ id: `${charId}:cleave`, label: `${c.name} → Cleave targets`, action: { kind: 'stance', charId, patch: { targeting: 1 } } });
    opts.push({ id: `${charId}:focus`, label: `${c.name} → Focus targets`, action: { kind: 'stance', charId, patch: { targeting: 0 } } });
  }
  opts.push({ id: 'hold', label: 'Stop damage! (whole party holds DPS)', action: { kind: 'holdDps', hold: true } });
  opts.push({ id: 'push', label: 'Push! (resume DPS)', action: { kind: 'holdDps', hold: false } });
  return opts;
}

type PartyLike = {
  character: {
    id?: string;
    name: string;
    role?: string;
    abilities: { id: string; name: string; tags: readonly string[] }[];
  };
}[];

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

function describeAction(a: PlanAction, options: ActionOption[]): string {
  const match = options.find((o) => JSON.stringify(o.action) === JSON.stringify(a));
  if (match) return match.label;
  if (a.kind === 'ability') return `${a.charId}: ${a.abilityId}`;
  if (a.kind === 'stance') return `${a.charId}: stance ${JSON.stringify(a.patch)}`;
  if (a.kind === 'retreat') return 'Retreat!';
  return a.hold ? 'Stop damage!' : 'Push!';
}

export function PlanPanel({
  boss,
  journalEntry,
  party,
}: {
  boss: BossDefinition;
  journalEntry: JournalEntry | undefined;
  /** The party that will pull this boss — the palette is derived from its kits. */
  party: PartyLike;
}) {
  const plans = useStore((s) => s.plans);
  const setPlan = useStore((s) => s.setPlan);
  const plan: BossPlan = plans[boss.id] ?? { entries: [] };
  const triggers = triggerOptions(boss, journalEntry);
  const options = useMemo(() => actionOptions(party), [party]);
  const [triggerId, setTriggerId] = useState('pull');
  const [actionId, setActionId] = useState('');
  const selectedAction = actionId || options[0]?.id || '';

  const add = () => {
    const trigger = triggers.find((t) => t.id === triggerId)?.trigger;
    const action = options.find((a) => a.id === selectedAction)?.action;
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
          {describeTrigger(e.trigger, boss)} → {describeAction(e.action, options)}{' '}
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
          <select value={selectedAction} onChange={(e) => setActionId(e.target.value)}>
            {options.map((a) => (
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
