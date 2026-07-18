import type { DungeonDefinition } from '../../model/dungeon';
import type { BossDefinition } from '../../model/boss';
import type { MobPackDefinition } from '../../model/mobPack';

/**
 * Ember Forge — the first dungeon (GDD §5: the locked door in the Cinder
 * Wastes; §4: dungeons = several bosses + trash, mechanic types 1–3 only).
 * Fire damage everywhere: resist gear and ward potions are the gear answer
 * in anger (§2/§6). Numbers are placeholder balance tuned via the CLI
 * (--encounter) against the trinity at default gear (Normal law: ≥ ~90%
 * with adequate gear, defaults, no plan).
 *
 *   1. Forge Whelps (trash)   — 4-mob fire pack; AoE-threat check for the tank.
 *   2. Slagmaw the Smelter    — types 1+2 upgraded: Molten Eruption hits the
 *      whole party (group heal check + fire resist), lava vents force
 *      movement, hard enrage backstop.
 *   3. Forgemaster Vulkan     — phase timing showcase: Forge Blast on a
 *      timer, HP-triggered add phase at 50% with tantrum. Pushing into
 *      phase 2 just before a blast overlaps fresh adds with the blast —
 *      hold DPS (slice 5/6) is the knowledge answer; the gear answer is
 *      out-DPSing the overlap.
 */

export function makeForgeWhelps(): MobPackDefinition {
  const whelp = {
    name: 'Forge Whelp',
    hp: 2100,
    meleeDamage: 38,
    meleeSwingMs: 1900,
    meleeDamageType: 'fire' as const,
    levelBand: { min: 10, max: 10 },
    xpPerKill: 0,
  };
  return {
    id: 'forge-whelps',
    name: 'Forge Whelps',
    mobs: Array.from({ length: 4 }, (_, i) => ({ id: `forge-whelps-mob-${i}`, ...whelp })),
    timerJitterPct: 0.1,
  };
}

export function makeSlagmaw(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'slagmaw',
    name: 'Slagmaw the Smelter',
    hp: 62_000,
    meleeDamage: 300,
    meleeSwingMs: 2000,
    meleeDamageType: 'physical',

    enrageAtMs: 360_000,
    enrageDamageMult: 6,

    timeline: [
      {
        id: 'molten-eruption',
        name: 'Molten Eruption',
        firstAtMs: 30_000,
        everyMs: 35_000,
        damage: 700,
        damageType: 'fire',
      },
    ],

    movementWindows: {
      firstAtMs: 18_000,
      everyMs: 32_000,
      durationMs: 4000,
      failDamage: 420,
      failDamageType: 'fire',
    },

    // No add phase — Slagmaw is the sustain/resist check.
    addPhase: {
      atHpPct: 0,
      waveEveryMs: 10_000_000,
      addsPerWave: 0,
      add: { name: 'Slag', hp: 1, meleeDamage: 0, meleeSwingMs: 10_000_000 },
      tantrumAfterMs: 10_000_000,
      tantrumDamageMult: 1,
    },

    timerJitterPct: 0.1,
    ...overrides,
  };
}

export function makeVulkan(overrides?: Partial<BossDefinition>): BossDefinition {
  return {
    id: 'vulkan',
    name: 'Forgemaster Vulkan',
    hp: 55_000,
    meleeDamage: 120,
    meleeSwingMs: 2100,
    meleeDamageType: 'physical',

    enrageAtMs: 390_000,
    enrageDamageMult: 6,

    timeline: [
      {
        id: 'forge-blast',
        name: 'Forge Blast',
        firstAtMs: 30_000,
        everyMs: 45_000,
        damage: 700,
        damageType: 'fire',
      },
    ],

    // No movement windows — Vulkan is the phase-timing check.
    movementWindows: {
      firstAtMs: 10_000_000,
      everyMs: 10_000_000,
      durationMs: 0,
      failDamage: 0,
      failDamageType: 'fire',
    },

    // Wave cadence == blast cadence: the gap between "phase entered" and
    // "next blast" repeats every cycle. Enter just after a blast and every
    // wave spawns into a calm window; push in blindly at the wrong moment
    // and EVERY wave overlaps a blast — hold DPS is the knowledge answer.
    addPhase: {
      atHpPct: 25,
      waveEveryMs: 45_000,
      addsPerWave: 3,
      add: { name: 'Molten Sentry', hp: 1100, meleeDamage: 85, meleeSwingMs: 1800 },
      tantrumAfterMs: 25_000,
      tantrumDamageMult: 1.7,
    },

    timerJitterPct: 0.1,
    ...overrides,
  };
}

export function makeEmberForge(): DungeonDefinition {
  return {
    id: 'ember-forge',
    name: 'Ember Forge',
    partySize: { min: 3, max: 5 },
    encounters: [
      { id: 'forge-whelps', name: 'Forge Whelps', kind: 'trash', pack: makeForgeWhelps() },
      { id: 'slagmaw', name: 'Slagmaw the Smelter', kind: 'boss', boss: makeSlagmaw() },
      { id: 'vulkan', name: 'Forgemaster Vulkan', kind: 'boss', boss: makeVulkan() },
    ],
  };
}
