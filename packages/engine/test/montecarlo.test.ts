import { describe, expect, it } from 'vitest';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeMage } from '../src/content/classes/mage';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runMonteCarlo } from '../src/analysis/montecarlo';

const setup = {
  player: makeMage(),
  boss: makeCinderMaw(),
  stance: { ...DEFAULT_STANCE },
};

describe('runMonteCarlo', () => {
  it('is reproducible for the same base seed', () => {
    const a = runMonteCarlo(setup, 50, 7);
    const b = runMonteCarlo(setup, 50, 7);
    expect(a.killRate).toBe(b.killRate);
    expect(a.dps).toEqual(b.dps);
  });

  it('produces a sane aggregate at defaults', () => {
    const r = runMonteCarlo(setup, 200, 42);
    expect(r.runs).toHaveLength(200);
    expect(r.killRate).toBeGreaterThan(0.05);
    expect(r.dps.mean).toBeGreaterThan(0);
    expect(r.dps.stddev).toBeGreaterThan(0);
    const losses = Object.values(r.lossBreakdown).reduce((s, n) => s + n, 0);
    expect(losses + Math.round(r.killRate * 200)).toBe(200);
  });

  it('higher discipline improves outcomes', () => {
    const rookie = runMonteCarlo({ ...setup, player: makeMage({ discipline: 5 }) }, 150, 11);
    const veteran = runMonteCarlo({ ...setup, player: makeMage({ discipline: 95 }) }, 150, 11);
    expect(veteran.avgMistakesPerRun).toBeLessThan(rookie.avgMistakesPerRun);
    expect(veteran.killRate).toBeGreaterThanOrEqual(rookie.killRate);
  });

  it('pure single-target stance struggles with the add phase', () => {
    const st = runMonteCarlo({ ...setup, stance: { ...DEFAULT_STANCE, targeting: 0 } }, 150, 13);
    const mixed = runMonteCarlo({ ...setup, stance: { ...DEFAULT_STANCE, targeting: 0.6 } }, 150, 13);
    expect(mixed.killRate).toBeGreaterThan(st.killRate);
  });
});
