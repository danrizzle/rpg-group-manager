import type { DungeonDefinition } from '../../model/dungeon';
import type { BossDefinition } from '../../model/boss';

/**
 * Cinderforge — the first 10-man raid (GDD §4/§7), gated behind the access
 * building. Its bosses exercise the type-4 machinery slices 2–4 built:
 *
 *   1. Warlord Ashkar — the tank-swap boss. Molten Brand stacks a
 *      per-stack damageTakenMult on the current tank; unchecked it one-shots,
 *      so the off-tank must taunt (Challenging Shout) to swap. Party-wide
 *      Cinder Nova is the 3-healer sustain check; a lava-vent movement window
 *      with a raid tolerance.
 *   2. Pyre-Priest Vael — the interrupt/dispel boss. Immolation Rite is a real
 *      cast (interruptible window) that hits like a truck if it lands; Hex of
 *      Ash is a dispellable magic debuff a Purify healer cleanses.
 *
 * Tuned against the canonical 2 tanks / 3 healers / 5 dps comp with talents
 * (Normal law: ≥ ~90% with adequate gear + the auto policies). Numbers are
 * placeholder balance, tuned via the CLI `--raid --boss ashkar|vael`.
 */

export function makeAshkar(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'ashkar',
    name: 'Warlord Ashkar',
    hp: 215_000,
    meleeDamage: 250,
    meleeSwingMs: 1800,
    meleeDamageType: 'physical',
    mechanics: [
      // Tank-swap: each Brand stacks +20% physical taken on the current tank.
      // Left on one tank the melee outruns healing — swap around 2 stacks.
      {
        kind: 'timeline',
        id: 'molten-brand',
        name: 'Molten Brand',
        firstAtMs: 8000,
        everyMs: 9000,
        damage: 70,
        damageType: 'fire',
        applies: { buffId: 'molten-brand', durationMs: 40_000, damageTakenMult: 1.2, maxStacks: 4, target: 'current-tank' },
      },
      // Party-wide sustain check (3 healers).
      { kind: 'timeline', id: 'cinder-nova', name: 'Cinder Nova', firstAtMs: 20_000, everyMs: 26_000, damage: 560, damageType: 'fire' },
      // Lava vents — a raid can eat two bodies in the fire, not more.
      { kind: 'movement', firstAtMs: 15_000, everyMs: 30_000, durationMs: 4000, failDamage: 450, failDamageType: 'fire', maxSafeFails: 2 },
      { kind: 'enrage', atMs: 300_000, damageMult: 6 },
    ],
    timerJitterPct: 0.1,
    ...overrides,
  };
}

export function makeVael(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'vael',
    name: 'Pyre-Priest Vael',
    hp: 195_000,
    meleeDamage: 170,
    meleeSwingMs: 1900,
    meleeDamageType: 'physical',
    mechanics: [
      // A real cast (interruptible window): heavy raid fire, survivable on
      // auto, softer if a Pummel warrior cuts it (the knowledge lever).
      {
        kind: 'timeline',
        id: 'immolation-rite',
        name: 'Immolation Rite',
        firstAtMs: 12_000,
        everyMs: 18_000,
        damage: 620,
        damageType: 'fire',
        castDurationMs: 2200,
      },
      // Dispellable magic debuff on the raid — a Purify healer cleanses it.
      {
        kind: 'timeline',
        id: 'hex-of-ash',
        name: 'Hex of Ash',
        firstAtMs: 22_000,
        everyMs: 22_000,
        damage: 90,
        damageType: 'shadow',
        applies: { buffId: 'hex-of-ash', durationMs: 18_000, damageTakenMult: 1.25, dispelType: 'magic', target: 'all' },
      },
      { kind: 'enrage', atMs: 300_000, damageMult: 6 },
    ],
    timerJitterPct: 0.1,
    ...overrides,
  };
}

export function makeCinderforge(): DungeonDefinition {
  return {
    id: 'cinderforge',
    name: 'Cinderforge',
    partySize: { min: 10, max: 10 },
    encounters: [
      { id: 'ashkar', name: 'Warlord Ashkar', kind: 'boss', boss: makeAshkar() },
      { id: 'vael', name: 'Pyre-Priest Vael', kind: 'boss', boss: makeVael() },
    ],
  };
}
