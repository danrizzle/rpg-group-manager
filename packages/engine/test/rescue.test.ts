import { describe, expect, it } from 'vitest';
import { Actor } from '../src/model/actor';
import type { Ability } from '../src/model/ability';
import type { BossDefinition, Mechanic } from '../src/model/boss';
import type { CombatStats } from '../src/model/stats';
import { DEFAULT_STANCE } from '../src/model/stance';
import { makeWarrior } from '../src/content/classes/warrior';
import { makeMage } from '../src/content/classes/mage';
import { runFight, type CharacterDef, type PartyMember } from '../src/sim/engine';

/** Slice-5: battle res + retreat. */

const stats = (over: Partial<CombatStats> = {}): CombatStats => ({
  maxHp: 3000, attackPower: 0, spellPower: 0, healingPower: 0,
  critChance: 0, hastePct: 0, armor: 0, resistances: {}, ...over,
});

const testBoss = (mechanics: Mechanic[], over: Partial<BossDefinition> = {}): BossDefinition => ({
  id: 'test-boss', name: 'Test Boss', hp: 400_000, meleeDamage: 250, meleeSwingMs: 1200, meleeDamageType: 'physical', mechanics, timerJitterPct: 0, ...over,
});

const member = (c: CharacterDef): PartyMember => ({ character: c, stance: { ...DEFAULT_STANCE } });

describe('Actor.resurrect', () => {
  it('brings a corpse back at a fraction of max HP and clears buffs', () => {
    const a = new Actor('x', 'X', 'players', stats({ maxHp: 2000 }));
    a.takeDamage(9999, 'physical', 0);
    expect(a.alive).toBe(false);
    a.resurrect(0.4);
    expect(a.alive).toBe(true);
    expect(a.hp).toBe(800);
  });
});

describe('battle res', () => {
  const REZ: Ability = { id: 'rez', name: 'Rez', castTimeMs: 0, cooldownMs: 600_000, chargesPerFight: 1, effect: { kind: 'resurrect', hpPct: 0.5 }, tags: ['battle-res'] };

  it('a fallen ally is auto-revived once, then the fight continues', () => {
    // A frail mage dies to the boss; a beefy tank carries a battle res.
    const party = [
      member({ ...makeWarrior(), id: 'tank', stats: { ...makeWarrior().stats, maxHp: 500_000 }, abilities: [...makeWarrior().abilities, REZ] }),
      member({ ...makeMage(), id: 'mage', stats: { ...makeMage().stats, maxHp: 400 } }),
    ];
    // A party-wide pulse kills the frail mage (melee would only hit the tank).
    const boss = testBoss([
      { kind: 'timeline', id: 'pulse', name: 'Pulse', firstAtMs: 3000, everyMs: 8000, damage: 600, damageType: 'fire' },
      { kind: 'enrage', atMs: 600_000, damageMult: 5 },
    ]);
    const r = runFight({ party, boss, seed: 3 });
    const deaths = r.events.filter((e) => e.type === 'death' && e.source === 'mage');
    const rez = r.events.filter((e) => e.type === 'resurrect' && e.target === 'mage');
    expect(deaths.length).toBeGreaterThan(0);
    expect(rez.length).toBe(1); // one charge only
    expect(rez[0]!.source).toBe('tank');
    // The rez lands after the first death and before the fight ends.
    expect(rez[0]!.t).toBeGreaterThan(deaths[0]!.t);
  });

  it('Rekindle is a raid-gated group CD: the trinity never gets it', async () => {
    const { applyComp } = await import('../src/model/comp');
    const { GROUP_CDS, COMP_PASSIVES } = await import('../src/content/groupCds');
    const { makePriest } = await import('../src/content/classes/priest');
    const trinity = applyComp([makeWarrior(), makePriest(), makeMage()], GROUP_CDS, COMP_PASSIVES);
    expect(trinity.some((c) => c.abilities.some((a) => a.id === 'rekindle'))).toBe(false);
    // Five mages (a raid dps core) → the first mage carries it.
    const raid = applyComp(
      [makeWarrior(), makePriest(), ...Array.from({ length: 5 }, () => makeMage())],
      GROUP_CDS,
      COMP_PASSIVES,
    );
    const carriers = raid.filter((c) => c.abilities.some((a) => a.id === 'rekindle'));
    expect(carriers.length).toBe(1);
    expect(carriers[0]!.classId).toBe('mage');
  });
});

describe('retreat', () => {
  const RETREAT_AT: Ability = { id: 'x', name: 'x', castTimeMs: 0, cooldownMs: 0, effect: { kind: 'damage', damageType: 'physical', base: 1, coeff: 0 }, tags: ['single-target'] };

  it('a retreat plan action ends the fight early with result retreat, party alive', () => {
    const party = [
      member({ ...makeWarrior(), id: 'tank', abilities: [...makeWarrior().abilities, RETREAT_AT] }),
      member({ ...makeMage(), id: 'mage' }),
    ];
    const r = runFight({
      party,
      boss: testBoss([{ kind: 'enrage', atMs: 600_000, damageMult: 5 }], { hp: 5_000_000, meleeDamage: 10 }),
      plan: { entries: [{ trigger: { kind: 'time', atMs: 5000 }, action: { kind: 'retreat' } }] },
      seed: 1,
    });
    expect(r.result).toBe('retreat');
    expect(r.durationMs).toBeGreaterThanOrEqual(5000);
    expect(r.durationMs).toBeLessThan(20_000); // ended early, not at the 600 s cap
    // Nobody died — retreat, not a wipe.
    expect(r.events.some((e) => e.type === 'death')).toBe(false);
    const end = r.events[r.events.length - 1]!;
    expect(end.type).toBe('fightEnd');
    expect(end.meta?.['result']).toBe('retreat');
  });
});
