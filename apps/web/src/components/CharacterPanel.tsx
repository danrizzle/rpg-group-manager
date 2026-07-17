import {
  LEVEL_CAP,
  MAGE_TALENTS,
  UNLOCKS,
  intentsUpToLevel,
  itemsForSlot,
  levelForXp,
  makeMage,
  mistakeChance,
  reactionTimeMs,
  totalXpToReach,
  unlockedControls,
  xpToNext,
  type GearSlot,
  type ItemBonuses,
} from '@rpg/engine';
import { useMemo } from 'react';
import { POTION_STEPS, resolveGear, STANCES, TARGET_STEPS, useStore } from '../store';
import { LoadoutPanel } from './LoadoutPanel';
import { TalentPanel } from './TalentPanel';

const SLOTS: { slot: GearSlot; label: string }[] = [
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'ring', label: 'Ring' },
  { slot: 'trinket', label: 'Trinket' },
];

/** Intent id → the level it unlocks at (from the engine's unlock arc). */
const INTENT_LEVEL: Record<string, number> = Object.fromEntries(
  UNLOCKS.flatMap((u) => u.intents.map((i) => [i, u.level])),
);

function bonusText(b: ItemBonuses): string {
  const parts: string[] = [];
  if (b.spellPower) parts.push(`+${b.spellPower} SP`);
  if (b.maxHp) parts.push(`+${b.maxHp} HP`);
  if (b.critChance) parts.push(`+${Math.round(b.critChance * 100)}% crit`);
  if (b.hastePct) parts.push(`+${b.hastePct}% haste`);
  if (b.armor) parts.push(`+${b.armor} armor`);
  for (const [type, v] of Object.entries(b.resistances ?? {})) parts.push(`+${v} ${type} res`);
  if (b.discipline) parts.push(`+${b.discipline} discipline`);
  if (b.aoeEfficiency) parts.push(`+${Math.round(b.aoeEfficiency * 100)}% AoE eff`);
  if (b.damageWhileMoving) parts.push(`+${Math.round(b.damageWhileMoving * 100)}% dmg moving`);
  return parts.join(', ');
}

function DevSlider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <label className="slider">
      <div className="slider-head">
        <span>{props.label}</span>
        <span className="slider-value">{props.format(props.value)}</span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function CharacterPanel() {
  const stance = useStore((s) => s.stance);
  const behavior = useStore((s) => s.behavior);
  const setStance = useStore((s) => s.setStance);
  const setBehavior = useStore((s) => s.setBehavior);
  const applyAutoPreset = useStore((s) => s.applyAutoPreset);
  const gear = useStore((s) => s.gear);
  const setGear = useStore((s) => s.setGear);
  const xp = useStore((s) => s.xp);
  const talents = useStore((s) => s.talents);
  const level = levelForXp(xp);
  const mage = useMemo(
    () => makeMage(behavior, resolveGear(gear), level, talents),
    [behavior, gear, level, talents],
  );

  const activeStance = STANCES.find((st) => st.offense === stance.offense);
  const fireRes = mage.stats.resistances.fire ?? 0;

  const intents = new Set(intentsUpToLevel(level));
  const nextUnlock = UNLOCKS.find((u) => u.level > level);
  const targetsUnlocked = intents.has('target-steps');
  const potionUnlocked = intents.has('potion-threshold');
  const burstUnlocked = intents.has('burst-cd-control');
  const barrierUnlocked = unlockedControls(MAGE_TALENTS, talents).has('barrier-policy');

  // XP bar: progress within the current level (cap shows full).
  const atCap = level >= LEVEL_CAP;
  const into = xp - totalXpToReach(level);
  const span = xpToNext(level);
  const xpPct = atCap ? 100 : Math.max(0, Math.min(100, (into / span) * 100));

  return (
    <section className="panel">
      <h2>Elara the Mage</h2>
      <div className="statline">
        Level {level}
        {atCap ? ' · MAX' : ` · ${Math.floor(into)} / ${span} XP`}
      </div>
      <div className="bar">
        <div className="bar-fill bar-xp" style={{ width: `${xpPct}%` }} />
      </div>
      <div className="statline">
        {mage.stats.maxHp} HP · {mage.stats.spellPower} SP · {Math.round(mage.stats.critChance * 100)}% crit
        {mage.stats.hastePct > 0 && ` · ${mage.stats.hastePct}% haste`}
        {fireRes > 0 && ` · ${fireRes} fire res`}
      </div>

      <div className="preset-row">
        <h3>Intent</h3>
        <button className="btn btn-small" onClick={applyAutoPreset} title="The AFK floor: what a fresh character runs on with zero configuration">
          Auto preset
        </button>
      </div>

      <div className="control">
        <div className="control-label">Stance</div>
        <div className="segmented">
          {STANCES.map((st) => {
            const locked = !intents.has(st.intent);
            return (
              <button
                key={st.id}
                className={`btn btn-small ${st.offense === stance.offense ? 'btn-active' : ''}`}
                disabled={locked}
                title={locked ? `Unlocks at level ${INTENT_LEVEL[st.intent]}` : st.desc}
                onClick={() => setStance({ offense: st.offense })}
              >
                {st.label}
              </button>
            );
          })}
        </div>
        <div className="control-desc">{activeStance?.desc ?? 'Custom (set via dev tools)'}</div>
      </div>

      <div className="control">
        <div className="control-label">Targets</div>
        <div className="segmented">
          {TARGET_STEPS.map((t) => (
            <button
              key={t.label}
              className={`btn btn-small ${t.value === stance.targeting ? 'btn-active' : ''}`}
              disabled={!targetsUnlocked}
              onClick={() => setStance({ targeting: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {!targetsUnlocked && <div className="control-desc">locked — unlocks at level {INTENT_LEVEL['target-steps']}</div>}
      </div>

      <div className="control">
        <div className="control-label">Use potion</div>
        <select
          value={stance.potionThresholdPct}
          disabled={!potionUnlocked}
          onChange={(e) => setStance({ potionThresholdPct: Number(e.target.value) })}
        >
          {POTION_STEPS.map((p) => (
            <option key={p} value={p}>
              {p === 0 ? 'never' : `at HP < ${p}%`}
            </option>
          ))}
        </select>
        {!potionUnlocked && <div className="control-desc">locked — unlocks at level {INTENT_LEVEL['potion-threshold']}</div>}
      </div>

      <div className="control">
        <div className="control-label">Burst CDs</div>
        <select value={stance.burstCds} disabled>
          <option value="automatic">automatic</option>
          <option value="save-for-plan-window">
            {burstUnlocked ? 'save for plan window' : `save for plan window (Lv ${INTENT_LEVEL['burst-cd-control']})`}
          </option>
        </select>
      </div>

      <div className="control">
        <div className="control-label">Barrier policy</div>
        <select
          value={stance.barrierPolicy ?? 'reactive'}
          disabled={!barrierUnlocked}
          onChange={(e) => setStance({ barrierPolicy: e.target.value as 'reactive' | 'proactive' })}
        >
          <option value="reactive">reactive (when hurt)</option>
          <option value="proactive">proactive (on cooldown)</option>
        </select>
        {!barrierUnlocked && <div className="control-desc">locked — requires the Glacial Barrier talent</div>}
      </div>

      <h3>Gear</h3>
      {SLOTS.map(({ slot, label }) => (
        <div className="control" key={slot}>
          <div className="control-label">{label}</div>
          <select value={gear[slot]} onChange={(e) => setGear(slot, e.target.value)}>
            <option value="">— empty —</option>
            {itemsForSlot(slot).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (t{item.tier}) — {bonusText(item.bonuses)}
              </option>
            ))}
          </select>
        </div>
      ))}

      <TalentPanel level={level} />

      <h3>Earned stats</h3>
      <p className="muted">
        Execution quality — later earned via talents, gear and training. Dev overrides for tuning:
      </p>
      <DevSlider
        label="Discipline"
        value={behavior.discipline}
        min={0}
        max={100}
        step={5}
        onChange={(v) => setBehavior({ discipline: v })}
        format={(v) => String(v)}
      />
      <div className="statline">
        reacts in {(reactionTimeMs(behavior.discipline) / 1000).toFixed(1)}s ·{' '}
        {(mistakeChance(behavior.discipline) * 100).toFixed(1)}% mistake chance per action
      </div>
      <DevSlider
        label="AoE efficiency"
        value={behavior.aoeEfficiency}
        min={0.5}
        max={1.5}
        step={0.05}
        onChange={(v) => setBehavior({ aoeEfficiency: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <DevSlider
        label="Damage while moving"
        value={behavior.damageWhileMoving}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => setBehavior({ damageWhileMoving: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />

      <h3>Abilities</h3>
      <ul className="ability-list">
        {mage.abilities.map((a) => (
          <li key={a.id}>
            <span className="ability-name">{a.name}</span>
            <span className="ability-info">
              {a.castTimeMs > 0 ? `${a.castTimeMs / 1000}s cast` : 'instant'}
              {a.cooldownMs > 0 ? ` · ${a.cooldownMs / 1000}s cd` : ''}
              {' · '}
              {a.tags.join(', ')}
            </span>
          </li>
        ))}
      </ul>
      {nextUnlock && (
        <p className="muted">
          Next at level {nextUnlock.level}: {[...nextUnlock.abilities, ...nextUnlock.intents].join(', ')}
        </p>
      )}

      <LoadoutPanel />
    </section>
  );
}
