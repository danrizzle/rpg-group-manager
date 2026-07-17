import { describe, expect, it } from 'vitest';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeHeartfieldPack } from '../src/content/mobs/zones';
import { makeMage } from '../src/content/classes/mage';
import { Actor } from '../src/model/actor';
import type { Ability } from '../src/model/ability';
import type { BehaviorStats, CombatStats } from '../src/model/stats';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type CharacterDef, type FightSetup, type PartyMember } from '../src/sim/engine';
import { summarizeRun } from '../src/analysis/metrics';

/**
 * Slice-1 party machinery, exercised with inline test kits (the real
 * Warrior/Priest kits are slice-2 content). Solo byte-identity is guarded
 * separately by the CLI --json baselines and the existing 79 tests.
 */

const stats = (over: Partial<CombatStats>): CombatStats => ({
  maxHp: 2000,
  attackPower: 0,
  spellPower: 0,
  healingPower: 0,
  critChance: 0.1,
  hastePct: 0,
  armor: 0,
  resistances: {},
  ...over,
});

const behavior = (over: Partial<BehaviorStats> = {}): BehaviorStats => ({
  damageWhileMoving: 0.6,
  aoeEfficiency: 1.0,
  discipline: 80,
  ...over,
});

const STRIKE: Ability = {
  id: 'strike',
  name: 'Strike',
  castTimeMs: 0,
  cooldownMs: 0,
  effect: { kind: 'damage', damageType: 'physical', base: 60, coeff: 0.8, powerStat: 'attackPower' },
  tags: ['single-target'],
  threatMult: 4,
};

const RALLY: Ability = {
  id: 'rally',
  name: 'Rally',
  castTimeMs: 0,
  cooldownMs: 120_000,
  offGcd: true,
  effect: { kind: 'buff', buffId: 'rally', durationMs: 10_000, damageMult: 1.1, target: 'party' },
  tags: ['burst'],
};

const MEND: Ability = {
  id: 'mend',
  name: 'Mend',
  castTimeMs: 1500,
  cooldownMs: 0,
  effect: { kind: 'heal', base: 200, coeff: 1.5, target: 'lowest-ally' },
  tags: [],
};

const SMITE: Ability = {
  id: 'smite',
  name: 'Smite',
  castTimeMs: 1500,
  cooldownMs: 0,
  effect: { kind: 'damage', damageType: 'shadow', base: 40, coeff: 0.5 },
  tags: ['single-target'],
};

const makeTank = (): CharacterDef => ({
  id: 'tank',
  name: 'Test Tank',
  role: 'tank',
  stats: stats({ maxHp: 4200, attackPower: 80, armor: 400 }),
  behavior: behavior(),
  abilities: [STRIKE, RALLY],
});

const makeHealer = (): CharacterDef => ({
  id: 'healer',
  name: 'Test Healer',
  role: 'healer',
  stats: stats({ maxHp: 2600, healingPower: 60, spellPower: 20 }),
  behavior: behavior(),
  abilities: [MEND, SMITE],
});

const makeDps = (): CharacterDef => ({ ...makeMage(), id: 'mage', role: 'dps' });

const trinity = (): PartyMember[] => [
  { character: makeTank(), stance: { ...DEFAULT_STANCE } },
  { character: makeHealer(), stance: { ...DEFAULT_STANCE } },
  { character: makeDps(), stance: { ...DEFAULT_STANCE } },
];

const partySetup = (seed: number, over: Partial<FightSetup> = {}): FightSetup => ({
  party: trinity(),
  boss: makeCinderMaw({ hp: 30_000 }),
  seed,
  ...over,
});

describe('party fights', () => {
  it('are fully deterministic: same seed, identical event stream', () => {
    const a = runFight(partySetup(7));
    const b = runFight(partySetup(7));
    expect(a.result).toBe(b.result);
    expect(a.events).toEqual(b.events);
  });

  it('vary across seeds', () => {
    const durations = new Set(
      Array.from({ length: 8 }, (_, i) => runFight(partySetup(i)).durationMs),
    );
    expect(durations.size).toBeGreaterThan(1);
  });

  it('announce the roster with t=0 join events, before anything else', () => {
    const r = runFight(partySetup(1));
    const joins = r.events.slice(0, 3);
    expect(joins.map((e) => e.type)).toEqual(['join', 'join', 'join']);
    expect(joins.map((e) => e.source)).toEqual(['tank', 'healer', 'mage']);
    expect(joins[0]!.t).toBe(0);
    expect(joins[0]!.meta?.['name']).toBe('Test Tank');
    expect(joins[0]!.meta?.['role']).toBe('tank');
    expect(joins[0]!.meta?.['maxHp']).toBe(4200);
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
  });

  it('validates the setup: player xor party, unique ids, size cap', () => {
    expect(() =>
      runFight({ player: makeMage(), stance: DEFAULT_STANCE, party: trinity(), boss: makeCinderMaw(), seed: 1 }),
    ).toThrow(/player \/ party/);
    const dupes = trinity();
    dupes[1] = { ...dupes[1]!, character: { ...dupes[1]!.character, id: 'tank' } };
    expect(() => runFight({ party: dupes, boss: makeCinderMaw(), seed: 1 })).toThrow(/duplicate/);
    const six = Array.from({ length: 6 }, (_, i) => ({
      character: { ...makeTank(), id: `t${i}` },
      stance: { ...DEFAULT_STANCE },
    }));
    expect(() => runFight({ party: six, boss: makeCinderMaw(), seed: 1 })).toThrow(/party size/);
  });

  it('high-threat tank abilities hold the boss: melee lands on the tank', () => {
    let tankHits = 0;
    let otherHits = 0;
    for (let seed = 0; seed < 5; seed++) {
      const r = runFight(partySetup(seed));
      for (const e of r.events) {
        if (e.type !== 'damage' || e.source !== 'boss') continue;
        if (e.meta?.['abilityId'] !== 'melee') continue;
        if (e.target === 'tank') tankHits++;
        else otherHits++;
      }
    }
    expect(tankHits).toBeGreaterThan(20);
    // The healer's opening heal threat may draw a stray early swing at most.
    expect(otherHits / (tankHits + otherHits)).toBeLessThan(0.1);
  });

  it('lowest-ally heals land on the most-hurt living member (stream-reconstructed)', () => {
    const r = runFight(partySetup(3));
    const hp = new Map<string, { cur: number; max: number }>();
    for (const e of r.events) {
      if (e.type === 'join') {
        const max = Number(e.meta?.['maxHp']);
        hp.set(e.source, { cur: max, max });
      } else if (e.type === 'damage' && e.target !== undefined && hp.has(e.target)) {
        const h = hp.get(e.target)!;
        h.cur = Math.max(0, h.cur - (e.value ?? 0));
      } else if (e.type === 'heal' && e.target !== undefined && hp.has(e.target)) {
        if (e.meta?.['abilityId'] === 'mend') {
          // Verify target choice BEFORE applying the heal.
          const living = [...hp.entries()].filter(([, h]) => h.cur > 0);
          const minPct = Math.min(...living.map(([, h]) => h.cur / h.max));
          const t = hp.get(e.target)!;
          expect(t.cur / t.max).toBeLessThanOrEqual(minPct + 1e-9);
        }
        const h = hp.get(e.target)!;
        h.cur = Math.min(h.max, h.cur + (e.value ?? 0));
      }
    }
    expect(r.events.some((e) => e.type === 'heal' && e.meta?.['abilityId'] === 'mend')).toBe(true);
  });

  it('party buffs land on every living member', () => {
    const r = runFight(partySetup(2));
    const rallies = r.events.filter(
      (e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'rally' && e.t === 0,
    );
    expect(rallies.map((e) => e.target)).toEqual(['tank', 'healer', 'mage']);
    expect(rallies.every((e) => e.source === 'tank')).toBe(true);
  });

  it('attackPower scaling: strike hits harder than its base', () => {
    const r = runFight(partySetup(4));
    const strikes = r.events.filter(
      (e) => e.type === 'damage' && e.meta?.['abilityId'] === 'strike',
    );
    expect(strikes.length).toBeGreaterThan(5);
    // base 60 + 0.8×80 AP = 124; min roll ×0.85 ≈ 105. Spell-power scaling
    // (0 SP) would cap non-crits at 69 — values below 100 would betray it.
    for (const e of strikes) expect(e.value ?? 0).toBeGreaterThanOrEqual(100);
  });

  it('the fight is lost only when the whole party is down', () => {
    const setup = partySetup(5, { boss: makeCinderMaw({ hp: 500_000, meleeDamage: 400 }) });
    const r = runFight(setup);
    // A wipe (before or after the enrage) — never a kill or timeout.
    expect(['playerDeath', 'enrage']).toContain(r.result);
    const deaths = r.events.filter((e) => e.type === 'death' && ['tank', 'healer', 'mage'].includes(e.source));
    expect(deaths).toHaveLength(3);
    const last = r.events[r.events.length - 1]!;
    expect(last.type).toBe('fightEnd');
    expect(deaths[2]!.t).toBeLessThanOrEqual(last.t);
  });

  it('per-character summaries come straight from the stream', () => {
    const r = runFight(partySetup(6));
    const s = summarizeRun(r);
    expect(s.perCharacter).toBeDefined();
    const per = s.perCharacter!;
    expect(Object.keys(per).sort()).toEqual(['boss', 'healer', 'mage', 'tank'].filter((id) => id !== 'boss'));
    expect(per['healer']!.healingDone).toBeGreaterThan(0);
    expect(per['tank']!.damageTaken).toBeGreaterThan(per['mage']!.damageTaken);
    const totalDamage = Object.values(per).reduce((sum, c) => sum + c.damageDone, 0);
    expect(totalDamage).toBeCloseTo(s.damageDone, 6);
  });

  it('a party can clear a mob pack; mobs follow threat too', () => {
    const r = runFight({ party: trinity(), pack: makeHeartfieldPack(), seed: 9 });
    expect(r.result).toBe('kill');
    const mobDeaths = r.events.filter((e) => e.type === 'death' && e.meta?.['mobId'] !== undefined);
    expect(mobDeaths).toHaveLength(3);
  });

  it('solo fights emit no join events and no per-character breakdown', () => {
    const r = runFight({ player: makeMage(), stance: { ...DEFAULT_STANCE }, boss: makeCinderMaw(), seed: 42 });
    expect(r.events.some((e) => e.type === 'join')).toBe(false);
    expect(summarizeRun(r).perCharacter).toBeUndefined();
  });
});

describe('damageTakenMult buffs (mitigation-CD machinery)', () => {
  it('halves incoming damage while active and expires cleanly', () => {
    const a = new Actor('x', 'X', 'players', stats({ maxHp: 1000 }));
    a.applyBuff({ kind: 'buff', buffId: 'wall', durationMs: 5000, damageTakenMult: 0.5 }, 0);
    expect(a.takeDamage(200, 'physical', 100).dealt).toBe(100);
    expect(a.takeDamage(200, 'physical', 6000).dealt).toBe(200);
  });
});
