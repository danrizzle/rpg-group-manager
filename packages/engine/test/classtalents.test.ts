import { describe, expect, it } from 'vitest';
import { makeWarrior } from '../src/content/classes/warrior';
import { makePriest } from '../src/content/classes/priest';
import { WARRIOR_TALENTS, WARRIOR_TALENT_BUILDS } from '../src/content/classes/warriorTalents';
import { PRIEST_TALENTS, PRIEST_TALENT_BUILDS } from '../src/content/classes/priestTalents';
import { validateTalentSelection } from '../src/model/talent';

/** Slice-6: warrior & priest talent trees fold like the mage's. */

describe('warrior talents', () => {
  it('empty selection leaves the base kit and stats unchanged', () => {
    const bare = makeWarrior();
    const empty = makeWarrior(undefined, undefined, 10, []);
    expect(empty.stats).toEqual(bare.stats);
    expect(empty.abilities.map((a) => a.id)).toEqual(bare.abilities.map((a) => a.id));
  });

  it('the reference builds are legal within the 8-point pool', () => {
    for (const ids of Object.values(WARRIOR_TALENT_BUILDS)) {
      expect(() => validateTalentSelection(WARRIOR_TALENTS, ids, 8)).not.toThrow();
    }
  });

  it('the threat build raises attack power and grants Challenging Shout (a taunt)', () => {
    const t = makeWarrior(undefined, undefined, 10, WARRIOR_TALENT_BUILDS['threat']!);
    expect(t.stats.attackPower).toBeGreaterThan(makeWarrior().stats.attackPower);
    const shout = t.abilities.find((a) => a.id === 'challenging-shout');
    expect(shout?.effect.kind).toBe('taunt');
  });
});

describe('priest talents', () => {
  it('empty selection leaves the base kit and stats unchanged', () => {
    const bare = makePriest();
    const empty = makePriest(undefined, undefined, 10, []);
    expect(empty.stats).toEqual(bare.stats);
    expect(empty.abilities.map((a) => a.id)).toEqual(bare.abilities.map((a) => a.id));
  });

  it('the throughput build grants Purify (a dispel) and raises healing power', () => {
    const t = makePriest(undefined, undefined, 10, PRIEST_TALENT_BUILDS['throughput']!);
    expect(t.stats.healingPower).toBeGreaterThan(makePriest().stats.healingPower);
    const purify = t.abilities.find((a) => a.id === 'purify');
    expect(purify?.effect.kind).toBe('dispel');
  });

  it('the fortitude build grants Power Word: Barrier (a party absorb)', () => {
    const t = makePriest(undefined, undefined, 10, PRIEST_TALENT_BUILDS['fortitude']!);
    const pwb = t.abilities.find((a) => a.id === 'pw-barrier');
    expect(pwb?.effect.kind).toBe('buff');
    expect(pwb?.tags).toContain('defensive');
  });
});
