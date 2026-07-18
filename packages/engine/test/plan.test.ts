import { describe, expect, it } from 'vitest';
import { makeVulkan } from '../src/content/dungeons/emberForge';
import { makeMage } from '../src/content/classes/mage';
import { makePriest } from '../src/content/classes/priest';
import { makeWarrior } from '../src/content/classes/warrior';
import { applyComp } from '../src/model/comp';
import { COMP_PASSIVES, GROUP_CDS } from '../src/content/groupCds';
import { GEAR_SETS } from '../src/content/items';
import { sanitizePlan, type BossPlan } from '../src/model/plan';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight, type FightSetup, type PartyMember } from '../src/sim/engine';
import { runMonteCarlo } from '../src/analysis/montecarlo';

const trinity = (tier = 'default', burstCds: 'automatic' | 'save-for-plan-window' = 'automatic'): PartyMember[] =>
  applyComp(
    [
      makeWarrior(undefined, GEAR_SETS[`warrior-${tier}`]!),
      makePriest(undefined, GEAR_SETS[`priest-${tier}`]!),
      makeMage(undefined, GEAR_SETS[tier]!, 10, [], []),
    ],
    GROUP_CDS,
    COMP_PASSIVES,
  ).map((character) => ({ character, stance: { ...DEFAULT_STANCE, burstCds } }));

/** The Vulkan knowledge answer: hold just above the phase, push after a blast. */
const HOLD_PLAN: BossPlan = {
  entries: [
    { trigger: { kind: 'bossHpBelow', pct: 28 }, action: { kind: 'holdDps', hold: true } },
    { trigger: { kind: 'bossCast', abilityId: 'forge-blast' }, action: { kind: 'holdDps', hold: false } },
  ],
};

describe('plan execution', () => {
  it('plans are deterministic and emit planAction events; no plan, no events', () => {
    const setup: FightSetup = { party: trinity(), boss: makeVulkan(), plan: HOLD_PLAN, seed: 5 };
    const a = runFight(setup);
    const b = runFight(setup);
    expect(a.events).toEqual(b.events);
    expect(a.events.some((e) => e.type === 'planAction' && e.meta?.['origin'] === 'plan')).toBe(true);
    const bare = runFight({ party: trinity(), boss: makeVulkan(), seed: 5 });
    expect(bare.events.some((e) => e.type === 'planAction')).toBe(false);
  });

  it("save-for-plan-window holds burst CDs until the plan's pull window", () => {
    const noPlan = runFight({ party: trinity('default', 'save-for-plan-window'), boss: makeVulkan(), seed: 2 });
    expect(noPlan.events.some((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'battle-shout')).toBe(false);

    const plan: BossPlan = {
      entries: [{ trigger: { kind: 'pull' }, action: { kind: 'ability', charId: 'warrior', abilityId: 'battle-shout' } }],
    };
    const withPlan = runFight({ party: trinity('default', 'save-for-plan-window'), boss: makeVulkan(), plan, seed: 2 });
    const shout = withPlan.events.find((e) => e.type === 'buffApplied' && e.meta?.['buffId'] === 'battle-shout');
    expect(shout).toBeDefined();
    // Fired after the warrior's reaction time, not at t=0.
    expect(shout!.t).toBeGreaterThan(0);
    expect(shout!.t).toBeLessThan(3000);
  });

  it('stance switches repoint intent mid-fight (phase 2 → mage to Cleave)', () => {
    const plan: BossPlan = {
      entries: [{ trigger: { kind: 'phase', phase: 2 }, action: { kind: 'stance', charId: 'mage', patch: { targeting: 1 } } }],
    };
    const count = (events: readonly { type: string; t: number; source: string; meta?: Record<string, unknown> }[], after: number) =>
      events.filter((e) => e.type === 'castEnd' && e.source === 'mage' && e.meta?.['abilityId'] === 'flamestrike' && e.t > after).length;
    let planned = 0;
    let bare = 0;
    for (let seed = 0; seed < 6; seed++) {
      const a = runFight({ party: trinity(), boss: makeVulkan(), plan, seed });
      const b = runFight({ party: trinity(), boss: makeVulkan(), seed });
      const phaseA = a.events.find((e) => e.type === 'phaseChange')?.t ?? Infinity;
      const phaseB = b.events.find((e) => e.type === 'phaseChange')?.t ?? Infinity;
      planned += count(a.events, phaseA);
      bare += count(b.events, phaseB);
    }
    expect(planned).toBeGreaterThan(bare);
  });

  it('"Stop damage!" stops damage until resumed (stream-verified)', () => {
    const plan: BossPlan = {
      entries: [{ trigger: { kind: 'bossHpBelow', pct: 90 }, action: { kind: 'holdDps', hold: true } }],
    };
    const r = runFight({ party: trinity(), boss: makeVulkan(), plan, seed: 4 });
    expect(r.result).not.toBe('kill');
    const holdAt = r.events.find((e) => e.type === 'planAction' && e.meta?.['kind'] === 'holdDps')!.t;
    // After everyone's reaction time (≤ ~1.3s at discipline 55) + in-flight
    // casts land (≤ 3s), no more player damage reaches the boss.
    const late = r.events.filter(
      (e) => e.type === 'damage' && e.target === 'boss' && e.t > holdAt + 5000,
    );
    expect(late).toHaveLength(0);
    // The healer keeps working while holding.
    expect(r.events.some((e) => e.type === 'heal' && e.source === 'priest' && e.t > holdAt + 5000)).toBe(true);
  });

  it('bossHpBelow fires once; bossCast fires on every cast', () => {
    const r = runFight({ party: trinity(), boss: makeVulkan(), plan: HOLD_PLAN, seed: 6 });
    const holds = r.events.filter((e) => e.type === 'planAction' && e.meta?.['hold'] === true);
    const resumes = r.events.filter((e) => e.type === 'planAction' && e.meta?.['hold'] === false);
    const blasts = r.events.filter((e) => e.type === 'castEnd' && e.source === 'boss' && e.meta?.['abilityId'] === 'forge-blast');
    expect(holds).toHaveLength(1);
    expect(resumes).toHaveLength(blasts.length);
  });

  it('sanitizePlan drops entries for unknown characters and abilities', () => {
    const party = trinity().map((m) => m.character);
    const dirty: BossPlan = {
      entries: [
        { trigger: { kind: 'pull' }, action: { kind: 'ability', charId: 'warrior', abilityId: 'battle-shout' } },
        { trigger: { kind: 'pull' }, action: { kind: 'ability', charId: 'rogue', abilityId: 'stab' } },
        { trigger: { kind: 'pull' }, action: { kind: 'ability', charId: 'mage', abilityId: 'not-a-spell' } },
        { trigger: { kind: 'pull' }, action: { kind: 'stance', charId: 'mage', patch: { targeting: 4 } } },
        { trigger: { kind: 'pull' }, action: { kind: 'holdDps', hold: true } },
      ],
    };
    const clean = sanitizePlan(dirty, party);
    expect(clean.entries).toHaveLength(2);
  });

  it('the hold plan buys the early Vulkan kill undergeared (knowledge → kill %)', () => {
    const bare = runMonteCarlo({ party: trinity('starter'), boss: makeVulkan() }, 200, 42);
    const planned = runMonteCarlo({ party: trinity('starter'), boss: makeVulkan(), plan: HOLD_PLAN }, 200, 42);
    expect(planned.killRate).toBeGreaterThan(bare.killRate + 0.1);
    // And the Normal law still holds at defaults without any plan.
    const defaults = runMonteCarlo({ party: trinity(), boss: makeVulkan() }, 200, 42);
    expect(defaults.killRate).toBeGreaterThanOrEqual(0.9);
  });
});

describe('live calls (engine foundation for slice 6)', () => {
  it('a timed call fires like a plan action, with origin call', () => {
    const r = runFight({
      party: trinity(),
      boss: makeVulkan(),
      calls: [{ atMs: 60_000, action: { kind: 'ability', charId: 'priest', abilityId: 'divine-hymn' } }],
      seed: 8,
    });
    const evt = r.events.find((e) => e.type === 'planAction' && e.meta?.['origin'] === 'call');
    expect(evt?.t).toBe(60_000);
    expect(r.events.some((e) => e.type === 'castEnd' && e.meta?.['abilityId'] === 'divine-hymn')).toBe(true);
  });

  it('appending a call changes nothing before the call moment (determinism = live play)', () => {
    const base = runFight({ party: trinity(), boss: makeVulkan(), seed: 8 });
    const called = runFight({
      party: trinity(),
      boss: makeVulkan(),
      calls: [{ atMs: 90_000, action: { kind: 'holdDps', hold: true } }],
      seed: 8,
    });
    const before = (events: typeof base.events) => events.filter((e) => e.t < 90_000);
    expect(before(called.events)).toEqual(before(base.events));
    expect(called.events).not.toEqual(base.events);
  });
});
