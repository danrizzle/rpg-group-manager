import type { CharacterDef } from '../../sim/engine';
import type { Ability } from '../../model/ability';
import type { BehaviorStats } from '../../model/stats';
import { applyGear, foldBonuses, type Item } from '../../model/item';
import { normalizeConsumables, type ConsumableDefinition } from '../../model/consumable';
import { LEVEL_CAP, abilitiesUpToLevel, nakedBaseForLevel } from '../../model/progression';
import { applyTalents, talentPointsForLevel, validateTalentSelection } from '../../model/talent';
import { GEAR_SETS } from '../items';
import { MAGE_TALENTS } from './mageTalents';

/**
 * v1 test kit: the Mage (GDD §2) — the class with the clearest
 * single-target↔AoE stance tradeoff. Numbers are placeholder balance.
 *
 * Stats assemble as naked base + gear; the naked base is level-indexed
 * (nakedBaseForLevel) and the kit is gated by the unlock arc — at the default
 * level 10 the base is 60 SP / 2,100 HP and the full kit is present, so the
 * pre-level baseline (and all existing tuning) is untouched. The 'default'
 * gear set reproduces the pre-gear balance (100 SP, 2400 HP, 15% crit).
 */
const BASE_BEHAVIOR: BehaviorStats = {
  damageWhileMoving: 0.6,
  aoeEfficiency: 1.0,
  discipline: 50,
};

/** Full kit; makeMage filters it to the abilities learned by the given level. */
const FULL_KIT: Ability[] = [
      {
        id: 'fireball',
        name: 'Fireball',
        castTimeMs: 2500,
        cooldownMs: 0,
        effect: { kind: 'damage', damageType: 'fire', base: 180, coeff: 1.5 },
        tags: ['single-target'],
        movementPenalty: true,
      },
      {
        id: 'flamestrike',
        name: 'Flamestrike',
        castTimeMs: 3000,
        cooldownMs: 6000,
        effect: { kind: 'damage', damageType: 'fire', base: 130, coeff: 0.9, aoe: true },
        tags: ['aoe'],
        movementPenalty: true,
      },
      {
        id: 'fire-blast',
        name: 'Fire Blast',
        castTimeMs: 0,
        cooldownMs: 8000,
        effect: { kind: 'damage', damageType: 'fire', base: 95, coeff: 0.55 },
        tags: ['single-target'],
        movementPenalty: false,
      },
      {
        id: 'combustion',
        name: 'Combustion',
        castTimeMs: 0,
        cooldownMs: 90_000,
        offGcd: true,
        effect: { kind: 'buff', buffId: 'combustion', durationMs: 10_000, damageMult: 1.25, critBonus: 0.25 },
        tags: ['burst'],
      },
      {
        id: 'ice-barrier',
        name: 'Ice Barrier',
        castTimeMs: 0,
        cooldownMs: 25_000,
        effect: { kind: 'buff', buffId: 'ice-barrier', durationMs: 30_000, absorb: 800 },
        tags: ['defensive'],
      },
      {
        id: 'healing-potion',
        name: 'Healing Potion',
        castTimeMs: 0,
        cooldownMs: 45_000,
        offGcd: true,
        effect: { kind: 'heal', base: 750, coeff: 0 },
        tags: ['consumable'],
      },
];

/**
 * `consumables` undefined = legacy character: the free kit potion stays and
 * streams are byte-identical to pre-slice-5. Provided (even []) = the kit's
 * consumable-tagged abilities are removed; potions/flasks come only from the
 * equipped slots (GDD §3/§6 — real fights consume what you bring).
 */
export function makeMage(
  behaviorOverride?: Partial<BehaviorStats>,
  gear: Item[] = GEAR_SETS['default']!,
  level: number = LEVEL_CAP,
  talents: string[] = [],
  consumables?: ConsumableDefinition[],
): CharacterDef {
  const geared = applyGear(
    nakedBaseForLevel(level),
    { ...BASE_BEHAVIOR, ...behaviorOverride },
    gear,
  );
  const learned = new Set(abilitiesUpToLevel(level));
  validateTalentSelection(MAGE_TALENTS, talents, talentPointsForLevel(level));
  const kit =
    consumables === undefined
      ? FULL_KIT
      : FULL_KIT.filter((a) => !a.tags.includes('consumable'));
  const talented = applyTalents(
    geared.stats,
    geared.behavior,
    kit.filter((a) => learned.has(a.id)),
    MAGE_TALENTS,
    talents,
  );
  if (consumables === undefined) {
    return { name: 'Elara', ...talented };
  }
  const { passives, actives, summary } = normalizeConsumables(consumables);
  const folded = foldBonuses(
    talented.stats,
    talented.behavior,
    passives.map((p) => p.bonuses),
  );
  return {
    name: 'Elara',
    stats: folded.stats,
    behavior: folded.behavior,
    abilities: [...talented.abilities, ...actives],
    consumables: summary,
  };
}
