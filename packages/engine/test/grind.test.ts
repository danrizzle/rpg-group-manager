import { describe, expect, it } from 'vitest';
import { makeMage } from '../src/content/classes/mage';
import { GEAR_SETS } from '../src/content/items';
import {
  makeHeartfieldPack,
  makeCinderWastesPack,
  makeAshenFoothillsPack,
} from '../src/content/mobs/zones';
import { DEFAULT_STANCE } from '../src/model/stance';
import { PLAYER_ID, runFight, type FightSetup } from '../src/sim/engine';
import { DEFAULT_PULL_CYCLE, grindRates, type GrindSetup } from '../src/analysis/grind';

const grindSetup = (over: Partial<GrindSetup> = {}): GrindSetup => ({
  player: makeMage(undefined, GEAR_SETS['default'], 10),
  stance: { ...DEFAULT_STANCE },
  pack: makeHeartfieldPack(),
  ...over,
});

describe('grindRates', () => {
  it('is reproducible for the same base seed', () => {
    const a = grindRates(grindSetup(), DEFAULT_PULL_CYCLE, 50, 7);
    const b = grindRates(grindSetup(), DEFAULT_PULL_CYCLE, 50, 7);
    expect(a).toEqual(b);
  });

  it('a cleared 3-mob pull kills all three and only ends after the last', () => {
    const setup: FightSetup = {
      player: makeMage(undefined, GEAR_SETS['best'], 10),
      pack: makeHeartfieldPack(),
      stance: { ...DEFAULT_STANCE },
      seed: 1,
    };
    const r = runFight(setup);
    expect(r.result).toBe('kill');
    const deaths = r.events.filter((e) => e.type === 'death' && e.meta?.['mobId'] !== undefined);
    expect(deaths).toHaveLength(3);
    // The clear (fightEnd) is the final event, after every mob death.
    const last = r.events[r.events.length - 1]!;
    expect(last.type).toBe('fightEnd');
    const lastDeathIdx = r.events.lastIndexOf(deaths[deaths.length - 1]!);
    expect(lastDeathIdx).toBeLessThan(r.events.length - 1);
  });

  it('XP is recoverable purely from the event stream', () => {
    const pack = makeHeartfieldPack();
    const r = runFight({ player: makeMage(undefined, GEAR_SETS['best'], 10), pack, stance: { ...DEFAULT_STANCE }, seed: 2 });
    expect(r.result).toBe('kill');
    const streamXp = r.events
      .filter((e) => e.type === 'death' && e.meta?.['mobId'] !== undefined)
      .reduce((sum, e) => sum + Number(e.meta!['xpPerKill']), 0);
    expect(streamXp).toBe(pack.mobs.length * pack.mobs[0]!.xpPerKill);
  });

  it('keeps partial XP when the player dies mid-pull', () => {
    // The Cinder Wastes shred an underlevelled character (deadly gate), but
    // XP for mobs killed before death is kept.
    const player = makeMage(undefined, GEAR_SETS['starter'], 6);
    let found = false;
    for (let seed = 0; seed < 200 && !found; seed++) {
      const r = runFight({ player, pack: makeCinderWastesPack(), stance: { ...DEFAULT_STANCE }, seed });
      if (r.result !== 'playerDeath') continue;
      const kills = r.events.filter((e) => e.type === 'death' && e.meta?.['mobId'] !== undefined);
      if (kills.length > 0) {
        expect(kills.reduce((s, e) => s + Number(e.meta!['xpPerKill']), 0)).toBeGreaterThan(0);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('a better AoE stance grinds faster (deterministic)', () => {
    const pack = makeAshenFoothillsPack();
    const player = makeMage(undefined, GEAR_SETS['default'], 8);
    const single = grindRates({ player, pack, stance: { ...DEFAULT_STANCE, targeting: 0.1 } }, DEFAULT_PULL_CYCLE, 400, 5);
    const aoe = grindRates({ player, pack, stance: { ...DEFAULT_STANCE, targeting: 0.9 } }, DEFAULT_PULL_CYCLE, 400, 5);
    expect(aoe.xpPerHour).toBeGreaterThan(single.xpPerHour);
  });

  it('better gear grinds faster (XP scaling is automatic)', () => {
    const pack = makeAshenFoothillsPack();
    const starter = grindRates(grindSetup({ player: makeMage(undefined, GEAR_SETS['starter'], 8), pack }), DEFAULT_PULL_CYCLE, 300, 9);
    const best = grindRates(grindSetup({ player: makeMage(undefined, GEAR_SETS['best'], 8), pack }), DEFAULT_PULL_CYCLE, 300, 9);
    expect(best.xpPerHour).toBeGreaterThan(starter.xpPerHour);
  });

  it('risk tier reflects lethality: on-band farming is low, the gate is deadly', () => {
    const safe = grindRates(grindSetup({ player: makeMage(undefined, GEAR_SETS['best'], 10), pack: makeHeartfieldPack() }), DEFAULT_PULL_CYCLE, 300, 3);
    expect(safe.riskTier).toBe('low');
    expect(safe.deathsPerHour).toBe(0);

    const gate = grindRates(grindSetup({ player: makeMage(undefined, GEAR_SETS['starter'], 6), pack: makeCinderWastesPack() }), DEFAULT_PULL_CYCLE, 300, 3);
    expect(gate.riskTier).toBe('deadly');
    expect(gate.deathsPerHour).toBeGreaterThan(5);
  });

  it('uses the potion only below threshold against multiple enemies', () => {
    const setup: FightSetup = {
      player: makeMage(undefined, GEAR_SETS['default'], 8),
      pack: makeCinderWastesPack(),
      stance: { ...DEFAULT_STANCE, potionThresholdPct: 40 },
      seed: 11,
    };
    const r = runFight(setup);
    const maxHp = setup.player.stats.maxHp;
    let hp = maxHp;
    for (const e of r.events) {
      if (e.type === 'damage' && e.target === PLAYER_ID) hp -= e.value ?? 0;
      if (e.type === 'heal' && e.target === PLAYER_ID) {
        if (e.meta?.['abilityId'] === 'healing-potion') expect(hp / maxHp).toBeLessThan(0.4);
        hp += e.value ?? 0;
      }
    }
  });

  it('pack pull event streams are JSON round-trippable', () => {
    const r = runFight({ player: makeMage(undefined, GEAR_SETS['best'], 10), pack: makeHeartfieldPack(), stance: { ...DEFAULT_STANCE }, seed: 4 });
    expect(JSON.parse(JSON.stringify(r.events))).toEqual(r.events);
  });
});
