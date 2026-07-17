import { makeMage, mistakeChance, reactionTimeMs } from '@rpg/engine';
import { useMemo } from 'react';
import { POTION_STEPS, STANCES, TARGET_STEPS, useStore } from '../store';

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
  const mage = useMemo(() => makeMage(), []);

  const activeStance = STANCES.find((st) => st.offense === stance.offense);

  return (
    <section className="panel">
      <h2>Elara the Mage</h2>
      <div className="statline">
        {mage.stats.maxHp} HP · {mage.stats.spellPower} SP · {Math.round(mage.stats.critChance * 100)}% crit
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
          {STANCES.map((st) => (
            <button
              key={st.id}
              className={`btn btn-small ${st.offense === stance.offense ? 'btn-active' : ''}`}
              onClick={() => setStance({ offense: st.offense })}
            >
              {st.label}
            </button>
          ))}
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
              onClick={() => setStance({ targeting: t.value })}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="control">
        <div className="control-label">Use potion</div>
        <select
          value={stance.potionThresholdPct}
          onChange={(e) => setStance({ potionThresholdPct: Number(e.target.value) })}
        >
          {POTION_STEPS.map((p) => (
            <option key={p} value={p}>
              {p === 0 ? 'never' : `at HP < ${p}%`}
            </option>
          ))}
        </select>
      </div>

      <div className="control">
        <div className="control-label">Burst CDs</div>
        <select value={stance.burstCds} disabled>
          <option value="automatic">automatic</option>
          <option value="save-for-plan-window">save for plan window (locked)</option>
        </select>
      </div>

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
    </section>
  );
}
