import type { CharacterDef } from '../../sim/engine';
import type { Ability } from '../../model/ability';
import type { BehaviorStats, CombatStats } from '../../model/stats';
import { applyGear, foldBonuses, type Item } from '../../model/item';
import { normalizeConsumables, type ConsumableDefinition } from '../../model/consumable';
import { LEVEL_CAP } from '../../model/progression';
import { applyTalents, talentPointsForLevel, validateTalentSelection } from '../../model/talent';
import { GEAR_SETS } from '../items';
import { PRIEST_TALENTS } from './priestTalents';

/**
 * v1 Priest (GDD §2): the healer. Single/group healing plus Divine Hymn as
 * the healing CD ("Heal CD now!" call target, dispel arrives at raid tier).
 * Smite gives idle GCDs a job when nobody is hurt. Numbers are placeholder
 * balance. No talent tree in v1 phase 4 (deferred to the roster phase).
 */

const L1_HEALING_POWER = 25;
const L10_HEALING_POWER = 50;
const L1_SPELL_POWER = 15;
const L10_SPELL_POWER = 30;
const L1_MAX_HP = 1300;
const L10_MAX_HP = 2300;

const clampLevel = (level: number): number =>
  Math.max(1, Math.min(LEVEL_CAP, Math.round(level)));

const lerpByLevel = (level: number, at1: number, at10: number): number =>
  Math.round(at1 + ((at10 - at1) * (clampLevel(level) - 1)) / (LEVEL_CAP - 1));

export function priestBaseForLevel(level: number): CombatStats {
  return {
    maxHp: lerpByLevel(level, L1_MAX_HP, L10_MAX_HP),
    attackPower: 0,
    spellPower: lerpByLevel(level, L1_SPELL_POWER, L10_SPELL_POWER),
    healingPower: lerpByLevel(level, L1_HEALING_POWER, L10_HEALING_POWER),
    critChance: 0.08,
    hastePct: 0,
    armor: 40,
    resistances: {},
  };
}

const BASE_BEHAVIOR: BehaviorStats = {
  damageWhileMoving: 0.5,
  aoeEfficiency: 1.0,
  discipline: 50,
};

const KIT: Ability[] = [
  {
    id: 'lesser-heal',
    name: 'Lesser Heal',
    castTimeMs: 2200,
    cooldownMs: 0,
    effect: { kind: 'heal', base: 250, coeff: 2.2, target: 'lowest-ally' },
    tags: [],
    movementPenalty: true,
  },
  {
    id: 'circle-of-healing',
    name: 'Circle of Healing',
    castTimeMs: 2500,
    cooldownMs: 12_000,
    effect: { kind: 'heal', base: 150, coeff: 1.0, target: { kind: 'group', maxTargets: 5 } },
    tags: [],
    movementPenalty: true,
  },
  {
    id: 'divine-hymn',
    name: 'Divine Hymn',
    castTimeMs: 0,
    cooldownMs: 180_000,
    effect: { kind: 'heal', base: 500, coeff: 2.0, target: { kind: 'group', maxTargets: 5 } },
    tags: ['heal-cd'],
  },
  {
    id: 'smite',
    name: 'Smite',
    castTimeMs: 1800,
    cooldownMs: 0,
    effect: { kind: 'damage', damageType: 'shadow', base: 60, coeff: 0.8 },
    tags: ['single-target'],
    movementPenalty: true,
  },
];

/**
 * `consumables` follows the crafted-economy semantics from birth: absent or
 * [] = empty slots (new classes never had the legacy free kit potion).
 */
export function makePriest(
  behaviorOverride?: Partial<BehaviorStats>,
  gear: Item[] = GEAR_SETS['priest-default']!,
  level: number = LEVEL_CAP,
  talents: string[] = [],
  consumables: ConsumableDefinition[] = [],
): CharacterDef {
  const geared = applyGear(
    priestBaseForLevel(level),
    { ...BASE_BEHAVIOR, ...behaviorOverride },
    gear,
  );
  validateTalentSelection(PRIEST_TALENTS, talents, talentPointsForLevel(level));
  const talented = applyTalents(geared.stats, geared.behavior, KIT, PRIEST_TALENTS, talents);
  const { passives, actives, summary } = normalizeConsumables(consumables);
  const folded = foldBonuses(talented.stats, talented.behavior, passives.map((p) => p.bonuses));
  return {
    id: 'priest',
    name: 'Seren',
    classId: 'priest',
    role: 'healer',
    stats: folded.stats,
    behavior: folded.behavior,
    abilities: [...talented.abilities, ...actives],
    consumables: summary,
  };
}
