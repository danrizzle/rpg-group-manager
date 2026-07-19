import { describe, expect, it } from 'vitest';
import { Actor } from '../src/model/actor';
import type { Ability } from '../src/model/ability';
import type { BossDefinition, Mechanic } from '../src/model/boss';
import type { CombatStats } from '../src/model/stats';
import { DEFAULT_STANCE } from '../src/model/stance';
import { makeWarrior } from '../src/content/classes/warrior';
import { makePriest } from '../src/content/classes/priest';
import { makeMage } from '../src/content/classes/mage';
import { runFight, type CharacterDef, type PartyMember } from '../src/sim/engine';

/** Slice-4 type-4 machinery: stacking debuffs, taunt, dispel, interrupt. */

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 10_000, attackPower: 0, spellPower: 0, healingPower: 0,
  critChance: 0, hastePct: 0, armor: 0, resistances: {}, ...over,
});

const TAUNT: Ability = { id: 'taunt', name: 'Taunt', castTimeMs: 0, cooldownMs: 6000, effect: { kind: 'taunt', durationMs: 6000 }, tags: ['taunt'] };
const DISPEL: Ability = { id: 'dispel', name: 'Dispel', castTimeMs: 0, cooldownMs: 8000, effect: { kind: 'dispel', dispelTypes: ['magic'] }, tags: ['dispel'] };
const KICK: Ability = { id: 'kick', name: 'Kick', castTimeMs: 0, cooldownMs: 15_000, effect: { kind: 'interrupt' }, tags: ['interrupt'] };

const withAbilities = (c: CharacterDef, extra: Ability[], id: string): CharacterDef => ({ ...c, id, abilities: [...c.abilities, ...extra] });

const testBoss = (mechanics: Mechanic[]): BossDefinition => ({
  id: 'test-boss', name: 'Test Boss', hp: 400_000, meleeDamage: 20, meleeSwingMs: 2000, meleeDamageType: 'physical', mechanics, timerJitterPct: 0,
});

const member = (c: CharacterDef): PartyMember => ({ character: c, stance: { ...DEFAULT_STANCE } });

describe('stacking debuffs', () => {
  it('a maxStacks buff stacks (capped) and compounds damageTakenMult', () => {
    const a = new Actor('x', 'X', 'players', stats());
    const eff = { kind: 'buff', buffId: 'brand', durationMs: 10_000, damageTakenMult: 1.5, maxStacks: 3 } as const;
    a.applyBuff(eff, 0);
    expect(a.buffStacks('brand', 0)).toBe(1);
    expect(a.takeDamage(100, 'physical', 0).dealt).toBe(150);
    a.applyBuff(eff, 100);
    expect(a.buffStacks('brand', 100)).toBe(2);
    expect(a.takeDamage(100, 'physical', 100).dealt).toBe(225); // 1.5^2
    a.applyBuff(eff, 200);
    a.applyBuff(eff, 200);
    expect(a.buffStacks('brand', 200)).toBe(3); // capped
  });

  it('a plain buff (no maxStacks) still refreshes, never stacks', () => {
    const a = new Actor('x', 'X', 'players', stats());
    const eff = { kind: 'buff', buffId: 'ward', durationMs: 5000, damageTakenMult: 0.5 } as const;
    a.applyBuff(eff, 0);
    a.applyBuff(eff, 100);
    expect(a.buffStacks('ward', 100)).toBe(1);
    expect(a.takeDamage(100, 'physical', 100).dealt).toBe(50);
  });
});

describe('taunt (tank swap)', () => {
  it('an off-tank auto-taunts the boss off a heavily stacked co-tank', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'brand', name: 'Sear', firstAtMs: 3000, everyMs: 5000, damage: 10, damageType: 'fire',
        applies: { buffId: 'sear', durationMs: 30_000, damageTakenMult: 1.4, maxStacks: 5, target: 'current-tank' } },
    ]);
    const party = [
      member(withAbilities(makeWarrior(), [TAUNT], 'tank1')),
      member(withAbilities(makeWarrior(), [TAUNT], 'tank2')),
      member({ ...makeMage(), id: 'mage' }),
    ];
    const r = runFight({ party, boss, seed: 4 });
    // The boss's target changes to the off-tank via taunt at least once.
    const swaps = r.events.filter((e) => e.type === 'targetChanged' && e.meta?.['reason'] === 'taunt');
    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps.some((e) => e.target === 'tank2' || e.target === 'tank1')).toBe(true);
  });
});

describe('dispel', () => {
  it('a healer auto-dispels a magic debuff off the party (buffRemoved, boss-applied)', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'hex', name: 'Hex', firstAtMs: 3000, everyMs: 10_000_000, damage: 10, damageType: 'shadow',
        applies: { buffId: 'hex', durationMs: 60_000, dispelType: 'magic', damageTakenMult: 1.3, target: 'all' } },
    ]);
    const party = [
      member({ ...makeWarrior(), id: 'tank' }),
      member(withAbilities(makePriest(), [DISPEL], 'healer')),
      member({ ...makeMage(), id: 'mage' }),
    ];
    const r = runFight({ party, boss, seed: 5 });
    const removed = r.events.filter((e) => e.type === 'buffRemoved' && e.meta?.['buffId'] === 'hex');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0]!.source).toBe('healer');
  });
});

describe('interrupt', () => {
  it('interrupting a boss cast cancels it: interrupted fires, no castEnd, no damage', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'nuke', name: 'Nuke', firstAtMs: 3000, everyMs: 10_000_000, damage: 500_000, damageType: 'fire', castDurationMs: 3000 },
    ]);
    const party = [
      member(withAbilities(makeWarrior(), [KICK], 'tank')),
      member({ ...makeMage(), id: 'mage1' }),
      member({ ...makeMage(), id: 'mage2' }),
    ];
    const r = runFight({ party, boss, seed: 6 });
    expect(r.events.some((e) => e.type === 'interrupted' && e.meta?.['abilityId'] === 'nuke')).toBe(true);
    expect(r.events.some((e) => e.type === 'castEnd' && e.source === 'boss' && e.meta?.['abilityId'] === 'nuke')).toBe(false);
    // The cancelled cast never applied its effect → no nuke damage landed.
    expect(r.events.some((e) => e.type === 'damage' && e.meta?.['abilityId'] === 'nuke')).toBe(false);
  });

  it('a plain kit never emits type-4 events (no perturbation)', () => {
    const boss = testBoss([{ kind: 'enrage', atMs: 600_000, damageMult: 5 }]);
    const party = [member({ ...makeWarrior(), id: 'tank' }), member({ ...makeMage(), id: 'mage' })];
    const r = runFight({ party, boss, seed: 1 });
    expect(r.events.some((e) => ['targetChanged', 'buffRemoved', 'interrupted'].includes(e.type))).toBe(false);
  });
});
