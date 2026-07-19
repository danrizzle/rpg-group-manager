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

export function checkRaidComp(
  party: CharacterDef[],
  rule: RaidCompRule,
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (rule.size) {
    if (party.length < rule.size.min) reasons.push(`need at least ${rule.size.min} members`);
    if (party.length > rule.size.max) reasons.push(`at most ${rule.size.max} members`);
  }
  const counts = new Map<string, number>();
  for (const c of party) if (c.role) counts.set(c.role, (counts.get(c.role) ?? 0) + 1);
  for (const [role, n] of Object.entries(rule.minRoles ?? {})) {
    if ((counts.get(role) ?? 0) < (n ?? 0)) reasons.push(`need at least ${n} ${role}`);
  }
  return { ok: reasons.length === 0, reasons };
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

  return party.map((c) => {
    const granted = unlocked
      .filter((cd) => cd.grantsTo === c.classId)
      // First member of the class carries it — one Battle Shout per comp.
      .filter((cd) => party.find((m) => m.classId === cd.grantsTo) === c)
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
