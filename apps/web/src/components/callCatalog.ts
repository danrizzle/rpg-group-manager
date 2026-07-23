import type { PlanAction } from '@rpg/engine';

/**
 * The live-call catalog (GDD §3). A "call" is a manager-level instruction the
 * player fires at the frontier during a real fight — every one is a plan
 * building block issued spontaneously (§3 ground rule 1: same arsenal as the
 * plan). This module is the single source of that vocabulary so the live
 * palette (FightView) and the plan editor (PlanPanel) can't drift — "the same
 * vocabulary in three forms" (§8).
 */

/** A party member as the fight/plan views see it: id, name, role, tagged kit. */
export type PartyLike = {
  character: {
    id?: string;
    name: string;
    role?: string;
    abilities: { id: string; name: string; tags: readonly string[] }[];
  };
}[];

/** GDD §3 call catalog groups. */
export type CallCategory = 'offensive' | 'defensive' | 'tactical' | 'meta';

/**
 * The ability tags a call (or a plan entry) can fire. Kept as one list so the
 * palette and the plan editor speak the same vocabulary: tagging a new class
 * ability with one of these surfaces it in both places automatically, with no
 * hardcoded ability ids.
 */
export const CALL_TAGS = ['burst', 'heal-cd', 'defensive', 'taunt', 'interrupt', 'battle-res'] as const;

/** Fan a tag out into one ability-call per matching kit across the party. */
export const callsForTag = (party: PartyLike, tag: string): PlanAction[] =>
  party.flatMap((m) =>
    m.character.abilities
      .filter((a) => a.tags.includes(tag))
      .map((a) => ({ kind: 'ability', charId: m.character.id ?? 'player', abilityId: a.id }) as PlanAction),
  );

/** A DPS-wide targeting switch (1 = Cleave/AoE, 0 = Focus/single-target). */
const stanceForDps = (party: PartyLike, targeting: number): PlanAction[] =>
  party
    .filter((m) => m.character.role === 'dps')
    .map((m) => ({ kind: 'stance', charId: m.character.id ?? 'player', patch: { targeting } }) as PlanAction);

/** One named live call: a button that fires a BATCH of actions at the frontier. */
export interface CatalogCall {
  id: string;
  label: string;
  category: CallCategory;
  /** The actions this call issues. Empty ⇒ the party can't answer it ⇒ disabled. */
  derive: (party: PartyLike) => PlanAction[];
}

/**
 * The fire-and-forget calls, grouped by §3 category. Every one routes through
 * an action path already exercised by the plan editor and today's three
 * buttons (`resolveAbility` for tagged abilities, the stance patch, `retreat`),
 * so surfacing them needs no engine change.
 *
 * Not here (they need engine systems this game doesn't have yet, so they are
 * the next slice): "Dodge!" (a group movement-phase model), "Healers save
 * mana!"/"Pump!" (there is no mana economy), the heal-CD *chain* ordering, and
 * "Below 20%: everything out + potions" (a compound conditional call). The Meta
 * "Stop damage!"/"Push!" toggle is stateful (it flips on the last hold call),
 * so FightView renders it directly rather than as a static entry here.
 */
export const LIVE_CALLS: CatalogCall[] = [
  { id: 'burst', label: 'All CDs now!', category: 'offensive', derive: (p) => callsForTag(p, 'burst') },
  { id: 'aoe', label: 'DPS to AoE!', category: 'offensive', derive: (p) => stanceForDps(p, 1) },
  { id: 'focus', label: 'Focus fire!', category: 'offensive', derive: (p) => stanceForDps(p, 0) },
  { id: 'heal-cd', label: 'Heal CD now!', category: 'defensive', derive: (p) => callsForTag(p, 'heal-cd') },
  { id: 'defensive', label: 'Everyone defensive!', category: 'defensive', derive: (p) => callsForTag(p, 'defensive') },
  { id: 'taunt', label: 'Tank swap!', category: 'tactical', derive: (p) => callsForTag(p, 'taunt') },
  { id: 'interrupt', label: 'Take the kicks!', category: 'tactical', derive: (p) => callsForTag(p, 'interrupt') },
  { id: 'battle-res', label: 'Battle res!', category: 'tactical', derive: (p) => callsForTag(p, 'battle-res') },
  { id: 'retreat', label: 'Retreat!', category: 'tactical', derive: () => [{ kind: 'retreat' }] },
];

/** Palette display order + labels (Meta appears for the hold-DPS toggle). */
export const CALL_CATEGORY_ORDER: readonly CallCategory[] = ['offensive', 'defensive', 'tactical', 'meta'];
export const CALL_CATEGORY_LABEL: Record<CallCategory, string> = {
  offensive: 'Offensive',
  defensive: 'Defensive',
  tactical: 'Tactical',
  meta: 'Meta',
};
