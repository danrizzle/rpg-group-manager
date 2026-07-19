/**
 * Standalone tuning harness.
 *
 * Boss report (default) — N Monte Carlo runs of the Mage vs. a boss:
 *   pnpm cli -- --n 5000 --seed 42 --level 10 --gear best --boss cinder-maw \
 *               --offense 0.6 --targeting 0.5 --potion 35 --discipline 50 \
 *               --talents throughput|defense|id,id,… --barrier reactive|proactive \
 *               --consumables none|id,id,… [--trace] [--json]
 *
 * --consumables absent = legacy character (free kit potion); 'none' = crafted
 * economy with empty slots; ids = equipped slots (duplicates allowed, e.g.
 * healing-potion,healing-potion). Slot-count limits are not enforced here —
 * this is a tuning harness.
 *
 * Grind report — sim-derived XP/hour, risk tier and deaths/hour for a zone:
 *   pnpm cli -- --level 2 --zone heartfield --gear starter
 */
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeBanditWarlord } from '../src/content/bosses/banditWarlord';
import { makeEmberwing } from '../src/content/bosses/emberwing';
import { makeMage } from '../src/content/classes/mage';
import { makeWarrior } from '../src/content/classes/warrior';
import { makePriest } from '../src/content/classes/priest';
import { applyComp } from '../src/model/comp';
import { COMP_PASSIVES, GROUP_CDS } from '../src/content/groupCds';
import { makeEmberForge, makeSlagmaw, makeVulkan } from '../src/content/dungeons/emberForge';
import { encounterById } from '../src/model/dungeon';
import { TALENT_BUILDS } from '../src/content/classes/mageTalents';
import { ZONES } from '../src/content/mobs/zones';
import { GEAR_SETS } from '../src/content/items';
import { CONSUMABLES_BY_ID } from '../src/content/consumables';
import { packBandMax } from '../src/model/mobPack';
import { enrageMechanic, withEnrageAt, type BossDefinition } from '../src/model/boss';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight } from '../src/sim/engine';
import { formatEvents } from '../src/analysis/metrics';
import { runMonteCarlo } from '../src/analysis/montecarlo';
import { DEFAULT_PULL_CYCLE, devalue, grindRates } from '../src/analysis/grind';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  const v = Number(process.argv[i + 1]);
  if (Number.isNaN(v)) throw new Error(`invalid value for --${name}`);
  return v;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** Apply the shared --hp / --enrage tuning overrides to a fresh boss def. */
function tuneBoss(boss: BossDefinition): BossDefinition {
  const hp = arg('hp', 0);
  const enrageSec = arg('enrage', 0);
  let tuned = hp > 0 ? { ...boss, hp } : boss;
  if (enrageSec > 0) tuned = withEnrageAt(tuned, enrageSec * 1000);
  return tuned;
}

function strArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 || i + 1 >= process.argv.length ? fallback : process.argv[i + 1]!;
}

const n = arg('n', 2000);
const seed = arg('seed', 42);
const level = arg('level', 10);
const barrier = strArg('barrier', '');
const stance = {
  ...DEFAULT_STANCE,
  offense: arg('offense', DEFAULT_STANCE.offense),
  targeting: arg('targeting', DEFAULT_STANCE.targeting),
  potionThresholdPct: arg('potion', DEFAULT_STANCE.potionThresholdPct),
  ...(barrier ? { barrierPolicy: barrier as 'reactive' | 'proactive' } : {}),
};
const discipline = arg('discipline', 50);
const gearName = strArg('gear', 'default');
const gear = GEAR_SETS[gearName];
if (!gear) throw new Error(`unknown gear set '${gearName}' (${Object.keys(GEAR_SETS).join('/')})`);
const talentsArg = strArg('talents', '');
const talents = talentsArg
  ? TALENT_BUILDS[talentsArg] ?? talentsArg.split(',').map((s) => s.trim())
  : [];
const consumablesArg = strArg('consumables', '');
const consumables =
  consumablesArg === ''
    ? undefined
    : consumablesArg === 'none'
      ? []
      : consumablesArg.split(',').map((s) => {
          const c = CONSUMABLES_BY_ID[s.trim()];
          if (!c) {
            throw new Error(
              `unknown consumable '${s.trim()}' (${Object.keys(CONSUMABLES_BY_ID).join('/')})`,
            );
          }
          return c;
        });

const player = makeMage({ discipline }, gear, level, talents, consumables);

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const sortDesc = (rec: Record<string, number>) =>
  Object.entries(rec).sort((a, b) => b[1] - a[1]);

// ---- Grind report (--zone) -------------------------------------------------

const zoneName = strArg('zone', '');
if (zoneName) {
  const makePack = ZONES[zoneName];
  if (!makePack) throw new Error(`unknown zone '${zoneName}' (${Object.keys(ZONES).join('/')})`);
  const pack = makePack();
  const bandMax = packBandMax(pack);

  const started = performance.now();
  const rates = grindRates({ player, stance, pack }, DEFAULT_PULL_CYCLE, n, seed);
  const elapsed = performance.now() - started;

  if (flag('json')) {
    console.log(JSON.stringify({ zone: zoneName, level, bandMax, ...rates }, null, 2));
    process.exit(0);
  }

  const adjustedXp = devalue(rates.xpPerHour, level, bandMax);
  console.log(`\n${pack.name} — level ${level}, ${n} pulls, seed ${seed} (${(elapsed / 1000).toFixed(1)}s)`);
  console.log(
    `  character: ${player.stats.spellPower} SP, ${player.stats.maxHp} HP, ${player.abilities.length} abilities, discipline ${discipline}, gear ${gearName}`,
  );
  console.log(`  zone band: ${pack.mobs[0]!.levelBand.min}–${bandMax}  (${pack.mobs.length} mobs/pull)`);
  console.log(`\n  XP/hour:        ${Math.round(rates.xpPerHour)} raw`);
  if (adjustedXp < rates.xpPerHour - 0.5) {
    console.log(`                  ${Math.round(adjustedXp)} after overlevel devaluation`);
  }
  console.log(`  Risk tier:      ${rates.riskTier}`);
  console.log(`  Deaths/hour:    ${rates.deathsPerHour.toFixed(2)}`);
  console.log(`  Kills/hour:     ${Math.round(rates.killsPerHour)}`);
  console.log(
    `  Pull:           ${mmss(rates.avgPullMs)} avg  (${rates.avgXpPerPull.toFixed(1)} XP, ${pct(rates.deathRatePerPull)} died)`,
  );
  console.log();
  process.exit(0);
}

// ---- Dungeon encounter report (--encounter, party of 3) --------------------

const encounterName = strArg('encounter', '');
if (encounterName) {
  const dungeon = makeEmberForge();
  const enc = encounterById(dungeon, encounterName);
  if (!enc) {
    throw new Error(
      `unknown encounter '${encounterName}' (${dungeon.encounters.map((e) => e.id).join('/')})`,
    );
  }
  // Party tuning knobs: --pgear <naked|starter|default|resist|best> (mage has
  // no 'resist'-less gap: unprefixed sets), --pdisc <n>, --pcons <id,…|none>.
  const tier = strArg('pgear', 'default');
  const gearFor = (cls: string) => {
    const key = cls === 'mage' ? tier : `${cls}-${tier}`;
    const g = GEAR_SETS[key];
    if (!g) throw new Error(`no gear set '${key}'`);
    return g;
  };
  const pdisc = arg('pdisc', 50);
  const pconsArg = strArg('pcons', '');
  const pcons =
    pconsArg === '' || pconsArg === 'none'
      ? []
      : pconsArg.split(',').map((s) => {
          const c = CONSUMABLES_BY_ID[s.trim()];
          if (!c) throw new Error(`unknown consumable '${s.trim()}'`);
          return c;
        });
  const defs = applyComp(
    [
      makeWarrior({ discipline: pdisc }, gearFor('warrior'), 10, pcons),
      makePriest({ discipline: pdisc }, gearFor('priest'), 10, pcons),
      makeMage({ discipline: pdisc }, gearFor('mage'), 10, talents, pcons),
    ],
    GROUP_CDS,
    COMP_PASSIVES,
  );
  const party = defs.map((character) => ({ character, stance: { ...stance } }));
  const boss = enc.kind === 'boss' ? tuneBoss(enc.boss) : undefined;
  const psetup = enc.kind === 'boss' ? { party, boss: boss! } : { party, pack: enc.pack };

  const started = performance.now();
  const result = runMonteCarlo(psetup, n, seed);
  const elapsed = performance.now() - started;

  // Per-character averages across runs (from the stream-derived summaries).
  const charAgg = new Map<string, { name: string; dps: number; hps: number; taken: number; deaths: number }>();
  for (const r of result.runs) {
    for (const [id, c] of Object.entries(r.perCharacter ?? {})) {
      const agg = charAgg.get(id) ?? { name: c.name, dps: 0, hps: 0, taken: 0, deaths: 0 };
      agg.dps += c.dps;
      agg.hps += c.hps;
      agg.taken += c.damageTaken;
      agg.deaths += c.died ? 1 : 0;
      charAgg.set(id, agg);
    }
  }

  if (flag('json')) {
    const { runs, ...aggregate } = result;
    const perCharacter = Object.fromEntries(
      [...charAgg.entries()].map(([id, a]) => [
        id,
        { name: a.name, dps: a.dps / n, hps: a.hps / n, damageTaken: a.taken / n, deathRate: a.deaths / n },
      ]),
    );
    console.log(JSON.stringify({ encounter: enc.id, ...aggregate, perCharacter }, null, 2));
    process.exit(0);
  }

  console.log(`\n${enc.name} (${dungeon.name}) — trinity, ${n} runs, seed ${seed} (${(elapsed / 1000).toFixed(1)}s)`);
  console.log(
    `  party gear ${tier}  discipline ${pdisc}  consumables ${pcons.length ? pcons.map((c) => c.id).join(',') : 'none'}  stance: offense ${stance.offense} targeting ${stance.targeting} potion <${stance.potionThresholdPct}%`,
  );
  console.log(`\n  Kill rate:      ${pct(result.killRate)}`);
  for (const [kind, count] of sortDesc(result.lossBreakdown as Record<string, number>)) {
    console.log(`    lost to ${kind}: ${pct(count / n)}`);
  }
  if (result.timeToKillMs.mean > 0) {
    const t = result.timeToKillMs;
    console.log(
      `  Time to kill:   ${mmss(t.mean)} ± ${mmss(t.stddev)}   (p10 ${mmss(t.p10)}, p90 ${mmss(t.p90)})`,
    );
  }
  console.log(`  Party DPS:      ${result.dps.mean.toFixed(0)} ± ${result.dps.stddev.toFixed(0)}`);
  console.log(`  Mistakes/run:   ${result.avgMistakesPerRun.toFixed(1)}`);
  console.log(`\n  Per character (avg/run):`);
  for (const [id, a] of charAgg) {
    console.log(
      `    ${a.name.padEnd(12)} (${id.padEnd(7)})  dps ${(a.dps / n).toFixed(0).padStart(4)}  hps ${(a.hps / n).toFixed(0).padStart(4)}  taken ${(a.taken / n).toFixed(0).padStart(6)}  died ${pct(a.deaths / n)}`,
    );
  }
  if (Object.keys(result.deathCauses).length > 0) {
    console.log(`  Death causes:`);
    for (const [cause, count] of sortDesc(result.deathCauses).slice(0, 4)) {
      console.log(`    ${cause}: ${count}`);
    }
  }
  if (flag('trace')) {
    const one = runFight({ ...psetup, seed });
    console.log(`\n  Trace of run seed=${seed} (${one.result}, ${mmss(one.durationMs)}), last 30 events:`);
    for (const line of formatEvents(one.events).slice(-30)) console.log(`    ${line}`);
  }
  console.log();
  process.exit(0);
}

const bossName = strArg('boss', 'cinder-maw');
const BOSSES: Record<string, (o?: Partial<BossDefinition>) => BossDefinition> = {
  'cinder-maw': makeCinderMaw,
  'bandit-warlord': makeBanditWarlord,
  emberwing: makeEmberwing,
  slagmaw: makeSlagmaw,
  vulkan: makeVulkan,
};

// ---- Raid tuning mode (--raid: canonical 2 tanks / 3 healers / 5 dps) -------
// Additive dev harness: the only 10-man path (the --encounter path is a fixed
// trinity). Party knobs mirror --encounter: --pgear/--pdisc/--pcons; the boss
// is --boss with the usual --hp/--enrage overrides (existing bosses are 3-char
// tuned, so scale hp/enrage for a real 10-man check).
if (flag('raid')) {
  const tier = strArg('pgear', 'default');
  const gearFor = (cls: string) => {
    const key = cls === 'mage' ? tier : `${cls}-${tier}`;
    const g = GEAR_SETS[key];
    if (!g) throw new Error(`no gear set '${key}'`);
    return g;
  };
  const pdisc = arg('pdisc', 50);
  const pconsArg = strArg('pcons', '');
  const pcons =
    pconsArg === '' || pconsArg === 'none'
      ? []
      : pconsArg.split(',').map((s) => {
          const c = CONSUMABLES_BY_ID[s.trim()];
          if (!c) throw new Error(`unknown consumable '${s.trim()}'`);
          return c;
        });
  const raw = [
    makeWarrior({ discipline: pdisc }, gearFor('warrior'), 10, pcons),
    makeWarrior({ discipline: pdisc }, gearFor('warrior'), 10, pcons),
    makePriest({ discipline: pdisc }, gearFor('priest'), 10, pcons),
    makePriest({ discipline: pdisc }, gearFor('priest'), 10, pcons),
    makePriest({ discipline: pdisc }, gearFor('priest'), 10, pcons),
    ...Array.from({ length: 5 }, () => makeMage({ discipline: pdisc }, gearFor('mage'), 10, talents, pcons)),
  ];
  // makeX hardcodes one id per class — give every member a unique id (tanks
  // first) BEFORE applyComp / the Fight, else the constructor throws on dupes.
  const idCounts: Record<string, number> = {};
  const ided = raw.map((c) => {
    const k = c.classId!;
    idCounts[k] = (idCounts[k] ?? 0) + 1;
    return { ...c, id: `${k}${idCounts[k]}` };
  });
  const defs = applyComp(ided, GROUP_CDS, COMP_PASSIVES);
  const party = defs.map((character) => ({ character, stance: { ...stance } }));
  const makeRaidBoss = BOSSES[bossName];
  if (!makeRaidBoss) throw new Error(`unknown boss '${bossName}' (${Object.keys(BOSSES).join('/')})`);
  const boss = tuneBoss(makeRaidBoss());

  const started = performance.now();
  const result = runMonteCarlo({ party, boss }, n, seed);
  const elapsed = performance.now() - started;

  const charAgg = new Map<string, { name: string; role: string; dps: number; hps: number; taken: number; deaths: number }>();
  for (const r of result.runs) {
    for (const [id, c] of Object.entries(r.perCharacter ?? {})) {
      const agg = charAgg.get(id) ?? { name: c.name, role: c.role ?? '', dps: 0, hps: 0, taken: 0, deaths: 0 };
      agg.dps += c.dps;
      agg.hps += c.hps;
      agg.taken += c.damageTaken;
      agg.deaths += c.died ? 1 : 0;
      charAgg.set(id, agg);
    }
  }

  if (flag('json')) {
    const { runs, ...aggregate } = result;
    const perCharacter = Object.fromEntries(
      [...charAgg.entries()].map(([id, a]) => [
        id,
        { name: a.name, role: a.role, dps: a.dps / n, hps: a.hps / n, damageTaken: a.taken / n, deathRate: a.deaths / n },
      ]),
    );
    console.log(JSON.stringify({ raid: '2t/3h/5d', boss: boss.id, ...aggregate, perCharacter }, null, 2));
    process.exit(0);
  }

  console.log(`\n${boss.name} — raid 2t/3h/5d (10), ${n} runs, seed ${seed} (${(elapsed / 1000).toFixed(1)}s)`);
  console.log(
    `  party gear ${tier}  discipline ${pdisc}  consumables ${pcons.length ? pcons.map((c) => c.id).join(',') : 'none'}  hp ${boss.hp}  enrage ${mmss(enrageMechanic(boss)?.atMs ?? 0)}`,
  );
  console.log(`\n  Kill rate:      ${pct(result.killRate)}`);
  for (const [kind, count] of sortDesc(result.lossBreakdown as Record<string, number>)) {
    console.log(`    lost to ${kind}: ${pct(count / n)}`);
  }
  if (result.timeToKillMs.mean > 0) {
    const t = result.timeToKillMs;
    console.log(`  Time to kill:   ${mmss(t.mean)} ± ${mmss(t.stddev)}   (p10 ${mmss(t.p10)}, p90 ${mmss(t.p90)})`);
  }
  console.log(`  Party DPS:      ${result.dps.mean.toFixed(0)} ± ${result.dps.stddev.toFixed(0)}`);
  console.log(`\n  Per character (avg/run):`);
  for (const [id, a] of charAgg) {
    console.log(
      `    ${a.name.padEnd(8)} (${id.padEnd(8)} ${a.role.padEnd(6)})  dps ${(a.dps / n).toFixed(0).padStart(4)}  hps ${(a.hps / n).toFixed(0).padStart(4)}  taken ${(a.taken / n).toFixed(0).padStart(6)}  died ${pct(a.deaths / n)}`,
    );
  }
  if (Object.keys(result.deathCauses).length > 0) {
    console.log(`  Death causes:`);
    for (const [cause, count] of sortDesc(result.deathCauses).slice(0, 5)) {
      console.log(`    ${cause}: ${count}`);
    }
  }
  console.log();
  process.exit(0);
}

// ---- Boss report (default) -------------------------------------------------

const makeBoss = BOSSES[bossName];
if (!makeBoss) throw new Error(`unknown boss '${bossName}' (${Object.keys(BOSSES).join('/')})`);

const setup = {
  player,
  boss: tuneBoss(makeBoss()),
  stance,
};

const started = performance.now();
const result = runMonteCarlo(setup, n, seed);
const elapsed = performance.now() - started;

if (flag('json')) {
  const { runs, ...aggregate } = result;
  console.log(JSON.stringify(aggregate, null, 2));
  process.exit(0);
}

console.log(`\n${setup.boss.name} — level ${level}, ${n} runs, seed ${seed} (${(elapsed / 1000).toFixed(1)}s)`);
console.log(
  `  stance: offense ${stance.offense}  targeting ${stance.targeting}  potion <${stance.potionThresholdPct}%  barrier ${stance.barrierPolicy ?? 'reactive'}  discipline ${discipline}  gear ${gearName}  talents ${talents.length ? talents.join(',') : 'none'}  consumables ${consumables === undefined ? 'legacy' : consumables.length ? consumables.map((c) => c.id).join(',') : 'none'} (${setup.player.stats.spellPower} SP, ${setup.player.stats.maxHp} HP)`,
);
console.log(`\n  Kill rate:      ${pct(result.killRate)}`);
for (const [kind, count] of sortDesc(result.lossBreakdown as Record<string, number>)) {
  console.log(`    lost to ${kind}: ${pct(count / n)}`);
}
if (result.timeToKillMs.mean > 0) {
  const t = result.timeToKillMs;
  console.log(
    `  Time to kill:   ${mmss(t.mean)} ± ${mmss(t.stddev)}   (p10 ${mmss(t.p10)}, p90 ${mmss(t.p90)})`,
  );
}
console.log(
  `  DPS:            ${result.dps.mean.toFixed(0)} ± ${result.dps.stddev.toFixed(0)}   (p10 ${result.dps.p10.toFixed(0)}, p90 ${result.dps.p90.toFixed(0)})`,
);
console.log(`  Mistakes/run:   ${result.avgMistakesPerRun.toFixed(1)}`);
for (const [kind, count] of sortDesc(result.mistakeCounts).slice(0, 4)) {
  console.log(`    ${kind}: ${(count / n).toFixed(2)}/run`);
}
if (Object.keys(result.deathCauses).length > 0) {
  console.log(`  Death causes:`);
  for (const [cause, count] of sortDesc(result.deathCauses).slice(0, 4)) {
    console.log(`    ${cause}: ${count}`);
  }
}

if (flag('trace')) {
  const one = runFight({ ...setup, seed });
  console.log(`\n  Trace of run seed=${seed} (${one.result}, ${mmss(one.durationMs)}), last 25 events:`);
  for (const line of formatEvents(one.events).slice(-25)) console.log(`    ${line}`);
}
console.log();
