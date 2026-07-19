import { describe, expect, it } from 'vitest';
import { makeMage } from '../src/content/classes/mage';
import { makeWarrior } from '../src/content/classes/warrior';
import { makePriest } from '../src/content/classes/priest';
import { WARRIOR_TALENTS, WARRIOR_TALENT_BUILDS } from '../src/content/classes/warriorTalents';
import { PRIEST_TALENTS, PRIEST_TALENT_BUILDS } from '../src/content/classes/priestTalents';
import { validateTalentSelection } from '../src/model/talent';

/** Slice-6: warrior & priest talent trees fold like the mage's. */

/**
 * The kit factories take a PARTIAL behavior override on top of a per-class
 * base. Callers that hand them a filled object silently flatten every class
 * onto whichever defaults they happened to build that object from — which is
 * invisible in the UI and in every aggregate stat, so it needs pinning here.
 */
describe('per-class behavior bases', () => {
  it('each class ships its own damageWhileMoving — they are NOT interchangeable', () => {
    expect(makeMage().behavior.damageWhileMoving).toBe(0.6);
    // Melee keeps swinging on the move; the priest pays the most to reposition.
    expect(makeWarrior().behavior.damageWhileMoving).toBe(0.8);
    expect(makePriest().behavior.damageWhileMoving).toBe(0.5);
  });

  it('a partial override touches only the fields it names', () => {
    for (const make of [makeMage, makeWarrior, makePriest]) {
      const base = make();
      const tweaked = make({ discipline: 70 });
      expect(tweaked.behavior.discipline).toBe(70);
      // The un-named fields must survive at the CLASS's value, not a shared one.
      expect(tweaked.behavior.damageWhileMoving).toBe(base.behavior.damageWhileMoving);
      expect(tweaked.behavior.aoeEfficiency).toBe(base.behavior.aoeEfficiency);
    }
  });
});

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
