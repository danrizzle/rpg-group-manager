import type { CharacterDef } from '../../sim/engine';
import type { BehaviorStats } from '../../model/stats';

/**
 * v1 test kit: the Mage (GDD §2) — the class with the clearest
 * single-target↔AoE stance tradeoff. Numbers are placeholder balance.
 */
export function makeMage(behavior?: Partial<BehaviorStats>): CharacterDef {
  return {
    name: 'Elara',
    stats: {
      maxHp: 2400,
      attackPower: 0,
      spellPower: 100,
      healingPower: 0,
      critChance: 0.15,
      hastePct: 0,
      armor: 120,
      resistances: {},
    },
    behavior: {
      damageWhileMoving: 0.6,
      aoeEfficiency: 1.0,
      discipline: 50,
      ...behavior,
    },
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
