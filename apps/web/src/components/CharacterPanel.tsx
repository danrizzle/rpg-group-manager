import {
  CONSUMABLES,
  CONSUMABLE_SLOTS,
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
import {
  DEFAULT_BEHAVIOR,
  POTION_STEPS,
  resolveGear,
  STANCES,
  TARGET_STEPS,
  useCharBuild,
  useRoster,
  useStore,
} from '../store';
import type { CharId } from '../world/types';
import { resolveConsumables } from '../world/professions';
import { LoadoutPanel } from './LoadoutPanel';
import { RecruitBar } from './RecruitBar';
import { RosterCharacterPanel } from './RosterCharacterPanel';
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

function ElaraPanel({ charId }: { charId: CharId }) {
  const { stance, behavior, gear, talents, level, consumables: equippedConsumables } =
    useCharBuild(charId);
  const setStanceRaw = useStore((s) => s.setStance);
  const setBehaviorRaw = useStore((s) => s.setBehavior);
  const applyAutoPresetRaw = useStore((s) => s.applyAutoPreset);
  const setGearRaw = useStore((s) => s.setGear);
  const setConsumableSlotRaw = useStore((s) => s.setConsumableSlot);
  const inventory = useStore((s) => s.inventory);
  // Bind the char-scoped actions once so the JSX below reads as it did before.
  const setStance = (patch: Parameters<typeof setStanceRaw>[1]) => setStanceRaw(charId, patch);
  const setBehavior = (patch: Parameters<typeof setBehaviorRaw>[1]) => setBehaviorRaw(charId, patch);
  const applyAutoPreset = () => applyAutoPresetRaw(charId);
  const setGear = (slot: Parameters<typeof setGearRaw>[1], itemId: string) =>
    setGearRaw(charId, slot, itemId);
  const setConsumableSlot = (slot: number, id: string) => setConsumableSlotRaw(charId, slot, id);
  const xp = useStore((st) => st.characters[charId]?.xp ?? 0);
  // The dev sliders need concrete numbers; a character with no override shows
  // the shared defaults (only Elara has sliders, and she always has values).
  const bh = { ...DEFAULT_BEHAVIOR, ...behavior };
  // Preview at nominal charges (no inventory arg): the stat line shows what
  // the equipped slots do, independent of current stock.
  const mage = useMemo(
    () => makeMage(behavior, resolveGear(gear), level, talents, resolveConsumables(equippedConsumables)),
    [behavior, gear, level, talents, equippedConsumables],
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
    <>
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
        <select
          value={stance.burstCds}
          disabled={!burstUnlocked}
          onChange={(e) => setStance({ burstCds: e.target.value as 'automatic' | 'save-for-plan-window' })}
        >
          <option value="automatic">automatic</option>
          <option value="save-for-plan-window">save for plan window</option>
        </select>
        {!burstUnlocked ? (
          <div className="control-desc">locked — unlocks at level {INTENT_LEVEL['burst-cd-control']}</div>
        ) : stance.burstCds === 'save-for-plan-window' ? (
          <div className="control-desc">burst CDs fire only when a plan or call asks for them</div>
        ) : null}
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
            {itemsForSlot(slot, 'mage').map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (t{item.tier}) — {bonusText(item.bonuses)}
              </option>
            ))}
          </select>
        </div>
      ))}

      {potionUnlocked && (
        <>
          <h3>Consumables ({CONSUMABLE_SLOTS} slots)</h3>
          <p className="muted">
            Brought into every real fight and consumed there; the training dummy simulates them for
            free. Craft them via Alchemy on the world map.
          </p>
          {Array.from({ length: CONSUMABLE_SLOTS }, (_, i) => {
            const id = equippedConsumables[i] ?? '';
            const stock = id ? inventory[id] ?? 0 : 0;
            return (
              <div className="control" key={i}>
                <div className="control-label">Slot {i + 1}</div>
                <select value={id} onChange={(e) => setConsumableSlot(i, e.target.value)}>
                  <option value="">— empty —</option>
                  {CONSUMABLES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {inventory[c.id] ?? 0} in bag
                    </option>
                  ))}
                </select>
                {id && stock === 0 && (
                  <div className="control-desc">out of stock — slot inert next pull</div>
                )}
              </div>
            );
          })}
        </>
      )}

      <TalentPanel charId="mage" level={level} />

      <h3>Earned stats</h3>
      <p className="muted">
        Execution quality — later earned via talents, gear and training. Dev overrides for tuning:
      </p>
      <DevSlider
        label="Discipline"
        value={bh.discipline}
        min={0}
        max={100}
        step={5}
        onChange={(v) => setBehavior({ discipline: v })}
        format={(v) => String(v)}
      />
      <div className="statline">
        reacts in {(reactionTimeMs(bh.discipline) / 1000).toFixed(1)}s ·{' '}
        {(mistakeChance(bh.discipline) * 100).toFixed(1)}% mistake chance per action
      </div>
      <DevSlider
        label="AoE efficiency"
        value={bh.aoeEfficiency}
        min={0.5}
        max={1.5}
        step={0.05}
        onChange={(v) => setBehavior({ aoeEfficiency: v })}
        format={(v) => `${Math.round(v * 100)}%`}
      />
      <DevSlider
        label="Damage while moving"
        value={bh.damageWhileMoving}
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

      <LoadoutPanel charId={charId} />
    </>
  );
}

/**
 * Character panel with a roster switcher (phase 4): Elara keeps the full
 * legacy panel (talents, loadouts, dev sliders); the recruits get their own
 * build panels once Cinder Maw has fallen.
 */
export function CharacterPanel() {
  const activeChar = useStore((s) => s.activeChar);
  const setActiveChar = useStore((s) => s.setActiveChar);
  const recruited = useStore((s) => s.unlocks.cinderMawKilled);
  const roster = useRoster();
  const meta = roster.find((c) => c.id === activeChar) ?? roster[0]!;
  // Elara keeps the full panel (dev sliders, loadouts); recruits get the
  // build panel. Slice 13 folds the two together.
  const isElara = meta.classId === 'mage' && meta.id === 'mage';

  return (
    <section className="panel">
      <RecruitBar />
      {recruited && (
        <div className="segmented roster-switcher" style={{ marginBottom: '0.5rem' }}>
          {roster.map((c) => (
            <button
              key={c.id}
              className={`btn btn-small ${meta.id === c.id ? 'btn-active' : ''}`}
              onClick={() => setActiveChar(c.id)}
              title={`${c.name} — ${c.classLabel} (${c.role})`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {isElara ? (
        <ElaraPanel charId={meta.id} />
      ) : (
        <>
          <h2>
            {meta.name} the {meta.classLabel}
          </h2>
          <RosterCharacterPanel charId={meta.id} />
        </>
      )}
    </section>
  );
}
