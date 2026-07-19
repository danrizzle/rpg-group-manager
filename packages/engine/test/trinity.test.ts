import { describe, expect, it } from 'vitest';
import { CONSUMABLES_BY_ID } from '../src/content/consumables';
import { GEAR_SETS, ITEMS, ITEMS_BY_ID, itemsForSlot } from '../src/content/items';
import { COMP_PASSIVES, GROUP_CDS } from '../src/content/groupCds';
import { makeEmberForge, makeSlagmaw, makeVulkan } from '../src/content/dungeons/emberForge';
import { makeMage } from '../src/content/classes/mage';
import { makePriest, priestBaseForLevel } from '../src/content/classes/priest';
import { makeWarrior, warriorBaseForLevel } from '../src/content/classes/warrior';
import { addsMechanic } from '../src/model/boss';
import { applyComp, unlockedGroupCds } from '../src/model/comp';
import { encounterById } from '../src/model/dungeon';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type CharacterDef, type PartyMember } from '../src/sim/engine';
import { runMonteCarlo } from '../src/analysis/montecarlo';

const POTION = CONSUMABLES_BY_ID['healing-potion']!;
const WARD = CONSUMABLES_BY_ID['fire-ward-potion']!;

const trinityDefs = (tier: 'starter' | 'default' | 'resist' | 'best' = 'default'): CharacterDef[] =>
  applyComp(
    [
      makeWarrior(undefined, GEAR_SETS[`warrior-${tier}`]!),
      makePriest(undefined, GEAR_SETS[`priest-${tier}`]!),
      makeMage(undefined, GEAR_SETS[tier === 'resist' ? 'resist' : tier]!, 10, [], []),
    ],
    GROUP_CDS,
    COMP_PASSIVES,
  );

const party = (defs: CharacterDef[]): PartyMember[] =>
  defs.map((character) => ({ character, stance: { ...DEFAULT_STANCE } }));

describe('trinity content integrity', () => {
  it('class gear sets only contain items that class can wear', () => {
    for (const [name, items] of Object.entries(GEAR_SETS)) {
      const cls = name.startsWith('warrior-') ? 'warrior' : name.startsWith('priest-') ? 'priest' : 'mage';
      for (const item of items) {
        expect(ITEMS_BY_ID[item.id], `${name}: ${item.id}`).toBeDefined();
        if (item.classes) expect(item.classes, `${name}: ${item.id}`).toContain(cls);
      }
    }
  });

  it('itemsForSlot filters by class and keeps shared items', () => {
    const warriorChests = itemsForSlot('chest', 'warrior');
    expect(warriorChests.every((i) => !i.classes || i.classes.includes('warrior'))).toBe(true);
    expect(warriorChests.some((i) => i.id === 'ironclad-cuirass')).toBe(true);
    expect(warriorChests.some((i) => i.id === 'runeweave-robe')).toBe(false);
    // Unclassed items (Lucky Charm) show up for everyone.
    expect(itemsForSlot('trinket', 'priest').some((i) => i.id === 'lucky-charm')).toBe(true);
  });

  it('every class has a tier-2 fire-resist chest (resist matters in anger)', () => {
    for (const cls of ['mage', 'warrior', 'priest']) {
      const resist = itemsForSlot('chest', cls).filter((i) => (i.bonuses.resistances?.fire ?? 0) > 0);
      expect(resist.length, cls).toBeGreaterThan(0);
    }
  });

  it('warrior/priest bases scale by level and cap at their L10 values', () => {
    expect(warriorBaseForLevel(10).maxHp).toBeGreaterThan(warriorBaseForLevel(1).maxHp);
    expect(warriorBaseForLevel(11)).toEqual(warriorBaseForLevel(10));
    expect(priestBaseForLevel(10).healingPower).toBeGreaterThan(priestBaseForLevel(1).healingPower);
  });

  it('the Ember Forge runs whelps → Slagmaw → Vulkan and uses only types 1–3', () => {
    const d = makeEmberForge();
    expect(d.encounters.map((e) => e.id)).toEqual(['forge-whelps', 'slagmaw', 'vulkan']);
    expect(encounterById(d, 'slagmaw')?.kind).toBe('boss');
    expect(d.partySize.min).toBe(3);
    // The type-3 add phase is only on Vulkan (Slagmaw disables it with
    // atHpPct 0); Ember Forge content carries no type-4 debuffs yet.
    expect(addsMechanic(makeSlagmaw())?.atHpPct).toBe(0);
    expect(addsMechanic(makeVulkan())?.atHpPct ?? 0).toBeGreaterThan(0);
  });

  it('consumables fold into warrior/priest like any stat layer', () => {
    const bare = makeWarrior();
    const warded = makeWarrior(undefined, undefined, 10, [], [WARD, POTION]);
    expect(warded.stats.resistances.fire ?? 0).toBe(30);
    expect(bare.stats.resistances.fire ?? 0).toBe(0);
    expect(warded.abilities.some((a) => a.id === 'healing-potion')).toBe(true);
    expect(bare.abilities.some((a) => a.id === 'healing-potion')).toBe(false);
  });
});

describe('comp rules', () => {
  it('a warrior unlocks Battle Shout, granted to the first warrior only', () => {
    const defs = trinityDefs();
    const carriers = defs.filter((c) => c.abilities.some((a) => a.id === 'battle-shout'));
    expect(carriers).toHaveLength(1);
    expect(carriers[0]!.classId).toBe('warrior');
    expect(unlockedGroupCds(defs, GROUP_CDS).map((cd) => cd.id)).toEqual(['battle-shout']);
  });

  it('no warrior, no Battle Shout', () => {
    const defs = applyComp([makePriest(), makeMage()], GROUP_CDS, COMP_PASSIVES);
    expect(defs.every((c) => !c.abilities.some((a) => a.id === 'battle-shout'))).toBe(true);
  });

  it('three distinct roles grant Well-Drilled Team (+5 discipline each)', () => {
    const solo = makeWarrior();
    const comped = trinityDefs();
    for (const c of comped) expect(c.behavior.discipline).toBe(solo.behavior.discipline + 5);
    const duo = applyComp([makeWarrior(), makePriest()], GROUP_CDS, COMP_PASSIVES);
    expect(duo[0]!.behavior.discipline).toBe(solo.behavior.discipline);
  });

  it('Battle Shout auto-fires at pull and lands on the whole party', () => {
    const r = runFight({ party: party(trinityDefs()), boss: makeSlagmaw(), seed: 3 });
    const shouts = r.events.filter(
      (e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'battle-shout',
    );
    expect(shouts.length).toBeGreaterThanOrEqual(3);
    expect(shouts[0]!.t).toBe(0);
    expect(new Set(shouts.slice(0, 3).map((e) => e.target))).toEqual(new Set(['warrior', 'priest', 'mage']));
  });
});

describe('Ember Forge balance direction (Monte Carlo)', () => {
  it('Normal law: Slagmaw and Vulkan die ≥ 90% at party defaults, no plan', () => {
    for (const enc of ['slagmaw', 'vulkan'] as const) {
      const boss = enc === 'slagmaw' ? makeSlagmaw() : makeVulkan();
      const mc = runMonteCarlo({ party: party(trinityDefs()), boss }, 200, 42);
      expect(mc.killRate, enc).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('starter gear hits a real wall on Vulkan (the earliness quadrant)', () => {
    const mc = runMonteCarlo({ party: party(trinityDefs('starter')), boss: makeVulkan() }, 200, 42);
    expect(mc.killRate).toBeLessThan(0.75);
    expect(mc.killRate).toBeGreaterThan(0.1);
  });

  it('fire-resist gear buys survival against Slagmaw', () => {
    const base = runMonteCarlo({ party: party(trinityDefs('starter')), boss: makeSlagmaw() }, 200, 42);
    const warded = runMonteCarlo(
      {
        party: party(
          applyComp(
            [
              makeWarrior(undefined, GEAR_SETS['warrior-starter']!, 10, [], [WARD]),
              makePriest(undefined, GEAR_SETS['priest-starter']!, 10, [], [WARD]),
              makeMage(undefined, GEAR_SETS['starter']!, 10, [], [WARD]),
            ],
            GROUP_CDS,
            COMP_PASSIVES,
          ),
        ),
        boss: makeSlagmaw(),
      },
      200,
      42,
    );
    expect(warded.killRate).toBeGreaterThan(base.killRate + 0.1);
  });

  it('freshly spawned sentries go for the healer until the tank picks them up', () => {
    let healerHits = 0;
    for (let seed = 0; seed < 6; seed++) {
      const r = runFight({ party: party(trinityDefs()), boss: makeVulkan(), seed });
      healerHits += r.events.filter(
        (e) =>
          e.type === 'damage' &&
          e.source.startsWith('add-') &&
          e.target === 'priest',
      ).length;
    }
    expect(healerHits).toBeGreaterThan(0);
  });

  it('party death events carry the killing attacker', () => {
    for (let seed = 0; seed < 20; seed++) {
      const r = runFight({ party: party(trinityDefs('starter')), boss: makeVulkan(), seed });
      const death = r.events.find((e) => e.type === 'death' && ['warrior', 'priest', 'mage'].includes(e.source));
      if (!death) continue;
      expect(death.meta?.['killedBySource']).toBeDefined();
      return;
    }
    throw new Error('no party death in 20 starter Vulkan runs — balance drifted?');
  });
});
