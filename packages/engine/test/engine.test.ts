import { describe, expect, it } from 'vitest';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeMage } from '../src/content/classes/mage';
import { DEFAULT_STANCE } from '../src/model/stance';
import { PLAYER_ID, runFight, type SoloFightSetup } from '../src/sim/engine';
import { summarizeRun } from '../src/analysis/metrics';

const baseSetup = (seed: number): SoloFightSetup => ({
  player: makeMage(),
  boss: makeCinderMaw(),
  stance: { ...DEFAULT_STANCE },
  seed,
});

describe('runFight', () => {
  it('is fully deterministic: same seed, identical event stream', () => {
    const a = runFight(baseSetup(42));
    const b = runFight(baseSetup(42));
    expect(a.result).toBe(b.result);
    expect(a.events).toEqual(b.events);
  });

  it('varies across seeds (rolled RNG, GDD §3)', () => {
    const durations = new Set(
      Array.from({ length: 10 }, (_, i) => runFight(baseSetup(i)).durationMs),
    );
    expect(durations.size).toBeGreaterThan(1);
  });

  it('always terminates with a fightEnd event matching the result', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runFight(baseSetup(seed));
      const last = r.events[r.events.length - 1]!;
      expect(last.type).toBe('fightEnd');
      expect(last.meta?.['result']).toBe(r.result);
    }
  });

  it('loses to enrage when the boss has far too much HP', () => {
    const setup = baseSetup(1);
    setup.boss = makeCinderMaw({ hp: 10_000_000 });
    const r = runFight(setup);
    expect(['enrage', 'playerDeath', 'timeout']).toContain(r.result);
    expect(r.events.some((e) => e.type === 'enrage' || e.type === 'death')).toBe(true);
  });

  it('uses the potion only below the configured threshold', () => {
    const setup = baseSetup(3);
    setup.stance.potionThresholdPct = 40;
    const r = runFight(setup);
    const maxHp = setup.player.stats.maxHp;
    // Reconstruct HP from the stream and check it was below threshold
    // whenever the potion fired.
    let hp = maxHp;
    for (const e of r.events) {
      if (e.type === 'damage' && e.target === PLAYER_ID) hp -= e.value ?? 0;
      if (e.type === 'heal' && e.target === PLAYER_ID) {
        if (e.meta?.['abilityId'] === 'healing-potion') {
          expect(hp / maxHp).toBeLessThan(0.4);
        }
        hp += e.value ?? 0;
      }
    }
  });

  it('never uses the potion with threshold 0', () => {
    const setup = baseSetup(4);
    setup.stance.potionThresholdPct = 0;
    const r = runFight(setup);
    const potionHeals = r.events.filter(
      (e) => e.type === 'heal' && e.meta?.['abilityId'] === 'healing-potion',
    );
    expect(potionHeals).toHaveLength(0);
  });

  it('reaches phase 2 and spawns adds on kills', () => {
    for (let seed = 0; seed < 30; seed++) {
      const r = runFight(baseSetup(seed));
      if (r.result !== 'kill') continue;
      expect(r.events.some((e) => e.type === 'phaseChange')).toBe(true);
      expect(r.events.some((e) => e.type === 'addSpawn')).toBe(true);
      return;
    }
    throw new Error('no kill in 30 seeds — balance is broken');
  });

  it('records mistakes in the event stream', () => {
    // Low discipline should produce plenty of mistakes across a few runs.
    let mistakes = 0;
    for (let seed = 0; seed < 5; seed++) {
      const setup = baseSetup(seed);
      setup.player = makeMage({ discipline: 0 });
      mistakes += runFight(setup).events.filter((e) => e.type === 'mistake').length;
    }
    expect(mistakes).toBeGreaterThan(0);
  });

  it('event streams are JSON round-trippable', () => {
    const r = runFight(baseSetup(5));
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
  });
});

describe('stances change outcomes', () => {
  const runsWith = (targeting: number, seeds: number[]) =>
    seeds.map((seed) => {
      const setup = baseSetup(seed);
      setup.stance.targeting = targeting;
      return runFight(setup);
    });

  it('AoE stance uses flamestrike far more than single-target stance', () => {
    const seeds = [0, 1, 2, 3, 4];
    const count = (rs: ReturnType<typeof runsWith>, id: string) =>
      rs.flatMap((r) => r.events).filter((e) => e.type === 'castEnd' && e.meta?.['abilityId'] === id).length;
    const aoe = runsWith(0.9, seeds);
    const st = runsWith(0.1, seeds);
    expect(count(aoe, 'flamestrike')).toBeGreaterThan(count(st, 'flamestrike') * 2);
  });
});

describe('summarizeRun', () => {
  it('computes DPS purely from the event stream', () => {
    const r = runFight(baseSetup(6));
    const s = summarizeRun(r);
    const streamDamage = r.events
      .filter((e) => e.type === 'damage' && e.source === PLAYER_ID)
      .reduce((sum, e) => sum + (e.value ?? 0), 0);
    expect(s.damageDone).toBe(streamDamage);
    expect(s.dps).toBeCloseTo(streamDamage / (r.durationMs / 1000), 5);
  });
});
