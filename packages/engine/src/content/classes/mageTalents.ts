import type { TalentTree } from '../../model/talent';

/**
 * v1 Mage talent tree (GDD §2): three tiers, a throughput path (fire) and a
 * defensive path (frost), with behavior stats bridging them. Total cost (13)
 * exceeds the point pool so builds are real choices. Numbers are placeholder
 * balance — tune via the CLI/sim.
 */
export const MAGE_TALENTS: TalentTree = {
  classId: 'mage',
  nodes: [
    {
      id: 'pyromantic-affinity',
      name: 'Pyromantic Affinity',
      tier: 1,
      cost: 1,
      effects: [{ kind: 'stat', stat: 'spellPower', add: 4 }],
      desc: '+4 spell power',
    },
    {
      id: 'mental-focus',
      name: 'Mental Focus',
      tier: 1,
      cost: 1,
      effects: [{ kind: 'behavior', stat: 'discipline', add: 10 }],
      desc: '+10 discipline',
    },
    {
      id: 'frost-attunement',
      name: 'Frost Attunement',
      tier: 1,
      cost: 1,
      effects: [{ kind: 'stat', stat: 'maxHp', add: 150 }],
      desc: '+150 max HP',
    },
    {
      id: 'hot-streak',
      name: 'Hot Streak',
      tier: 2,
      cost: 2,
      requires: ['pyromantic-affinity'],
      effects: [{ kind: 'stat', stat: 'critChance', add: 0.02 }],
      desc: '+2% crit chance',
    },
    {
      id: 'nimble-caster',
      name: 'Nimble Caster',
      tier: 2,
      cost: 1,
      requires: ['mental-focus'],
      effects: [{ kind: 'behavior', stat: 'damageWhileMoving', add: 0.15 }],
      desc: '+15% damage while moving',
    },
    {
      id: 'permafrost',
      name: 'Permafrost',
      tier: 2,
      cost: 2,
      requires: ['frost-attunement'],
      effects: [
        { kind: 'stat', stat: 'armor', add: 40 },
        { kind: 'stat', stat: 'maxHp', add: 100 },
      ],
      desc: '+40 armor, +100 max HP',
    },
    {
      id: 'glacial-barrier',
      name: 'Glacial Barrier',
      tier: 2,
      cost: 1,
      requires: ['frost-attunement'],
      effects: [{ kind: 'control', control: 'barrier-policy' }],
      desc: 'unlocks the Barrier policy intent (proactive Ice Barrier)',
    },
    {
      id: 'pyroclasm',
      name: 'Pyroclasm',
      tier: 3,
      cost: 2,
      requires: ['hot-streak'],
      effects: [{ kind: 'ability', abilityId: 'pyroclasm' }],
      desc: 'grants Pyroclasm, a second burst cooldown',
    },
    {
      id: 'winters-ward',
      name: "Winter's Ward",
      tier: 3,
      cost: 2,
      requires: ['glacial-barrier'],
      effects: [{ kind: 'stat', stat: 'maxHp', add: 200 }],
      desc: '+200 max HP',
    },
  ],
  abilities: {
    pyroclasm: {
      id: 'pyroclasm',
      name: 'Pyroclasm',
      castTimeMs: 0,
      cooldownMs: 60_000,
      offGcd: true,
      effect: { kind: 'buff', buffId: 'pyroclasm', durationMs: 12_000, damageMult: 1.1 },
      tags: ['burst'],
    },
  },
};

/** Named reference builds for the CLI and tests (7 points each). */
export const TALENT_BUILDS: Record<string, string[]> = {
  throughput: ['pyromantic-affinity', 'hot-streak', 'pyroclasm', 'mental-focus', 'nimble-caster'],
  defense: ['frost-attunement', 'permafrost', 'glacial-barrier', 'winters-ward', 'mental-focus'],
};
