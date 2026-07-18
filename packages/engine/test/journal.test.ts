import { describe, expect, it } from 'vitest';
import { makeSlagmaw, makeVulkan } from '../src/content/dungeons/emberForge';
import { makeBanditWarlord } from '../src/content/bosses/banditWarlord';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeMage } from '../src/content/classes/mage';
import { makePriest } from '../src/content/classes/priest';
import { makeWarrior } from '../src/content/classes/warrior';
import {
  EMPTY_KNOWLEDGE,
  discover,
  explorationPct,
  familiarityBonus,
  mechanicsOf,
  redactBoss,
} from '../src/model/journal';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type PartyMember } from '../src/sim/engine';
import { runMonteCarlo } from '../src/analysis/montecarlo';

const party = (): PartyMember[] =>
  [makeWarrior(), makePriest(), makeMage(undefined, undefined, 10, [], [])].map((character) => ({
    character,
    stance: { ...DEFAULT_STANCE },
  }));

describe('mechanicsOf', () => {
  it('lists only mechanics the definition actually contains', () => {
    expect(mechanicsOf(makeSlagmaw()).sort()).toEqual(['enrage', 'movement', 'timeline:molten-eruption']);
    expect(mechanicsOf(makeVulkan()).sort()).toEqual(['adds', 'enrage', 'tantrum', 'timeline:forge-blast']);
    // Bandit Warlord: soft enrage only — no-op slots don't count.
    expect(mechanicsOf(makeBanditWarlord())).toEqual(['enrage']);
  });
});

describe('discover', () => {
  it('a full Vulkan kill reveals the whole kit; a short wipe reveals less', () => {
    const boss = makeVulkan();
    const kill = runFight({ party: party(), boss, seed: 3 });
    expect(kill.result).toBe('kill');
    const k = discover(boss, kill.events);
    expect(k.seen).toContain('adds');
    expect(k.seen).toContain('timeline:forge-blast');
    expect(k.lowestBossHpPct).toBe(0);
    expect(k.attempts).toBe(1);

    // A hopeless wipe (huge damage) dies before the first blast at 30s.
    const wipe = runFight({ party: party(), boss: makeVulkan({ meleeDamage: 3000 }), seed: 1 });
    expect(wipe.result).toBe('playerDeath');
    const kw = discover(makeVulkan({ meleeDamage: 3000 }), wipe.events);
    expect(kw.seen).not.toContain('timeline:forge-blast');
    expect(kw.lowestBossHpPct).toBeGreaterThan(50);
  });

  it('is monotone across attempts and counts wipes', () => {
    const boss = makeSlagmaw();
    let k = EMPTY_KNOWLEDGE;
    for (let seed = 0; seed < 3; seed++) {
      const r = runFight({ party: party(), boss, seed });
      const next = discover(boss, r.events, k);
      for (const key of k.seen) expect(next.seen).toContain(key);
      expect(next.attempts).toBe(k.attempts + 1);
      expect(next.lowestBossHpPct).toBeLessThanOrEqual(k.lowestBossHpPct);
      k = next;
    }
    expect(explorationPct(boss, k)).toBeGreaterThan(0);
  });

  it('drops keys a retuned definition no longer contains', () => {
    const k = { seen: ['timeline:gone', 'enrage'], lowestBossHpPct: 40, attempts: 2 };
    const next = discover(makeBanditWarlord(), [], k);
    expect(next.seen).toEqual(['enrage']);
  });
});

describe('redactBoss', () => {
  it('an unknown boss redacts to melee + HP only', () => {
    const boss = makeVulkan();
    const dummy = redactBoss(boss, EMPTY_KNOWLEDGE);
    expect(dummy.timeline).toEqual([]);
    expect(dummy.addPhase.atHpPct).toBe(0);
    expect(dummy.enrageAtMs).toBeGreaterThan(600_000);
    expect(dummy.hp).toBe(boss.hp);
    expect(dummy.meleeDamage).toBe(boss.meleeDamage);
  });

  it('keeps exactly the discovered mechanics (numbers from the true def)', () => {
    const boss = makeVulkan();
    const partial = { seen: ['adds', 'timeline:forge-blast'], lowestBossHpPct: 30, attempts: 4 };
    const dummy = redactBoss(boss, partial);
    expect(dummy.timeline).toEqual(boss.timeline);
    expect(dummy.addPhase.atHpPct).toBe(boss.addPhase.atHpPct);
    // Tantrum never seen → it can't fire in the sim.
    expect(dummy.addPhase.tantrumAfterMs).toBeGreaterThan(600_000);
    expect(dummy.enrageAtMs).toBeGreaterThan(600_000);
  });

  it('full knowledge reproduces the true fight byte-for-byte', () => {
    const boss = makeSlagmaw();
    // A kill never meets the enrage — full knowledge needs the wall too.
    const k = { seen: mechanicsOf(boss), lowestBossHpPct: 0, attempts: 5 };
    expect(explorationPct(boss, k)).toBe(1);
    const a = runFight({ party: party(), boss, seed: 9 });
    const b = runFight({ party: party(), boss: redactBoss(boss, k), seed: 9 });
    expect(b.events).toEqual(a.events);
  });

  it('the unknown-enrage sim overestimates the kill chance (learning the hard way)', () => {
    // Starter-geared trinity vs Cinder-Maw-strength check: without the
    // enrage in the picture the dummy looks rosier than reality.
    const boss = makeSlagmaw();
    const setup = { party: party(), boss };
    const naive = runMonteCarlo({ ...setup, boss: redactBoss(boss, EMPTY_KNOWLEDGE) }, 150, 42);
    const truth = runMonteCarlo(setup, 150, 42);
    expect(naive.killRate).toBeGreaterThanOrEqual(truth.killRate);
  });
});

describe('familiarity', () => {
  it('grows per attempt and caps', () => {
    expect(familiarityBonus(0)).toBe(0);
    expect(familiarityBonus(3)).toBe(6);
    expect(familiarityBonus(50)).toBe(20);
  });

  it('familiar characters make fewer mistakes (discipline direction)', () => {
    const boss = makeSlagmaw();
    const withFam = (bonus: number): PartyMember[] =>
      [
        makeWarrior({ discipline: 50 + bonus }),
        makePriest({ discipline: 50 + bonus }),
        makeMage({ discipline: 50 + bonus }, undefined, 10, [], []),
      ].map((character) => ({ character, stance: { ...DEFAULT_STANCE } }));
    const fresh = runMonteCarlo({ party: withFam(0), boss }, 100, 7);
    const veteran = runMonteCarlo({ party: withFam(familiarityBonus(10)), boss }, 100, 7);
    expect(veteran.avgMistakesPerRun).toBeLessThan(fresh.avgMistakesPerRun);
  });
});
