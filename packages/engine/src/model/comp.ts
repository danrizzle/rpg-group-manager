import type { Ability } from './ability';
import type { CharacterDef, CharacterRole } from '../sim/engine';
import { foldBonuses } from './item';
import type { ItemBonuses } from './item';

/**
 * Group cooldowns & comp synergies (GDD §4): certain class/role combinations
 * unlock group abilities and passive bonuses. Declarative data interpreted by
 * `applyComp` — new synergies must not require engine changes.
 */

export interface GroupCdDefinition {
  id: string;
  name: string;
  /** classId → minimum count in the party for this CD to unlock. */
  requires: Record<string, number>;
  /** The class whose (first) member carries the granted ability. */
  grantsTo: string;
  ability: Ability;
  desc: string;
}

export interface CompPassiveDefinition {
  id: string;
  name: string;
  /** Minimum number of DISTINCT roles present. */
  minDistinctRoles: number;
  /** Folded onto every member (same clamps as gear). */
  bonuses: ItemBonuses;
  desc: string;
}

/**
 * Raid comp requirements (GDD §4/§7): raid content needs role RATIOS, not just
 * "3 distinct roles" (trivially true at raid size). Cinderforge's tank-swap and
 * dispel checks want ≥2 tanks and ≥3 healers.
 */
export interface RaidCompRule {
  size?: { min: number; max: number };
  minRoles?: Partial<Record<CharacterRole, number>>;
}

/**
 * Structured form of a comp check, for building a comp UI.
 *
 * `reasons` alone is enough to explain a failure in prose, but a raid builder
 * wants to render progress per requirement ("2/2 tanks · 2/3 healers") and
 * highlight only the row that's short — which means the numbers, not sentences
 * about them.
 */
export interface RaidCompReport {
  ok: boolean;
  /** Human-readable failures. Unchanged: existing callers keep working. */
  reasons: string[];
  size: { have: number; min?: number; max?: number; ok: boolean };
  /** One entry per role the rule constrains, in the rule's own order. */
  roles: { role: CharacterRole; have: number; need: number; ok: boolean }[];
}

export function checkRaidComp(party: CharacterDef[], rule: RaidCompRule): RaidCompReport {
  const reasons: string[] = [];
  if (rule.size) {
    if (party.length < rule.size.min) reasons.push(`need at least ${rule.size.min} members`);
    if (party.length > rule.size.max) reasons.push(`at most ${rule.size.max} members`);
  }
  const counts = new Map<string, number>();
  for (const c of party) if (c.role) counts.set(c.role, (counts.get(c.role) ?? 0) + 1);

  const roles: RaidCompReport['roles'] = [];
  for (const [role, n] of Object.entries(rule.minRoles ?? {})) {
    const have = counts.get(role) ?? 0;
    const need = n ?? 0;
    if (have < need) reasons.push(`need at least ${n} ${role}`);
    roles.push({ role: role as CharacterRole, have, need, ok: have >= need });
  }

  const have = party.length;
  return {
    ok: reasons.length === 0,
    reasons,
    size: {
      have,
      ...(rule.size ? { min: rule.size.min, max: rule.size.max } : {}),
      ok: !rule.size || (have >= rule.size.min && have <= rule.size.max),
    },
    roles,
  };
}

/** The canonical Cinderforge (first raid) comp requirement. */
export const CINDERFORGE_COMP_RULE: RaidCompRule = {
  size: { min: 10, max: 10 },
  minRoles: { tank: 2, healer: 3 },
};

/** The group CDs a given comp unlocks (for UI and plan building blocks). */
export function unlockedGroupCds(
  party: CharacterDef[],
  groupCds: GroupCdDefinition[],
): GroupCdDefinition[] {
  const counts = new Map<string, number>();
  for (const c of party) {
    if (c.classId) counts.set(c.classId, (counts.get(c.classId) ?? 0) + 1);
  }
  return groupCds.filter((cd) =>
    Object.entries(cd.requires).every(([classId, n]) => (counts.get(classId) ?? 0) >= n),
  );
}

/**
 * Pick the one carrier per unlocked group CD: the member of the granting class
 * with the lexicographically smallest id.
 *
 * Deliberately keyed on `id`, NOT on array position. The previous rule was
 * `party.find((m) => m.classId === cd.grantsTo) === c` — a reference-identity
 * check against the FIRST array element of that class, so reordering the party
 * silently moved Battle Shout / Rekindle to a different character. Once the
 * roster is reorderable (and a raid is assembled from a selection), that would
 * invalidate persisted plans referencing `charId`. An id is stable under any
 * ordering, so the carrier is a property of the comp, not of how it was built.
 *
 * Byte-identity: with exactly one member per class (every solo + trinity
 * stream) the smallest id IS the only id, so the carrier is unchanged.
 *
 * `CharacterDef.id` is optional (absent = the solo PLAYER_ID), and two id-less
 * members are genuinely indistinguishable — so members without an id fall back
 * to array position, exactly the old behavior. Returns the carrier DEF, not the
 * id, so that fallback stays a plain reference comparison.
 */
function carriers(
  party: CharacterDef[],
  unlocked: GroupCdDefinition[],
): Map<string, CharacterDef> {
  const byCd = new Map<string, CharacterDef>();
  for (const cd of unlocked) {
    let best: CharacterDef | undefined;
    for (const m of party) {
      if (m.classId !== cd.grantsTo) continue;
      if (best === undefined) {
        best = m;
      } else if (m.id !== undefined && (best.id === undefined || m.id < best.id)) {
        best = m;
      }
    }
    if (best !== undefined) byCd.set(cd.id, best);
  }
  return byCd;
}

/**
 * Apply comp rules to a party: grant unlocked group CDs to their carriers
 * and fold passives onto everyone. Pure — returns new CharacterDefs.
 */
export function applyComp(
  party: CharacterDef[],
  groupCds: GroupCdDefinition[],
  passives: CompPassiveDefinition[],
): CharacterDef[] {
  const unlocked = unlockedGroupCds(party, groupCds);
  const roles = new Set(party.map((c) => c.role).filter(Boolean));
  const activePassives = passives.filter((p) => roles.size >= p.minDistinctRoles);
  const carrier = carriers(party, unlocked);

  return party.map((c) => {
    const granted = unlocked
      .filter((cd) => cd.grantsTo === c.classId)
      // One carrier per class — see `carriers` for why it is id-keyed.
      .filter((cd) => carrier.get(cd.id) === c)
      .map((cd) => cd.ability);
    let stats = c.stats;
    let behavior = c.behavior;
    if (activePassives.length > 0) {
      const folded = foldBonuses(stats, behavior, activePassives.map((p) => p.bonuses));
      stats = folded.stats;
      behavior = folded.behavior;
    }
    if (granted.length === 0 && activePassives.length === 0) return c;
    return { ...c, stats, behavior, abilities: [...c.abilities, ...granted] };
  });
}
