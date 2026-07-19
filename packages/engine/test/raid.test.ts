import { describe, expect, it } from 'vitest';
import { makeWarrior } from '../src/content/classes/warrior';
import { makePriest } from '../src/content/classes/priest';
import { makeMage } from '../src/content/classes/mage';
import { WARRIOR_TALENT_BUILDS } from '../src/content/classes/warriorTalents';
import { PRIEST_TALENT_BUILDS } from '../src/content/classes/priestTalents';
import { applyComp, checkRaidComp, CINDERFORGE_COMP_RULE } from '../src/model/comp';
import { COMP_PASSIVES, GROUP_CDS } from '../src/content/groupCds';
import { makeAshkar, makeVael, makeCinderforge } from '../src/content/dungeons/cinderforge';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type CharacterDef, type PartyMember } from '../src/sim/engine';

/** Slice-7: the Cinderforge raid + comp-ratio rules. */

const raidParty = (): PartyMember[] => {
  const wt = WARRIOR_TALENT_BUILDS['threat']!;
  const pt = PRIEST_TALENT_BUILDS['throughput']!;
  const raw: CharacterDef[] = [
    { ...makeWarrior({ discipline: 50 }, undefined, 10, wt), id: 'w1' },
    { ...makeWarrior({ discipline: 50 }, undefined, 10, wt), id: 'w2' },
    { ...makePriest({ discipline: 50 }, undefined, 10, pt), id: 'p1' },
    { ...makePriest({ discipline: 50 }, undefined, 10, pt), id: 'p2' },
    { ...makePriest({ discipline: 50 }, undefined, 10, pt), id: 'p3' },
    ...Array.from({ length: 5 }, (_, i) => ({ ...makeMage({ discipline: 50 }), id: `m${i}` })),
  ];
  const defs = applyComp(raw, GROUP_CDS, COMP_PASSIVES);
  return defs.map((character) => ({ character, stance: { ...DEFAULT_STANCE } }));
};

describe('raid comp rules', () => {
  it('the canonical 2/3/5 comp satisfies the Cinderforge rule', () => {
    const party = raidParty().map((m) => m.character);
    expect(checkRaidComp(party, CINDERFORGE_COMP_RULE).ok).toBe(true);
  });

  it('one tank short is rejected with a reason', () => {
    const party = raidParty().map((m) => m.character);
    const oneTank = party.filter((_, i) => i !== 1); // drop a warrior → 9-man, 1 tank
    const res = checkRaidComp(oneTank, CINDERFORGE_COMP_RULE);
    expect(res.ok).toBe(false);
    expect(res.reasons.join(' ')).toMatch(/tank|members/);
  });
});

describe('Cinderforge', () => {
  it('is a 10-man raid with two bosses', () => {
    const d = makeCinderforge();
    expect(d.partySize).toEqual({ min: 10, max: 10 });
    expect(d.encounters.map((e) => e.id)).toEqual(['ashkar', 'vael']);
  });

  it('Ashkar drives tank swaps (Molten Brand stacks → off-tank taunts)', () => {
    const r = runFight({ party: raidParty(), boss: makeAshkar(), seed: 3 });
    expect(r.result).toBe('kill');
    expect(r.events.some((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'molten-brand')).toBe(true);
    expect(r.events.some((e) => e.type === 'targetChanged' && e.meta?.['reason'] === 'taunt')).toBe(true);
  });

  it('Vael drives dispels (Hex of Ash → Purify healers cleanse)', () => {
    const r = runFight({ party: raidParty(), boss: makeVael(), seed: 3 });
    expect(r.result).toBe('kill');
    expect(r.events.some((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'hex-of-ash')).toBe(true);
    expect(r.events.some((e) => e.type === 'buffRemoved' && e.meta?.['buffId'] === 'hex-of-ash')).toBe(true);
    // Immolation Rite is a real cast (interruptible window).
    expect(r.events.some((e) => e.type === 'castStart' && e.meta?.['abilityId'] === 'immolation-rite')).toBe(true);
  });
});
