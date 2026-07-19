import { describe, expect, it } from 'vitest';
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { withEnrageAt } from '../src/model/boss';
import { makeMage } from '../src/content/classes/mage';
import { CONSUMABLES, CONSUMABLES_BY_ID, CONSUMABLE_SLOTS } from '../src/content/consumables';
import { GEAR_SETS } from '../src/content/items';
import { normalizeConsumables, type ConsumableDefinition } from '../src/model/consumable';
import { DEFAULT_STANCE } from '../src/model/stance';
import { PLAYER_ID, runFight, type SoloFightSetup } from '../src/sim/engine';
import { runMonteCarlo } from '../src/analysis/montecarlo';

const POTION = CONSUMABLES_BY_ID['healing-potion']!;
const FLASK = CONSUMABLES_BY_ID['flask-of-embers']!;
const WARD = CONSUMABLES_BY_ID['fire-ward-potion']!;

const setupWith = (
  seed: number,
  consumables: ConsumableDefinition[] | undefined,
  stanceOverride: Partial<typeof DEFAULT_STANCE> = {},
  gear = GEAR_SETS['default']!,
): SoloFightSetup => ({
  player: makeMage(undefined, gear, 10, [], consumables),
  boss: makeCinderMaw(),
  stance: { ...DEFAULT_STANCE, ...stanceOverride },
  seed,
});

const potionHeals = (events: readonly { type: string; meta?: Record<string, unknown> }[]) =>
  events.filter((e) => e.type === 'heal' && e.meta?.['abilityId'] === 'healing-potion');

describe('consumable content', () => {
  it('catalog is internally consistent', () => {
    const ids = CONSUMABLES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(CONSUMABLE_SLOTS).toBeGreaterThanOrEqual(1);
    for (const c of CONSUMABLES) {
      expect(CONSUMABLES_BY_ID[c.id]).toBe(c);
      if (c.kind === 'active') {
        expect(c.chargesPerFight).toBeGreaterThanOrEqual(1);
        expect(c.ability.tags).toContain('consumable');
        expect(c.ability.offGcd).toBe(true);
      }
    }
  });

  it('the raid tier sharpens one axis each, so the slot choice survives', () => {
    const by = (id: string) => CONSUMABLES_BY_ID[id]!;
    const draught = by('ember-draught');
    const tonic = by('cinderguard-tonic');
    expect(draught.kind).toBe('passive');
    expect(tonic.kind).toBe('passive');
    if (draught.kind !== 'passive' || tonic.kind !== 'passive') return;

    const flask = by('flask-of-embers');
    const ward = by('fire-ward-potion');
    if (flask.kind !== 'passive' || ward.kind !== 'passive') return;

    // Each raid consumable beats its tier-1 counterpart on ITS axis...
    expect(draught.bonuses.spellPower!).toBeGreaterThan(flask.bonuses.spellPower!);
    expect(tonic.bonuses.resistances!['fire']!).toBeGreaterThan(
      ward.bonuses.resistances!['fire']!,
    );
    // ...and on no other, so neither is a strict upgrade over the other and
    // the ward-vs-flask decision (GDD §6) still has to be made at raid tier.
    expect(draught.bonuses.resistances?.['fire'] ?? 0).toBe(0);
    expect(tonic.bonuses.spellPower ?? 0).toBe(0);
  });

  it('normalize merges duplicate actives and dedupes passives', () => {
    const { passives, actives, summary } = normalizeConsumables([POTION, FLASK, POTION, FLASK]);
    expect(passives).toHaveLength(1);
    expect(actives).toHaveLength(1);
    expect(actives[0]!.chargesPerFight).toBe(4);
    expect(summary).toEqual([
      { id: 'healing-potion', kind: 'active' },
      { id: 'flask-of-embers', kind: 'passive' },
      { id: 'healing-potion', kind: 'active' },
    ]);
  });
});

describe('makeMage with consumables', () => {
  it('absent argument keeps the legacy kit potion and stream byte-identity', () => {
    const legacy = makeMage();
    const explicit = makeMage(undefined, GEAR_SETS['default']!, 10, [], undefined);
    expect(explicit).toEqual(legacy);
    expect(legacy.abilities.some((a) => a.tags.includes('consumable'))).toBe(true);
    expect(legacy.consumables).toBeUndefined();
    const a = runFight(setupWith(42, undefined));
    const b = runFight({ ...setupWith(42, undefined), player: makeMage() });
    expect(a.events).toEqual(b.events);
  });

  it('an empty slot list removes the kit potion', () => {
    const bare = makeMage(undefined, GEAR_SETS['default']!, 10, [], []);
    expect(bare.abilities.some((a) => a.tags.includes('consumable'))).toBe(false);
    expect(bare.consumables).toEqual([]);
  });

  it('records the equipped summary on the CharacterDef', () => {
    const c = makeMage(undefined, GEAR_SETS['default']!, 10, [], [FLASK, POTION]);
    expect(c.consumables).toEqual([
      { id: 'flask-of-embers', kind: 'passive' },
      { id: 'healing-potion', kind: 'active' },
    ]);
  });

  it('passives fold like gear: flask adds spell power, ward adds fire resist', () => {
    const none = makeMage(undefined, GEAR_SETS['starter']!, 10, [], []);
    const flasked = makeMage(undefined, GEAR_SETS['starter']!, 10, [], [FLASK]);
    const warded = makeMage(undefined, GEAR_SETS['starter']!, 10, [], [WARD]);
    expect(FLASK.kind).toBe('passive');
    expect(WARD.kind).toBe('passive');
    if (FLASK.kind !== 'passive' || WARD.kind !== 'passive') return;
    expect(flasked.stats.spellPower).toBe(none.stats.spellPower + FLASK.bonuses.spellPower!);
    expect(warded.stats.resistances['fire']).toBe(
      (none.stats.resistances['fire'] ?? 0) + WARD.bonuses.resistances!['fire']!,
    );
  });

  it('passive fold applies the shared clamps', () => {
    const absurd: ConsumableDefinition = {
      id: 'test-crit-brew',
      name: 'Test Crit Brew',
      kind: 'passive',
      bonuses: { critChance: 2 },
    };
    const c = makeMage(undefined, GEAR_SETS['default']!, 10, [], [absurd]);
    expect(c.stats.critChance).toBe(1);
  });

  it('duplicate passives do not double-dip', () => {
    const one = makeMage(undefined, GEAR_SETS['default']!, 10, [], [FLASK]);
    const two = makeMage(undefined, GEAR_SETS['default']!, 10, [], [FLASK, FLASK]);
    expect(two.stats).toEqual(one.stats);
  });
});

describe('fights with consumables', () => {
  it('with potion never fired, empty slots match the legacy stream byte-for-byte', () => {
    const a = runFight(setupWith(4, undefined, { potionThresholdPct: 0 }));
    const b = runFight(setupWith(4, [], { potionThresholdPct: 0 }));
    expect(a.events).toEqual(b.events);
  });

  it('is deterministic: same slots, same seed, identical streams', () => {
    const a = runFight(setupWith(7, [POTION, FLASK]));
    const b = runFight(setupWith(7, [POTION, FLASK]));
    expect(a.events).toEqual(b.events);
  });

  it('each equipped passive is stream-visible as a t=0 buff, before anything else', () => {
    const r = runFight(setupWith(5, [FLASK, WARD, POTION]));
    const head = r.events.slice(0, 2);
    expect(head.map((e) => ({ t: e.t, type: e.type, buffId: e.meta?.['buffId'], consumable: e.meta?.['consumable'] }))).toEqual([
      { t: 0, type: 'buffApplied', buffId: 'flask-of-embers', consumable: true },
      { t: 0, type: 'buffApplied', buffId: 'fire-ward-potion', consumable: true },
    ]);
    // Actives and legacy fights emit no t=0 consumable buffs.
    const legacy = runFight(setupWith(5, undefined));
    expect(legacy.events.filter((e) => e.meta?.['consumable'] === true)).toHaveLength(0);
  });

  it('a potion slot caps uses at its charges where the legacy potion keeps drinking', () => {
    let cappedSomewhere = false;
    for (let seed = 0; seed < 12; seed++) {
      const stance = { potionThresholdPct: 60 };
      const gear = GEAR_SETS['starter']!;
      const limited = runFight(setupWith(seed, [POTION], stance, gear));
      const legacy = runFight(setupWith(seed, undefined, stance, gear));
      expect(potionHeals(limited.events).length).toBeLessThanOrEqual(2);
      if (potionHeals(legacy.events).length > 2) cappedSomewhere = true;
    }
    // The cap must actually bind: legacy exceeds 2 uses on at least one seed.
    expect(cappedSomewhere).toBe(true);
  });

  it('two potion slots merge into one ability with four charges', () => {
    const player = makeMage(undefined, GEAR_SETS['starter']!, 10, [], [POTION, POTION]);
    const potions = player.abilities.filter((a) => a.tags.includes('consumable'));
    expect(potions).toHaveLength(1);
    expect(potions[0]!.chargesPerFight).toBe(4);
    for (let seed = 0; seed < 8; seed++) {
      const r = runFight({ ...setupWith(seed, undefined, { potionThresholdPct: 60 }, GEAR_SETS['starter']!), player });
      expect(potionHeals(r.events).length).toBeLessThanOrEqual(4);
    }
  });

  it('potion charges still obey threshold and cooldown (stream-reconstructed)', () => {
    for (let seed = 0; seed < 10; seed++) {
      const setup = setupWith(seed, [POTION], { potionThresholdPct: 40 }, GEAR_SETS['starter']!);
      const r = runFight(setup);
      const maxHp = setup.player.stats.maxHp;
      let hp = maxHp;
      let uses = 0;
      let lastUseAt = -Infinity;
      for (const e of r.events) {
        if (e.type === 'damage' && e.target === PLAYER_ID) hp -= e.value ?? 0;
        if (e.type === 'heal' && e.target === PLAYER_ID) {
          if (e.meta?.['abilityId'] === 'healing-potion') {
            expect(hp / maxHp).toBeLessThan(0.4);
            expect(e.t - lastUseAt).toBeGreaterThanOrEqual(45_000);
            lastUseAt = e.t;
            uses += 1;
          }
          hp += e.value ?? 0;
        }
      }
      expect(uses).toBeLessThanOrEqual(2);
    }
  });
});

describe('consumables move outcomes (Monte Carlo)', () => {
  it('the DPS flask raises the kill probability undergeared', () => {
    const boss = makeCinderMaw();
    const base = { boss, stance: { ...DEFAULT_STANCE } };
    const bare = runMonteCarlo(
      { ...base, player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], []) },
      300,
      42,
    );
    const flasked = runMonteCarlo(
      { ...base, player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], [FLASK]) },
      300,
      42,
    );
    expect(flasked.killRate).toBeGreaterThan(bare.killRate);
  });

  it('the fire ward trades nothing for fewer deaths past the enrage wall', () => {
    // enrage pushed out so deaths are measured unbiased (CLAUDE.md caveat).
    const boss = withEnrageAt(makeCinderMaw(), 900_000);
    const base = { boss, stance: { ...DEFAULT_STANCE } };
    const deaths = (r: ReturnType<typeof runMonteCarlo>) =>
      (r.lossBreakdown as Record<string, number>)['playerDeath'] ?? 0;
    const bare = runMonteCarlo(
      { ...base, player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], []) },
      300,
      42,
    );
    const warded = runMonteCarlo(
      { ...base, player: makeMage(undefined, GEAR_SETS['starter']!, 10, [], [WARD]) },
      300,
      42,
    );
    expect(deaths(warded)).toBeLessThan(deaths(bare));
  });
});
