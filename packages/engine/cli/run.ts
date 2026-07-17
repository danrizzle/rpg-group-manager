/**
 * Standalone tuning harness.
 *
 * Boss report (default) — N Monte Carlo runs of the Mage vs. a boss:
 *   pnpm cli -- --n 5000 --seed 42 --level 10 --gear best --boss cinder-maw \
 *               --offense 0.6 --targeting 0.5 --potion 35 --discipline 50 \
 *               --talents throughput|defense|id,id,… --barrier reactive|proactive \
 *               [--trace] [--json]
 *
 * Grind report — sim-derived XP/hour, risk tier and deaths/hour for a zone:
 *   pnpm cli -- --level 2 --zone heartfield --gear starter
 */
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeBanditWarlord } from '../src/content/bosses/banditWarlord';
import { makeEmberwing } from '../src/content/bosses/emberwing';
import { makeMage } from '../src/content/classes/mage';
import { TALENT_BUILDS } from '../src/content/classes/mageTalents';
import { ZONES } from '../src/content/mobs/zones';
import { GEAR_SETS } from '../src/content/items';
import { packBandMax } from '../src/model/mobPack';
import type { BossDefinition } from '../src/model/boss';
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

const player = makeMage({ discipline }, gear, level, talents);

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

// ---- Boss report (default) -------------------------------------------------

const BOSSES: Record<string, (o?: Partial<BossDefinition>) => BossDefinition> = {
  'cinder-maw': makeCinderMaw,
  'bandit-warlord': makeBanditWarlord,
  emberwing: makeEmberwing,
};
const bossName = strArg('boss', 'cinder-maw');
const makeBoss = BOSSES[bossName];
if (!makeBoss) throw new Error(`unknown boss '${bossName}' (${Object.keys(BOSSES).join('/')})`);

const setup = {
  player,
  boss: makeBoss({
    ...(arg('hp', 0) > 0 ? { hp: arg('hp', 0) } : {}),
    ...(arg('enrage', 0) > 0 ? { enrageAtMs: arg('enrage', 0) * 1000 } : {}),
  }),
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
  `  stance: offense ${stance.offense}  targeting ${stance.targeting}  potion <${stance.potionThresholdPct}%  barrier ${stance.barrierPolicy ?? 'reactive'}  discipline ${discipline}  gear ${gearName}  talents ${talents.length ? talents.join(',') : 'none'} (${setup.player.stats.spellPower} SP, ${setup.player.stats.maxHp} HP)`,
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
