import type { BossDefinition } from '../../model/boss';

/**
 * Zone boss of Ashen Foothills (GDD §5, level band 6–9): the gate to the
 * Cinder Wastes. Mechanic type-2 — periodic movement windows plus a fire
 * timeline (sustain check), no adds. Dual-solubility (§2): the movement
 * phases reward damage-while-moving gear (Quickstep Anklet) *or* a Guarded,
 * potion-early setup that survives the fire ticks while giving ground.
 *
 * Enrage is only a far-off backstop; the fight is decided by the movement +
 * sustain interplay, not a damage race. No add phase (atHpPct 0).
 */
export function makeEmberwing(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'emberwing',
    name: 'Emberwing',
    hp: 22_000,
    meleeDamage: 48,
    meleeSwingMs: 1900,
    meleeDamageType: 'physical',

    mechanics: [
      // Fire sustain check.
      {
        kind: 'timeline',
        id: 'cinder-breath',
        name: 'Cinder Breath',
        firstAtMs: 30_000,
        everyMs: 30_000,
        damage: 210,
        damageType: 'fire',
      },
      // Type-2 movement windows: give ground (DPS penalty) or eat a fire hit.
      {
        kind: 'movement',
        firstAtMs: 15_000,
        everyMs: 22_000,
        durationMs: 3500,
        failDamage: 460,
        failDamageType: 'fire',
      },
      // Backstop enrage far past a realistic kill time.
      { kind: 'enrage', atMs: 420_000, damageMult: 4 },
      // No add phase (atHpPct 0).
      {
        kind: 'adds',
        atHpPct: 0,
        waveEveryMs: 10_000_000,
        addsPerWave: 0,
        add: { name: 'Ember', hp: 1, meleeDamage: 0, meleeSwingMs: 10_000_000 },
        tantrumAfterMs: 10_000_000,
        tantrumDamageMult: 1,
      },
    ],

    timerJitterPct: 0.1,
    ...overrides,
  };
}
