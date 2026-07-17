import type { Ability } from './ability';
import type { BehaviorStats, CombatStats } from './stats';
import { LEVEL_CAP } from './progression';

/**
 * Talents (GDD §2): arrive at the level cap and deepen the intents leveling
 * taught. A tree delivers three things — numbers (CombatStats), behavior
 * stats (execution quality), and new *discrete named* behavior controls
 * (never sliders). Declarative data, folded by applyTalents like applyGear.
 */

export type TalentEffect =
  | {
      kind: 'stat';
      stat: 'spellPower' | 'attackPower' | 'healingPower' | 'maxHp' | 'critChance' | 'hastePct' | 'armor';
      add: number;
    }
  | { kind: 'behavior'; stat: keyof BehaviorStats; add: number }
  | { kind: 'ability'; abilityId: string }
  | { kind: 'control'; control: string };

export interface TalentNode {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  cost: number;
  requires?: string[];
  effects: TalentEffect[];
  desc: string;
}

export interface TalentTree {
  classId: string;
  nodes: TalentNode[];
  /** Definitions for abilities granted via {kind:'ability'} — content is data. */
  abilities: Record<string, Ability>;
}

/** Flat pool granted at the cap. Placeholder — tune via the CLI/sim. */
export const TALENT_POINT_POOL = 8;

export function talentPointsForLevel(level: number): number {
  return level >= LEVEL_CAP ? TALENT_POINT_POOL : 0;
}

function nodesById(tree: TalentTree): Map<string, TalentNode> {
  return new Map(tree.nodes.map((n) => [n.id, n]));
}

/** Structural + budget validation. Throws on any invalid selection. */
export function validateTalentSelection(tree: TalentTree, nodeIds: string[], budget: number): void {
  const byId = nodesById(tree);
  const taken = new Set<string>();
  let spent = 0;
  for (const id of nodeIds) {
    const node = byId.get(id);
    if (!node) throw new Error(`unknown talent: ${id}`);
    if (taken.has(id)) throw new Error(`duplicate talent: ${id}`);
    taken.add(id);
    spent += node.cost;
  }
  for (const id of taken) {
    for (const req of byId.get(id)!.requires ?? []) {
      if (!taken.has(req)) throw new Error(`talent ${id} requires ${req}`);
    }
  }
  if (spent > budget) throw new Error(`talent selection costs ${spent}, budget is ${budget}`);
}

/**
 * Deterministic repair for untrusted selections (persisted builds, loadouts):
 * drop unknown ids, drop nodes with unmet requires until stable, then
 * truncate in array order once the cumulative cost exceeds the budget.
 */
export function sanitizeTalentSelection(tree: TalentTree, nodeIds: string[], budget: number): string[] {
  const byId = nodesById(tree);
  let ids = [...new Set(nodeIds)].filter((id) => byId.has(id));
  let changed = true;
  while (changed) {
    changed = false;
    const taken = new Set(ids);
    ids = ids.filter((id) => {
      const ok = (byId.get(id)!.requires ?? []).every((req) => taken.has(req));
      if (!ok) changed = true;
      return ok;
    });
  }
  const kept: string[] = [];
  let spent = 0;
  for (const id of ids) {
    const cost = byId.get(id)!.cost;
    if (spent + cost > budget) break;
    kept.push(id);
    spent += cost;
  }
  // Truncation may have cut a node others require; one more requires pass.
  const taken = new Set(kept);
  return kept.filter((id) => (byId.get(id)!.requires ?? []).every((req) => taken.has(req)));
}

/** The controls ({kind:'control'} effects) a selection unlocks. */
export function unlockedControls(tree: TalentTree, nodeIds: string[]): Set<string> {
  const byId = nodesById(tree);
  const controls = new Set<string>();
  for (const id of nodeIds) {
    for (const e of byId.get(id)?.effects ?? []) {
      if (e.kind === 'control') controls.add(e.control);
    }
  }
  return controls;
}

/** Fold talent effects on top of geared stats — the applyGear of talents. */
export function applyTalents(
  stats: CombatStats,
  behavior: BehaviorStats,
  kit: Ability[],
  tree: TalentTree,
  nodeIds: string[],
): { stats: CombatStats; behavior: BehaviorStats; abilities: Ability[]; controls: Set<string> } {
  validateTalentSelection(tree, nodeIds, Infinity);
  const byId = nodesById(tree);
  const s: CombatStats = { ...stats, resistances: { ...stats.resistances } };
  const b: BehaviorStats = { ...behavior };
  const abilities = [...kit];
  const controls = new Set<string>();
  for (const id of nodeIds) {
    for (const e of byId.get(id)!.effects) {
      if (e.kind === 'stat') {
        s[e.stat] += e.add;
      } else if (e.kind === 'behavior') {
        b[e.stat] += e.add;
      } else if (e.kind === 'ability') {
        const ability = tree.abilities[e.abilityId];
        if (!ability) throw new Error(`talent ${id} grants unknown ability ${e.abilityId}`);
        abilities.push(ability);
      } else {
        controls.add(e.control);
      }
    }
  }
  s.critChance = Math.min(1, s.critChance);
  b.discipline = Math.min(100, b.discipline);
  b.damageWhileMoving = Math.min(1, b.damageWhileMoving);
  return { stats: s, behavior: b, abilities, controls };
}
