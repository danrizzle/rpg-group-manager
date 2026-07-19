import type { PlanAction, PlanTrigger } from '../model/plan';
import { reactionTimeMs } from './mistakes';
import type { CharState, Fight } from './engine';

/**
 * Interprets a BossPlan and live calls (GDD §3/§4) into scheduled behavior.
 * Ground rule 1: actions ARE the characters' arsenal — same abilities, same
 * cooldowns; an action a character can't perform right now simply fizzles.
 * Characters comply after their reaction time (discipline): the plan says
 * "now", the rookie hears it in two seconds.
 *
 * `planAction` events document each firing (source = the acting character,
 * or 'party' for hold orders) so reviews and call→plan adoption are pure
 * stream consumers.
 */
export function installPlan(fight: Fight): void {
  const entries = fight.setup.plan?.entries ?? [];
  const calls = fight.setup.calls ?? [];

  const charById = (id: string): CharState | undefined =>
    fight.chars.find((c) => c.actor.id === id);

  const execute = (action: PlanAction, origin: 'plan' | 'call'): void => {
    if (fight.ended !== null) return;
    const meta = { origin, ...describe(action) };
    if (action.kind === 'holdDps') {
      fight.emit({ type: 'planAction', source: 'party', meta });
      for (const c of fight.livingChars()) {
        fight.scheduler.in(reactionTimeMs(c.def.behavior.discipline), () => {
          c.holding = action.hold;
        });
      }
      return;
    }
    if (action.kind === 'retreat') {
      fight.emit({ type: 'planAction', source: 'party', meta });
      fight.retreat();
      return;
    }
    const char = charById(action.charId);
    if (!char || !char.actor.alive) return;
    fight.emit({ type: 'planAction', source: char.actor.id, meta });
    fight.scheduler.in(reactionTimeMs(char.def.behavior.discipline), () => {
      if (fight.ended !== null || !char.actor.alive) return;
      if (action.kind === 'stance') {
        char.stance = { ...char.stance, ...action.patch };
        return;
      }
      const ability = char.def.abilities.find((a) => a.id === action.abilityId);
      if (!ability) return;
      if (!char.actor.isReady(ability, fight.scheduler.now)) return; // fizzle: on cooldown
      fight.resolveAbility(char, ability);
    });
  };

  const install = (trigger: PlanTrigger, fire: () => void): void => {
    switch (trigger.kind) {
      case 'pull':
        fight.scheduler.at(0, fire);
        break;
      case 'time':
        fight.scheduler.at(Math.max(0, Math.round(trigger.atMs)), fire);
        break;
      case 'bossCast':
        fight.bossCastHooks.push((id) => {
          if (id === trigger.abilityId) fire();
        });
        break;
      case 'phase':
        fight.phaseHooks.push((phase) => {
          if (phase === trigger.phase) fire();
        });
        break;
      case 'bossHpBelow':
        fight.addHpTrigger(trigger.pct, fire);
        break;
    }
  };

  for (const entry of entries) {
    install(entry.trigger, () => execute(entry.action, 'plan'));
  }
  for (const call of calls) {
    fight.scheduler.at(Math.max(0, Math.round(call.atMs)), () =>
      execute(call.action, 'call'),
    );
  }
}

/** Flat, JSON-safe event meta for a plan action. */
function describe(action: PlanAction): Record<string, unknown> {
  switch (action.kind) {
    case 'ability':
      return { kind: 'ability', charId: action.charId, abilityId: action.abilityId };
    case 'stance':
      return { kind: 'stance', charId: action.charId, ...action.patch };
    case 'holdDps':
      return { kind: 'holdDps', hold: action.hold };
    default:
      return { kind: (action as { kind: string }).kind };
  }
}
