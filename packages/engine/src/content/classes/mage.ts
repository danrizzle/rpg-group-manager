import type { CharacterDef } from '../../sim/engine';
import type { BehaviorStats, CombatStats } from '../../model/stats';
import { applyGear, type Item } from '../../model/item';
import { GEAR_SETS } from '../items';

/**
 * v1 test kit: the Mage (GDD §2) — the class with the clearest
 * single-target↔AoE stance tradeoff. Numbers are placeholder balance.
 *
 * Stats assemble as naked base + gear; the 'default' set reproduces the
 * pre-gear balance (100 SP, 2400 HP, 15% crit), so existing tuning holds.
 */
const NAKED_BASE: CombatStats = {
  maxHp: 2100,
  attackPower: 0,
  spellPower: 60,
  healingPower: 0,
  critChance: 0.1,
  hastePct: 0,
  armor: 60,
  resistances: {},
};

const BASE_BEHAVIOR: BehaviorStats = {
  damageWhileMoving: 0.6,
  aoeEfficiency: 1.0,
  discipline: 50,
};

export function makeMage(
  behaviorOverride?: Partial<BehaviorStats>,
  gear: Item[] = GEAR_SETS['default']!,
): CharacterDef {
  const { stats, behavior } = applyGear(
    NAKED_BASE,
    { ...BASE_BEHAVIOR, ...behaviorOverride },
    gear,
  );
  return {
    name: 'Elara',
    stats,
    behavior,
    abilities: [
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
    ],
  };
}
