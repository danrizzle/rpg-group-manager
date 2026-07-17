import { describe, expect, it } from 'vitest';
import {
  LEVEL_CAP,
  abilitiesUpToLevel,
  levelForXp,
  nakedBaseForLevel,
  totalXpToReach,
  xpToNext,
} from '../src/model/progression';
import { makeMage } from '../src/content/classes/mage';
import { GEAR_SETS } from '../src/content/items';

describe('level-indexed naked base', () => {
  it('level 10 reproduces the historical baseline (60 SP / 2,100 HP)', () => {
    const base = nakedBaseForLevel(LEVEL_CAP);
    expect(base.spellPower).toBe(60);
    expect(base.maxHp).toBe(2100);
    expect(base.critChance).toBe(0.1);
    expect(base.armor).toBe(60);
  });

  it('level 1 matches the GDD endpoint (30 SP / 1,200 HP)', () => {
    const base = nakedBaseForLevel(1);
    expect(base.spellPower).toBe(30);
    expect(base.maxHp).toBe(1200);
  });

  it('the default Mage (level 10) is unchanged: naked base equals today', () => {
    const naked = makeMage(undefined, GEAR_SETS['naked']).stats;
    expect(naked.spellPower).toBe(60);
    expect(naked.maxHp).toBe(2100);
  });

  it('lower levels scale strictly down in HP and spell power', () => {
    for (let l = 2; l <= LEVEL_CAP; l++) {
      expect(nakedBaseForLevel(l).spellPower).toBeGreaterThan(nakedBaseForLevel(l - 1).spellPower);
      expect(nakedBaseForLevel(l).maxHp).toBeGreaterThan(nakedBaseForLevel(l - 1).maxHp);
    }
  });
});

describe('XP curve', () => {
  it('xpToNext is strictly increasing up to the cap, then Infinity', () => {
    for (let l = 2; l < LEVEL_CAP; l++) {
      expect(xpToNext(l)).toBeGreaterThan(xpToNext(l - 1));
    }
    expect(xpToNext(LEVEL_CAP)).toBe(Infinity);
  });

  it('levelForXp inverts the cumulative curve', () => {
    expect(levelForXp(0)).toBe(1);
    for (let l = 1; l <= LEVEL_CAP; l++) {
      expect(levelForXp(totalXpToReach(l))).toBe(l);
    }
    // Just short of the next threshold stays on the current level.
    expect(levelForXp(totalXpToReach(3) - 1)).toBe(2);
  });
});

describe('unlock arc gates the kit', () => {
  it('level 1 knows only Fireball; the cap knows the full kit', () => {
    expect(abilitiesUpToLevel(1)).toEqual(['fireball']);
    const capKit = abilitiesUpToLevel(LEVEL_CAP);
    expect(capKit).toEqual(
      expect.arrayContaining(['fireball', 'healing-potion', 'ice-barrier', 'flamestrike', 'fire-blast', 'combustion']),
    );
    expect(capKit).toHaveLength(6);
  });

  it('makeMage only carries abilities it has learned at that level', () => {
    expect(makeMage(undefined, GEAR_SETS['naked'], 1).abilities.map((a) => a.id)).toEqual(['fireball']);
    const l4 = makeMage(undefined, GEAR_SETS['naked'], 4).abilities.map((a) => a.id);
    expect(l4).toContain('flamestrike');
    expect(l4).not.toContain('fire-blast'); // unlocks at 5
    expect(l4).not.toContain('combustion'); // unlocks at 7
    expect(makeMage(undefined, GEAR_SETS['naked'], LEVEL_CAP).abilities).toHaveLength(6);
  });
});
