import type { TalentTree } from '../../model/talent';

/**
 * v1 Priest talent tree (GDD §2): a throughput path and a survival path. The
 * capstones grant Purify (a dispel — GDD §2 "dispel relevant from raid tier")
 * and Power Word: Barrier (a raid absorb CD), both slice-4 machinery. Total
 * cost (13) exceeds the 8-point pool. Numbers are placeholder balance.
 */
export const PRIEST_TALENTS: TalentTree = {
  classId: 'priest',
  nodes: [
    { id: 'divine-fury', name: 'Divine Fury', tier: 1, cost: 1, effects: [{ kind: 'stat', stat: 'healingPower', add: 6 }], desc: '+6 healing power' },
    { id: 'inner-fire', name: 'Inner Fire', tier: 1, cost: 1, effects: [{ kind: 'stat', stat: 'maxHp', add: 150 }], desc: '+150 max HP' },
    { id: 'meditation', name: 'Meditation', tier: 1, cost: 1, effects: [{ kind: 'behavior', stat: 'discipline', add: 10 }], desc: '+10 discipline' },
    { id: 'empowered-healing', name: 'Empowered Healing', tier: 2, cost: 2, requires: ['divine-fury'], effects: [{ kind: 'stat', stat: 'critChance', add: 0.03 }], desc: '+3% crit chance' },
    { id: 'spirit-shell', name: 'Spirit Shell', tier: 2, cost: 2, requires: ['inner-fire'], effects: [{ kind: 'stat', stat: 'armor', add: 40 }, { kind: 'stat', stat: 'maxHp', add: 100 }], desc: '+40 armor, +100 max HP' },
    { id: 'surge-of-light', name: 'Surge of Light', tier: 2, cost: 1, requires: ['meditation'], effects: [{ kind: 'behavior', stat: 'damageWhileMoving', add: 0.1 }], desc: '+10% output while moving' },
    { id: 'purify', name: 'Purify', tier: 3, cost: 2, requires: ['divine-fury'], effects: [{ kind: 'ability', abilityId: 'purify' }], desc: 'grants Purify — cleanse a harmful debuff off an ally' },
    { id: 'power-barrier', name: 'Power Word: Barrier', tier: 3, cost: 2, requires: ['spirit-shell'], effects: [{ kind: 'ability', abilityId: 'pw-barrier' }], desc: 'grants Power Word: Barrier — a raid-wide absorb CD' },
    { id: 'clarity', name: 'Clarity', tier: 3, cost: 1, requires: ['meditation'], effects: [{ kind: 'behavior', stat: 'discipline', add: 8 }], desc: '+8 discipline' },
  ],
  abilities: {
    purify: {
      id: 'purify',
      name: 'Purify',
      castTimeMs: 0,
      cooldownMs: 8000,
      effect: { kind: 'dispel', dispelTypes: ['magic', 'poison', 'disease', 'curse'] },
      tags: ['dispel'],
    },
    'pw-barrier': {
      id: 'pw-barrier',
      name: 'Power Word: Barrier',
      castTimeMs: 0,
      cooldownMs: 180_000,
      effect: { kind: 'buff', buffId: 'pw-barrier', durationMs: 10_000, absorb: 1200, target: 'party' },
      tags: ['defensive'],
    },
  },
};

/** Named reference builds (≤8 points) for the CLI and tests. */
export const PRIEST_TALENT_BUILDS: Record<string, string[]> = {
  throughput: ['divine-fury', 'empowered-healing', 'purify', 'meditation', 'surge-of-light'],
  fortitude: ['inner-fire', 'spirit-shell', 'power-barrier', 'meditation', 'clarity'],
};
