import type { BossDefinition } from '../../model/boss';

/**
 * Test boss "Cinder Maw" — mechanic types 1–3 (GDD §4):
 *   1. Hard enrage at 5:30 (damage check).
 *   2. Firestorm every 45 s (unavoidable sustain check) + lava surges the
 *      mage must move out of (movement windows).
 *   3. Phase 2 at 60% HP: Lavaspawn waves; adds alive > 30 s enrage the
 *      boss (tantrum) until they die — AoE stance is the answer.
 */
export function makeCinderMaw(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'cinder-maw',
    name: 'Cinder Maw',
    hp: 48_000,
    meleeDamage: 23,
    meleeSwingMs: 2200,
    meleeDamageType: 'physical',

    enrageAtMs: 390_000,
    enrageDamageMult: 8,

    timeline: [
      {
        id: 'firestorm',
        name: 'Firestorm',
        firstAtMs: 45_000,
        everyMs: 45_000,
        damage: 220,
        damageType: 'fire',
      },
    ],

    movementWindows: {
      firstAtMs: 20_000,
      everyMs: 30_000,
      durationMs: 4000,
      failDamage: 420,
      failDamageType: 'fire',
    },

    addPhase: {
      atHpPct: 60,
      waveEveryMs: 30_000,
      addsPerWave: 2,
      add: { name: 'Lavaspawn', hp: 750, meleeDamage: 8, meleeSwingMs: 2000 },
      tantrumAfterMs: 30_000,
      tantrumDamageMult: 1.5,
    },

    timerJitterPct: 0.1,
    ...overrides,
  };
}
