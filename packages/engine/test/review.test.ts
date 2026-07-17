import { describe, expect, it } from 'vitest';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeMage } from '../src/content/classes/mage';
import { CONSUMABLES_BY_ID } from '../src/content/consumables';
import { GEAR_SETS } from '../src/content/items';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type FightSetup } from '../src/sim/engine';
import { fightReview, summarizeRun } from '../src/analysis/metrics';

const POTION = CONSUMABLES_BY_ID['healing-potion']!;
const FLASK = CONSUMABLES_BY_ID['flask-of-embers']!;

const run = (setup: Omit<FightSetup, 'seed'>, seed: number) => {
  const result = runFight({ ...setup, seed });
  return { result, review: fightReview(result, setup) };
};

describe('fightReview', () => {
  it('a kill has no wipe and mirrors summarizeRun', () => {
    const setup = { player: makeMage(), boss: makeCinderMaw(), stance: { ...DEFAULT_STANCE } };
    for (let seed = 0; seed < 20; seed++) {
      const { result, review } = run(setup, seed);
      if (result.result !== 'kill') continue;
      expect(review.wipe).toBeNull();
      expect(review.summary).toEqual(summarizeRun(result));
      return;
    }
    throw new Error('no kill in 20 seeds');
  });

  it('counts consumable usage from the stream: passives once, potions per charge', () => {
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], [POTION, FLASK]),
      boss: makeCinderMaw(),
      stance: { ...DEFAULT_STANCE, potionThresholdPct: 65 },
    };
    for (let seed = 0; seed < 10; seed++) {
      const { result, review } = run(setup, seed);
      expect(review.consumablesUsed['flask-of-embers']).toBe(1);
      const potions = review.consumablesUsed['healing-potion'] ?? 0;
      expect(potions).toBeLessThanOrEqual(2);
      const streamCount = result.events.filter(
        (e) => e.type === 'heal' && e.meta?.['abilityId'] === 'healing-potion',
      ).length;
      expect(potions).toBe(streamCount);
    }
  });

  it('a death with empty slots says no-potion-equipped', () => {
    // Overwhelming melee guarantees a quick death.
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], []),
      boss: makeCinderMaw({ meleeDamage: 500 }),
      stance: { ...DEFAULT_STANCE },
    };
    const { result, review } = run(setup, 1);
    expect(result.result).toBe('playerDeath');
    expect(review.wipe?.kind).toBe('playerDeath');
    expect(review.wipe?.killedBy).toBeDefined();
    expect(review.wipe?.potionNote).toBe('no-potion-equipped');
  });

  it('a death after both charges says out-of-charges', () => {
    // High sustain + max threshold: the potion fires on cooldown until its
    // 2 charges are gone, then the player dies.
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], [POTION]),
      boss: makeCinderMaw({ meleeDamage: 60 }),
      stance: { ...DEFAULT_STANCE, potionThresholdPct: 100 },
    };
    for (let seed = 0; seed < 20; seed++) {
      const { result, review } = run(setup, seed);
      if (result.result === 'kill') continue;
      if ((review.consumablesUsed['healing-potion'] ?? 0) < 2) continue;
      expect(review.wipe?.potionNote).toBe('out-of-charges');
      return;
    }
    throw new Error('no post-charges death in 20 seeds');
  });

  it('a death with the policy off says potion-disabled', () => {
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], [POTION]),
      boss: makeCinderMaw({ meleeDamage: 120 }),
      stance: { ...DEFAULT_STANCE, potionThresholdPct: 0 },
    };
    const { result, review } = run(setup, 2);
    expect(result.result).toBe('playerDeath');
    expect(review.wipe?.potionNote).toBe('potion-disabled');
  });

  it('an enrage wipe reports how close it was', () => {
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], []),
      boss: makeCinderMaw({ enrageAtMs: 60_000 }),
      stance: { ...DEFAULT_STANCE },
    };
    for (let seed = 0; seed < 10; seed++) {
      const { result, review } = run(setup, seed);
      if (result.result !== 'enrage') continue;
      expect(review.wipe?.kind).toBe('enrage');
      expect(review.wipe?.bossHpPctLeft).toBeGreaterThan(0);
      expect(review.wipe?.bossHpPctLeft).toBeLessThanOrEqual(100);
      return;
    }
    throw new Error('no enrage in 10 seeds');
  });
});
