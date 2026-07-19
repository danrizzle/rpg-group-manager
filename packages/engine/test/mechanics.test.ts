import { describe, expect, it } from 'vitest';
import { makeWarrior } from '../src/content/classes/warrior';
import { makeMage } from '../src/content/classes/mage';
import type { BossDefinition, Mechanic } from '../src/model/boss';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type PartyMember } from '../src/sim/engine';

/**
 * Slice-3 boss machinery: mechanics as a list, optional cast windows, and
 * boss-applied debuffs. Byte-identity of the shipped bosses is guarded by the
 * CLI baselines + the full-stream diff; these exercise the NEW capabilities.
 */

const party = (): PartyMember[] => [
  { character: { ...makeWarrior(), id: 'tank' }, stance: { ...DEFAULT_STANCE } },
  { character: { ...makeMage(), id: 'mage1' }, stance: { ...DEFAULT_STANCE } },
  { character: { ...makeMage(), id: 'mage2' }, stance: { ...DEFAULT_STANCE } },
];

// A test boss that lives long enough for the scheduled mechanics to fire but
// still dies well before the 600 s cap. Fixed timers (no jitter) so cast/expiry
// moments are exact.
const testBoss = (mechanics: Mechanic[]): BossDefinition => ({
  id: 'test-boss',
  name: 'Test Boss',
  hp: 40_000,
  meleeDamage: 10,
  meleeSwingMs: 2000,
  meleeDamageType: 'physical',
  mechanics,
  timerJitterPct: 0,
});

const bossEvents = (events: readonly { type: string; source?: string; target?: string; t: number; meta?: Record<string, unknown> }[], type: string, abilityId?: string) =>
  events.filter((e) => e.type === type && e.source === 'boss' && (abilityId === undefined || e.meta?.['abilityId'] === abilityId));

describe('cast windows', () => {
  it('a timeline with castDurationMs emits castStart then castEnd that far apart', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'big-cast', name: 'Big Cast', firstAtMs: 5000, everyMs: 10_000_000, damage: 50, damageType: 'fire', castDurationMs: 3000 },
    ]);
    const r = runFight({ party: party(), boss, seed: 1 });
    const start = bossEvents(r.events, 'castStart', 'big-cast')[0];
    const end = bossEvents(r.events, 'castEnd', 'big-cast')[0];
    expect(start).toBeDefined();
    expect(end).toBeDefined();
    expect(start!.t).toBe(5000);
    expect(end!.t - start!.t).toBe(3000);
    expect(start!.meta?.['durationMs']).toBe(3000);
  });

  it('an instant timeline (no cast window) emits no boss castStart', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'zap', name: 'Zap', firstAtMs: 4000, everyMs: 10_000_000, damage: 40, damageType: 'fire' },
    ]);
    const r = runFight({ party: party(), boss, seed: 1 });
    expect(bossEvents(r.events, 'castStart').length).toBe(0);
    expect(bossEvents(r.events, 'castEnd', 'zap').length).toBeGreaterThan(0);
  });

  it('a bossCast plan trigger fires at the cast RESOLUTION (castEnd), not castStart', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'big-cast', name: 'Big Cast', firstAtMs: 5000, everyMs: 10_000_000, damage: 50, damageType: 'fire', castDurationMs: 3000 },
    ]);
    const r = runFight({
      party: party(),
      boss,
      plan: { entries: [{ trigger: { kind: 'bossCast', abilityId: 'big-cast' }, action: { kind: 'holdDps', hold: true } }] },
      seed: 1,
    });
    const end = bossEvents(r.events, 'castEnd', 'big-cast')[0]!;
    const planAction = r.events.find((e) => e.type === 'planAction');
    expect(planAction).toBeDefined();
    expect(planAction!.t).toBe(end.t); // == castStart + 3000, not castStart
  });
});

describe('boss-applied debuffs', () => {
  it('target current-tank lands the debuff on the threat holder (boss-sourced events)', () => {
    const boss = testBoss([
      {
        kind: 'timeline', id: 'brand', name: 'Searing Brand', firstAtMs: 4000, everyMs: 10_000_000, damage: 10, damageType: 'fire',
        applies: { buffId: 'searing-brand', durationMs: 8000, damageTakenMult: 2, target: 'current-tank' },
      },
    ]);
    const r = runFight({ party: party(), boss, seed: 1 });
    const applied = r.events.find((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'searing-brand');
    expect(applied).toBeDefined();
    expect(applied!.source).toBe('boss');
    expect(applied!.target).toBe('tank'); // the warrior holds threat
    const expired = r.events.find((e) => e.type === 'buffExpired' && e.meta?.['buffId'] === 'searing-brand');
    expect(expired).toBeDefined();
    expect(expired!.t - applied!.t).toBe(8000);
  });

  it('target all lands the debuff on every living member at the cast moment', () => {
    const boss = testBoss([
      {
        kind: 'timeline', id: 'curse', name: 'Curse', firstAtMs: 4000, everyMs: 10_000_000, damage: 10, damageType: 'shadow',
        applies: { buffId: 'curse', durationMs: 5000, damageTakenMult: 1.5, target: 'all' },
      },
    ]);
    const r = runFight({ party: party(), boss, seed: 2 });
    const applied = r.events.filter((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'curse' && e.t === 4000);
    expect(new Set(applied.map((e) => e.target))).toEqual(new Set(['tank', 'mage1', 'mage2']));
    expect(applied.every((e) => e.source === 'boss')).toBe(true);
  });

  it('a plain timeline (no applies) emits no debuff events', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'zap', name: 'Zap', firstAtMs: 4000, everyMs: 10_000_000, damage: 40, damageType: 'fire' },
    ]);
    const r = runFight({ party: party(), boss, seed: 1 });
    expect(r.events.some((e) => e.type === 'buffApplied' && e.source === 'boss' && e.meta?.['buffId'] !== 'tantrum')).toBe(false);
  });
});

describe('multiple mechanics of a kind', () => {
  it('two timeline mechanics each fire on their own cadence', () => {
    const boss = testBoss([
      { kind: 'timeline', id: 'a', name: 'A', firstAtMs: 3000, everyMs: 10_000_000, damage: 20, damageType: 'fire' },
      { kind: 'timeline', id: 'b', name: 'B', firstAtMs: 6000, everyMs: 10_000_000, damage: 20, damageType: 'frost' },
    ]);
    const r = runFight({ party: party(), boss, seed: 3 });
    expect(bossEvents(r.events, 'castEnd', 'a').length).toBeGreaterThan(0);
    expect(bossEvents(r.events, 'castEnd', 'b').length).toBeGreaterThan(0);
  });

  it('two movement mechanics both open windows', () => {
    const boss = testBoss([
      { kind: 'movement', firstAtMs: 3000, everyMs: 10_000_000, durationMs: 1000, failDamage: 50, failDamageType: 'fire' },
      { kind: 'movement', firstAtMs: 7000, everyMs: 10_000_000, durationMs: 1000, failDamage: 50, failDamageType: 'fire' },
    ]);
    const r = runFight({ party: party(), boss, seed: 3 });
    const starts = r.events.filter((e) => e.type === 'movementStart').map((e) => e.t);
    expect(starts).toContain(3000);
    expect(starts).toContain(7000);
  });
});
