import type { BossDefinition } from '../../model/boss';

/**
 * Zone boss of Heartfield (GDD §5, level band 1–3): the gate to Duskwood Edge.
 * Mechanic type-1 *lite* — a single soft-enrage damage check, no movement, no
 * adds. Dual-solubility (§2): the enrage is gear-soluble (more DPS) and
 * mistake-soluble (a disciplined character wastes fewer GCDs). Tuned so an
 * on-band character in starter gear kills it before the soft enrage; an
 * underlevelled one runs into the wall.
 *
 * Unused mechanic slots are disabled with no-op values (empty timeline, a
 * movement window that never fires, an add phase whose trigger never hits).
 */
export function makeBanditWarlord(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'bandit-warlord',
    name: 'Bandit Warlord',
    hp: 5200,
    meleeDamage: 30,
    meleeSwingMs: 2000,
    meleeDamageType: 'physical',

    // No timeline. A no-op movement window (far past the fight cap, so it never
    // fires) is kept so the install-time jitter draw matches other bosses, and
    // a disabled add phase (atHpPct 0). Soft enrage: a gentle ×2.5 at 2:00 —
    // pushable with a little more gear or cleaner play, not an instant wipe.
    mechanics: [
      {
        kind: 'movement',
        firstAtMs: 10_000_000,
        everyMs: 10_000_000,
        durationMs: 0,
        failDamage: 0,
        failDamageType: 'physical',
      },
      { kind: 'enrage', atMs: 120_000, damageMult: 2.5 },
      {
        kind: 'adds',
        atHpPct: 0,
        waveEveryMs: 10_000_000,
        addsPerWave: 0,
        add: { name: 'Bandit', hp: 1, meleeDamage: 0, meleeSwingMs: 10_000_000 },
        tantrumAfterMs: 10_000_000,
        tantrumDamageMult: 1,
      },
    ],

    timerJitterPct: 0.1,
    ...overrides,
  };
}
