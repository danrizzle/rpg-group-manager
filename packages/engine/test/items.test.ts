import { describe, expect, it } from 'vitest';
import { GEAR_SETS, ITEMS, ITEMS_BY_ID } from '../src/content/items';
import { makeMage } from '../src/content/classes/mage';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runMonteCarlo } from '../src/analysis/montecarlo';

describe('items & gear', () => {
  it('default set reproduces the pre-gear balance exactly', () => {
    const mage = makeMage();
    expect(mage.stats.spellPower).toBe(100);
    expect(mage.stats.maxHp).toBe(2400);
    expect(mage.stats.critChance).toBeCloseTo(0.15, 10);
    expect(mage.stats.armor).toBe(120);
  });

  it('every set references only valid items with matching slots', () => {
    for (const [name, set] of Object.entries(GEAR_SETS)) {
      const slots = set.map((i) => i.slot);
      expect(new Set(slots).size, `duplicate slot in set ${name}`).toBe(slots.length);
      for (const item of set) expect(ITEMS_BY_ID[item.id]).toBe(item);
    }
    expect(ITEMS.length).toBe(new Set(ITEMS.map((i) => i.id)).size);
  });

  it('resist gear lands on effective stats', () => {
    const mage = makeMage(undefined, [ITEMS_BY_ID['fireproof-mantle']!]);
    expect(mage.stats.resistances.fire).toBe(25);
  });

  it('behavior-stat gear adds to earned stats and clamps', () => {
    const focused = makeMage({ discipline: 95 }, [ITEMS_BY_ID['band-of-focus']!]);
    expect(focused.behavior.discipline).toBe(100);
    const anklet = makeMage({ damageWhileMoving: 0.9 }, [ITEMS_BY_ID['quickstep-anklet']!]);
    expect(anklet.behavior.damageWhileMoving).toBe(1);
  });

  it('gear moves the kill probability: naked < default < best', () => {
    const run = (set: string) =>
      runMonteCarlo(
        { player: makeMage(undefined, GEAR_SETS[set]!), boss: makeCinderMaw(), stance: { ...DEFAULT_STANCE } },
        120,
        21,
      ).killRate;
    const naked = run('naked');
    const def = run('default');
    const best = run('best');
    expect(naked).toBeLessThan(def);
    expect(def).toBeLessThan(best);
    expect(best).toBeGreaterThan(0.9);
  });
});
