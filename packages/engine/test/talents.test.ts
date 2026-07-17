import { describe, expect, it } from 'vitest';
import { makeMage } from '../src/content/classes/mage';
import { MAGE_TALENTS, TALENT_BUILDS } from '../src/content/classes/mageTalents';
import { GEAR_SETS } from '../src/content/items';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { DEFAULT_STANCE } from '../src/model/stance';
import {
  TALENT_POINT_POOL,
  applyTalents,
  sanitizeTalentSelection,
  talentPointsForLevel,
  unlockedControls,
  validateTalentSelection,
} from '../src/model/talent';
import { runFight } from '../src/sim/engine';
import { runMonteCarlo } from '../src/analysis/montecarlo';

describe('talents', () => {
  it('no talents leaves makeMage unchanged', () => {
    expect(makeMage(undefined, GEAR_SETS['default']!, 10, [])).toEqual(makeMage());
  });

  it('tree is internally consistent', () => {
    const ids = MAGE_TALENTS.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    const byId = new Map(MAGE_TALENTS.nodes.map((n) => [n.id, n]));
    for (const node of MAGE_TALENTS.nodes) {
      for (const req of node.requires ?? []) {
        const parent = byId.get(req);
        expect(parent, `${node.id} requires missing ${req}`).toBeDefined();
        expect(parent!.tier).toBeLessThan(node.tier);
      }
      for (const e of node.effects) {
        if (e.kind === 'ability') expect(MAGE_TALENTS.abilities[e.abilityId]).toBeDefined();
      }
    }
    for (const [name, build] of Object.entries(TALENT_BUILDS)) {
      expect(
        () => validateTalentSelection(MAGE_TALENTS, build, TALENT_POINT_POOL),
        `build ${name}`,
      ).not.toThrow();
    }
  });

  it('stat and behavior effects fold on top of gear and clamp', () => {
    const base = makeMage();
    // Read the bonus from the tree so balance retunes don't break the fold test.
    const affinityEffect = MAGE_TALENTS.nodes.find((n) => n.id === 'pyromantic-affinity')!.effects[0]!;
    const spBonus = affinityEffect.kind === 'stat' ? affinityEffect.add : 0;
    const fire = makeMage(undefined, undefined, 10, ['pyromantic-affinity']);
    expect(spBonus).toBeGreaterThan(0);
    expect(fire.stats.spellPower).toBe(base.stats.spellPower + spBonus);
    const focused = makeMage({ discipline: 95 }, undefined, 10, ['mental-focus']);
    expect(focused.behavior.discipline).toBe(100);
  });

  it('ability talents append to the kit', () => {
    const mage = makeMage(undefined, undefined, 10, TALENT_BUILDS['throughput']!);
    expect(mage.abilities.map((a) => a.id)).toContain('pyroclasm');
    expect(makeMage().abilities.map((a) => a.id)).not.toContain('pyroclasm');
  });

  it('control talents unlock controls', () => {
    expect(unlockedControls(MAGE_TALENTS, TALENT_BUILDS['defense']!).has('barrier-policy')).toBe(true);
    expect(unlockedControls(MAGE_TALENTS, []).size).toBe(0);
  });

  it('validation rejects bad selections', () => {
    const v = (ids: string[], budget = TALENT_POINT_POOL) =>
      validateTalentSelection(MAGE_TALENTS, ids, budget);
    expect(() => v(['nope'])).toThrow(/unknown/);
    expect(() => v(['mental-focus', 'mental-focus'])).toThrow(/duplicate/);
    expect(() => v(['hot-streak'])).toThrow(/requires/);
    const everything = MAGE_TALENTS.nodes.map((n) => n.id);
    expect(() => v(everything)).toThrow(/budget/);
    expect(() => makeMage(undefined, undefined, 9, ['mental-focus'])).toThrow(/budget/);
  });

  it('sanitize repairs untrusted selections deterministically', () => {
    const s = (ids: string[], budget = TALENT_POINT_POOL) =>
      sanitizeTalentSelection(MAGE_TALENTS, ids, budget);
    expect(s(['nope', 'mental-focus'])).toEqual(['mental-focus']);
    expect(s(['hot-streak'])).toEqual([]);
    expect(s(['mental-focus', 'mental-focus'])).toEqual(['mental-focus']);
    expect(s(TALENT_BUILDS['defense']!, 0)).toEqual([]);
    const everything = MAGE_TALENTS.nodes.map((n) => n.id);
    const repaired = s(everything);
    expect(() => validateTalentSelection(MAGE_TALENTS, repaired, TALENT_POINT_POOL)).not.toThrow();
  });

  it('talent points arrive at the cap', () => {
    expect(talentPointsForLevel(9)).toBe(0);
    expect(talentPointsForLevel(10)).toBe(TALENT_POINT_POOL);
  });

  it('applyTalents with no nodes is a structural copy', () => {
    const mage = makeMage();
    const out = applyTalents(mage.stats, mage.behavior, mage.abilities, MAGE_TALENTS, []);
    expect(out.stats).toEqual(mage.stats);
    expect(out.behavior).toEqual(mage.behavior);
    expect(out.abilities).toEqual(mage.abilities);
  });

  it('a throughput build raises the kill probability undergeared', () => {
    const run = (talents: string[]) =>
      runMonteCarlo(
        {
          player: makeMage(undefined, GEAR_SETS['starter']!, 10, talents),
          boss: makeCinderMaw(),
          stance: { ...DEFAULT_STANCE },
        },
        200,
        21,
      ).killRate;
    expect(run(TALENT_BUILDS['throughput']!)).toBeGreaterThan(run([]));
  });

  it('proactive barrier trades DPS for survival', () => {
    const run = (barrierPolicy: 'reactive' | 'proactive') =>
      runMonteCarlo(
        {
          player: makeMage(undefined, GEAR_SETS['starter']!, 10, TALENT_BUILDS['defense']!),
          boss: makeCinderMaw(),
          stance: { ...DEFAULT_STANCE, offense: 0.2, barrierPolicy },
        },
        200,
        7,
      );
    const reactive = run('reactive');
    const proactive = run('proactive');
    expect(proactive.lossBreakdown.playerDeath ?? 0).toBeLessThanOrEqual(
      reactive.lossBreakdown.playerDeath ?? 0,
    );
    expect(proactive.dps.mean).toBeLessThan(reactive.dps.mean);
  });

  it('talent builds stay fully deterministic', () => {
    const setup = {
      player: makeMage(undefined, GEAR_SETS['starter']!, 10, TALENT_BUILDS['defense']!),
      boss: makeCinderMaw(),
      stance: { ...DEFAULT_STANCE, barrierPolicy: 'proactive' as const },
      seed: 42,
    };
    expect(runFight(setup).events).toEqual(runFight(setup).events);
  });

  it("explicit 'reactive' matches the default stance byte for byte", () => {
    const run = (stance: typeof DEFAULT_STANCE) =>
      runFight({ player: makeMage(), boss: makeCinderMaw(), stance, seed: 42 });
    expect(run({ ...DEFAULT_STANCE, barrierPolicy: 'reactive' }).events).toEqual(
      run({ ...DEFAULT_STANCE }).events,
    );
  });
});
