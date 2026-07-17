/**
 * Standalone test harness: N Monte Carlo iterations of the Mage vs.
 * Cinder Maw, distribution report on stdout.
 *
 *   pnpm cli -- --n 5000 --seed 42 --offense 0.6 --targeting 0.5 \
 *               --potion 35 --discipline 50 [--trace] [--json]
 */
import { makeCinderMaw } from '../src/content/bosses/cinderMaw';
import { makeMage } from '../src/content/classes/mage';
import { GEAR_SETS } from '../src/content/items';
import { DEFAULT_STANCE } from '../src/model/stance';
import { runFight } from '../src/sim/engine';
import { formatEvents } from '../src/analysis/metrics';
import { runMonteCarlo } from '../src/analysis/montecarlo';

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
const stance = {
  ...DEFAULT_STANCE,
  offense: arg('offense', DEFAULT_STANCE.offense),
  targeting: arg('targeting', DEFAULT_STANCE.targeting),
  potionThresholdPct: arg('potion', DEFAULT_STANCE.potionThresholdPct),
};
const discipline = arg('discipline', 50);
const gearName = strArg('gear', 'default');
const gear = GEAR_SETS[gearName];
if (!gear) throw new Error(`unknown gear set '${gearName}' (${Object.keys(GEAR_SETS).join('/')})`);

const setup = {
  player: makeMage({ discipline }, gear),
  boss: makeCinderMaw({
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

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mmss = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const sortDesc = (rec: Record<string, number>) =>
  Object.entries(rec).sort((a, b) => b[1] - a[1]);

console.log(`\n${setup.boss.name} — ${n} runs, seed ${seed} (${(elapsed / 1000).toFixed(1)}s)`);
console.log(
  `  stance: offense ${stance.offense}  targeting ${stance.targeting}  potion <${stance.potionThresholdPct}%  discipline ${discipline}  gear ${gearName} (${setup.player.stats.spellPower} SP, ${setup.player.stats.maxHp} HP)`,
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
