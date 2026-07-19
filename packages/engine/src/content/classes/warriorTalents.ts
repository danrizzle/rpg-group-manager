import type { TalentTree } from '../../model/talent';

/**
 * v1 Warrior talent tree (GDD §2): a threat path and a survival path, bridged
 * by discipline. Total cost (13) exceeds the 8-point pool so builds are real
 * choices. The capstone grants Challenging Shout — a taunt (slice-4 machinery),
 * the tank-swap tool a 2-tank raid needs. Numbers are placeholder balance.
 */
export const WARRIOR_TALENTS: TalentTree = {
  classId: 'warrior',
  nodes: [
    { id: 'deep-wounds', name: 'Deep Wounds', tier: 1, cost: 1, effects: [{ kind: 'stat', stat: 'attackPower', add: 6 }], desc: '+6 attack power (more threat)' },
    { id: 'toughness', name: 'Toughness', tier: 1, cost: 1, effects: [{ kind: 'stat', stat: 'maxHp', add: 300 }], desc: '+300 max HP' },
    { id: 'shield-mastery', name: 'Shield Mastery', tier: 1, cost: 1, effects: [{ kind: 'stat', stat: 'armor', add: 50 }], desc: '+50 armor' },
    { id: 'incite', name: 'Incite', tier: 2, cost: 2, requires: ['deep-wounds'], effects: [{ kind: 'stat', stat: 'critChance', add: 0.03 }], desc: '+3% crit chance' },
    { id: 'bulwark', name: 'Bulwark', tier: 2, cost: 2, requires: ['shield-mastery'], effects: [{ kind: 'stat', stat: 'armor', add: 60 }, { kind: 'stat', stat: 'maxHp', add: 200 }], desc: '+60 armor, +200 max HP' },
    { id: 'vigilance', name: 'Vigilance', tier: 2, cost: 1, requires: ['toughness'], effects: [{ kind: 'behavior', stat: 'discipline', add: 10 }], desc: '+10 discipline' },
    { id: 'pummel', name: 'Pummel', tier: 2, cost: 1, requires: ['deep-wounds'], effects: [{ kind: 'ability', abilityId: 'pummel' }], desc: 'grants Pummel — interrupt a boss cast in its window' },
    { id: 'challenging-shout', name: 'Challenging Shout', tier: 3, cost: 2, requires: ['incite'], effects: [{ kind: 'ability', abilityId: 'challenging-shout' }], desc: 'grants Challenging Shout — a taunt to pull the boss off a co-tank' },
    { id: 'last-stand', name: 'Last Stand', tier: 3, cost: 2, requires: ['bulwark'], effects: [{ kind: 'stat', stat: 'maxHp', add: 400 }], desc: '+400 max HP' },
    { id: 'unyielding', name: 'Unyielding', tier: 3, cost: 1, requires: ['vigilance'], effects: [{ kind: 'behavior', stat: 'discipline', add: 8 }], desc: '+8 discipline' },
  ],
  abilities: {
    'challenging-shout': {
      id: 'challenging-shout',
      name: 'Challenging Shout',
      castTimeMs: 0,
      cooldownMs: 30_000,
      effect: { kind: 'taunt', durationMs: 6000 },
      tags: ['taunt'],
    },
    pummel: {
      id: 'pummel',
      name: 'Pummel',
      castTimeMs: 0,
      cooldownMs: 15_000,
      effect: { kind: 'interrupt' },
      tags: ['interrupt'],
    },
  },
};

/** Named reference builds (≤8 points) for the CLI and tests. */
export const WARRIOR_TALENT_BUILDS: Record<string, string[]> = {
  threat: ['deep-wounds', 'incite', 'challenging-shout', 'toughness', 'vigilance'],
  survival: ['shield-mastery', 'bulwark', 'last-stand', 'toughness', 'vigilance'],
};
