import type { CharacterDef } from '../../sim/engine';
import type { Ability } from '../../model/ability';
import type { BehaviorStats, CombatStats } from '../../model/stats';
import { applyGear, foldBonuses, type Item } from '../../model/item';
import { normalizeConsumables, type ConsumableDefinition } from '../../model/consumable';
import { LEVEL_CAP } from '../../model/progression';
import { applyTalents, talentPointsForLevel, validateTalentSelection } from '../../model/talent';
import { GEAR_SETS } from '../items';
import { WARRIOR_TALENTS } from './warriorTalents';

/**
 * v1 Warrior (GDD §2): the tank. Damage reduction, boss aggro via
 * high-threat strikes (single + AoE — the add-pickup tool against healer
 * aggro), Shield Wall as the tank CD. Numbers are placeholder balance.
 * Recruits arrive at the cap in v1, so there is no unlock arc; stats still
 * scale by level like the Mage's so future content can use lower levels.
 * No talent tree in v1 phase 4 (deferred to the roster phase).
 */

const L1_ATTACK_POWER = 28;
const L10_ATTACK_POWER = 55;
const L1_MAX_HP = 2000;
const L10_MAX_HP = 3400;

const clampLevel = (level: number): number =>
  Math.max(1, Math.min(LEVEL_CAP, Math.round(level)));

const lerpByLevel = (level: number, at1: number, at10: number): number =>
  Math.round(at1 + ((at10 - at1) * (clampLevel(level) - 1)) / (LEVEL_CAP - 1));

export function warriorBaseForLevel(level: number): CombatStats {
  return {
    maxHp: lerpByLevel(level, L1_MAX_HP, L10_MAX_HP),
    attackPower: lerpByLevel(level, L1_ATTACK_POWER, L10_ATTACK_POWER),
    spellPower: 0,
    healingPower: 0,
    critChance: 0.05,
    hastePct: 0,
    armor: 200,
    resistances: {},
  };
}

const BASE_BEHAVIOR: BehaviorStats = {
  // Melee keeps swinging on the move; AoE threat is trained, not innate.
  damageWhileMoving: 0.8,
  aoeEfficiency: 1.0,
  discipline: 50,
};

const KIT: Ability[] = [
  {
    id: 'heroic-strike',
    name: 'Heroic Strike',
    castTimeMs: 0,
    cooldownMs: 0,
    effect: { kind: 'damage', damageType: 'physical', base: 50, coeff: 0.7, powerStat: 'attackPower' },
    tags: ['single-target'],
    threatMult: 3,
  },
  {
    id: 'shield-slam',
    name: 'Shield Slam',
    castTimeMs: 0,
    cooldownMs: 9000,
    effect: { kind: 'damage', damageType: 'physical', base: 90, coeff: 1.1, powerStat: 'attackPower' },
    tags: ['single-target'],
    threatMult: 6,
  },
  {
    id: 'thunder-clap',
    name: 'Thunder Clap',
    castTimeMs: 0,
    cooldownMs: 8000,
    effect: { kind: 'damage', damageType: 'physical', base: 45, coeff: 0.5, powerStat: 'attackPower', aoe: true },
    tags: ['aoe'],
    threatMult: 6,
  },
  {
    id: 'shield-wall',
    name: 'Shield Wall',
    castTimeMs: 0,
    cooldownMs: 90_000,
    effect: { kind: 'buff', buffId: 'shield-wall', durationMs: 10_000, damageTakenMult: 0.4 },
    tags: ['defensive'],
  },
];

/**
 * `consumables` follows the crafted-economy semantics from birth: absent or
 * [] = empty slots (new classes never had the legacy free kit potion).
 */
export function makeWarrior(
  behaviorOverride?: Partial<BehaviorStats>,
  gear: Item[] = GEAR_SETS['warrior-default']!,
  level: number = LEVEL_CAP,
  talents: string[] = [],
  consumables: ConsumableDefinition[] = [],
): CharacterDef {
  const geared = applyGear(
    warriorBaseForLevel(level),
    { ...BASE_BEHAVIOR, ...behaviorOverride },
    gear,
  );
  validateTalentSelection(WARRIOR_TALENTS, talents, talentPointsForLevel(level));
  const talented = applyTalents(geared.stats, geared.behavior, KIT, WARRIOR_TALENTS, talents);
  const { passives, actives, summary } = normalizeConsumables(consumables);
  const folded = foldBonuses(talented.stats, talented.behavior, passives.map((p) => p.bonuses));
  return {
    id: 'warrior',
    name: 'Borin',
    classId: 'warrior',
    role: 'tank',
    stats: folded.stats,
    behavior: folded.behavior,
    abilities: [...talented.abilities, ...actives],
    consumables: summary,
  };
}
