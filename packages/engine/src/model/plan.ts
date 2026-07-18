import type { CharacterDef } from '../sim/engine';

/**
 * The boss plan (GDD §4): a timeline of reactions to discovered events —
 * knowledge → levers. Triggers are the things a journal reveals (plus pull
 * and raw time for adopted live calls); actions are exactly the live-call
 * arsenal (§3 ground rule 1: same abilities, same cooldowns, same effects).
 * Characters execute plan actions after their reaction time (discipline) —
 * even following the plan is part of roster progression.
 */

export type PlanTrigger =
  | { kind: 'pull' }
  | { kind: 'time'; atMs: number }
  /** Fires every time the boss casts this timeline ability. */
  | { kind: 'bossCast'; abilityId: string }
  | { kind: 'phase'; phase: number }
  /** Fires once, when boss HP first drops below the percentage. */
  | { kind: 'bossHpBelow'; pct: number };

export type PlanAction =
  /** Fire a specific ability (group CD, heal CD, burst, tank CD) if ready. */
  | { kind: 'ability'; charId: string; abilityId: string }
  /** Switch a character's intent (named stance/target step, resolved to numbers). */
  | { kind: 'stance'; charId: string; patch: { offense?: number; targeting?: number } }
  /** "Stop damage!" / "Push!" — the whole party holds or resumes DPS. */
  | { kind: 'holdDps'; hold: boolean };

export interface PlanEntry {
  trigger: PlanTrigger;
  action: PlanAction;
}

export interface BossPlan {
  entries: PlanEntry[];
}

/** A live call (§3): a plan action fired at a moment instead of a trigger. */
export interface TimedCall {
  atMs: number;
  action: PlanAction;
}

/**
 * Repair an untrusted plan against the actual party (persisted plans survive
 * respecs/content changes): drop entries whose character or ability no
 * longer exists. Stance patches are clamped by validateStance at fight
 * start, so out-of-range numbers are dropped here too.
 */
export function sanitizePlan(plan: BossPlan, party: CharacterDef[]): BossPlan {
  const byId = new Map(party.map((c) => [c.id ?? 'player', c]));
  const entries = plan.entries.filter(({ action }) => {
    if (action.kind === 'holdDps') return true;
    const char = byId.get(action.charId);
    if (!char) return false;
    if (action.kind === 'ability') {
      return char.abilities.some((a) => a.id === action.abilityId);
    }
    const { offense, targeting } = action.patch;
    if (offense !== undefined && (offense < 0 || offense > 1)) return false;
    if (targeting !== undefined && (targeting < 0 || targeting > 1)) return false;
    return true;
  });
  return { entries };
}
