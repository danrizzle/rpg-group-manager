import type { CompPassiveDefinition, GroupCdDefinition } from '../model/comp';

/**
 * v1 comp synergies (GDD §4), sized to the 3-character dungeon roster.
 * Battle Shout auto-fires at pull under the automatic burst policy (Law 2 —
 * the default plan's burst window); plans and calls fire it deliberately.
 */

export const GROUP_CDS: GroupCdDefinition[] = [
  {
    id: 'battle-shout',
    name: 'Battle Shout',
    requires: { warrior: 1 },
    grantsTo: 'warrior',
    ability: {
      id: 'battle-shout',
      name: 'Battle Shout',
      castTimeMs: 0,
      cooldownMs: 180_000,
      offGcd: true,
      effect: { kind: 'buff', buffId: 'battle-shout', durationMs: 12_000, damageMult: 1.1, target: 'party' },
      tags: ['burst'],
    },
    desc: 'A warrior in the party: +10% damage for everyone for 12 s (burst window).',
  },
  {
    id: 'rekindle',
    name: 'Rekindle',
    // Raid-gated (a second caster carries the wipe-saver): the 3-char trinity
    // has one mage, so this never unlocks there and its streams stay identical.
    requires: { mage: 2 },
    grantsTo: 'mage',
    ability: {
      id: 'rekindle',
      name: 'Rekindle',
      castTimeMs: 0,
      cooldownMs: 600_000, // once per fight
      chargesPerFight: 1,
      effect: { kind: 'resurrect', hpPct: 0.4 },
      tags: ['battle-res'],
    },
    desc: 'Two casters present: revive a fallen ally once per fight at 40% HP (GDD §3 battle res).',
  },
];

export const COMP_PASSIVES: CompPassiveDefinition[] = [
  {
    id: 'well-drilled-team',
    name: 'Well-Drilled Team',
    minDistinctRoles: 3,
    bonuses: { discipline: 5 },
    desc: 'Tank, healer and DPS present: +5 discipline for everyone.',
  },
];
