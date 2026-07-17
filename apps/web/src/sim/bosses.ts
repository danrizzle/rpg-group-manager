import {
  makeBanditWarlord,
  makeCinderMaw,
  makeEmberwing,
  type BossDefinition,
} from '@rpg/engine';

/**
 * Boss registry shared by the store (real fights) and the sim worker
 * (training dummy targets). Lives outside worker.ts so importing it into
 * the main bundle doesn't drag in the worker's `self.onmessage` side effect.
 */

export const BOSS_FACTORIES: Record<string, () => BossDefinition> = {
  'cinder-maw': makeCinderMaw,
  'bandit-warlord': makeBanditWarlord,
  emberwing: makeEmberwing,
};

/** Dummy-sim targets, in map order. GDD §3: known mechanics are simulatable. */
export const SIM_TARGETS: { id: string; name: string }[] = [
  { id: 'bandit-warlord', name: 'Bandit Warlord' },
  { id: 'emberwing', name: 'Emberwing' },
  { id: 'cinder-maw', name: 'Cinder Maw' },
];
