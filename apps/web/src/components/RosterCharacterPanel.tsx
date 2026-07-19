import {
  CONSUMABLES,
  CONSUMABLE_SLOTS,
  itemsForSlot,
  makePriest,
  makeWarrior,
  mistakeChance,
  reactionTimeMs,
  type GearSlot,
  type ItemBonuses,
} from '@rpg/engine';
import { useMemo } from 'react';
import { CLASSES, MAKERS, POTION_STEPS, resolveGear, STANCES, useCharBuild, useStore } from '../store';
import { resolveConsumables } from '../world/professions';
import type { CharId } from '../world/types';
import { TalentPanel } from './TalentPanel';

const SLOTS: { slot: GearSlot; label: string }[] = [
  { slot: 'weapon', label: 'Weapon' },
  { slot: 'chest', label: 'Chest' },
  { slot: 'ring', label: 'Ring' },
  { slot: 'trinket', label: 'Trinket' },
];

function bonusText(b: ItemBonuses): string {
  const parts: string[] = [];
  if (b.spellPower) parts.push(`+${b.spellPower} SP`);
  if (b.attackPower) parts.push(`+${b.attackPower} AP`);
  if (b.healingPower) parts.push(`+${b.healingPower} healing`);
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

/**
 * Build panel for a recruit. Recruits arrive at the cap, so every base intent
 * is unlocked. Slice 8 made this class-generic (it was a warrior/priest
 * ternary) — it now works for any class in the registry.
 */
export function RosterCharacterPanel({ charId }: { charId: CharId }) {
  const build = useCharBuild(charId);
  const setRosterStance = useStore((s) => s.setStance);
  const setRosterGear = useStore((s) => s.setGear);
  const setRosterConsumableSlot = useStore((s) => s.setConsumableSlot);
  const inventory = useStore((s) => s.inventory);
  const cls = CLASSES[build.classId];
  const meta = { classLabel: cls.label, role: cls.role };
  const level = build.level;

  // Preview at nominal charges (no inventory arg), like Elara's stat line.
  const def = useMemo(
    () =>
      MAKERS[build.classId](
        undefined,
        resolveGear(build.gear),
        level,
        build.talents,
        resolveConsumables(build.consumables),
      ),
    [build.classId, build.gear, build.consumables, build.talents, level],
  );

  const activeStance = STANCES.find((st) => st.offense === build.stance.offense);
  const fireRes = def.stats.resistances.fire ?? 0;

  return (
    <>
      <div className="statline">
        Level {level} · MAX · {meta.classLabel} ({meta.role})
      </div>
      <div className="statline">
        {def.stats.maxHp} HP
        {def.stats.attackPower > 0 && ` · ${def.stats.attackPower} AP`}
        {def.stats.healingPower > 0 && ` · ${def.stats.healingPower} healing`}
        {def.stats.spellPower > 0 && ` · ${def.stats.spellPower} SP`}
        {` · ${def.stats.armor} armor`}
        {fireRes > 0 && ` · ${fireRes} fire res`}
      </div>

      <h3>Intent</h3>
      <div className="control">
        <div className="control-label">Stance</div>
        <div className="segmented">
          {STANCES.map((st) => (
            <button
              key={st.id}
              className={`btn btn-small ${st.offense === build.stance.offense ? 'btn-active' : ''}`}
              title={st.desc}
              onClick={() => setRosterStance(charId, { offense: st.offense })}
            >
              {st.label}
            </button>
          ))}
        </div>
        <div className="control-desc">
          {activeStance?.desc ?? 'Custom'}
          {charId === 'priest' && ' Guarded heals earlier; Reckless squeezes in more Smite.'}
        </div>
      </div>

      <div className="control">
        <div className="control-label">Use potion</div>
        <select
          value={build.stance.potionThresholdPct}
          onChange={(e) => setRosterStance(charId, { potionThresholdPct: Number(e.target.value) })}
        >
          {POTION_STEPS.map((p) => (
            <option key={p} value={p}>
              {p === 0 ? 'never' : `at HP < ${p}%`}
            </option>
          ))}
        </select>
      </div>

      <h3>Gear</h3>
      {SLOTS.map(({ slot, label }) => (
        <div className="control" key={slot}>
          <div className="control-label">{label}</div>
          <select value={build.gear[slot]} onChange={(e) => setRosterGear(charId, slot, e.target.value)}>
            <option value="">— empty —</option>
            {itemsForSlot(slot, charId).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} (t{item.tier}) — {bonusText(item.bonuses)}
              </option>
            ))}
          </select>
        </div>
      ))}

      <TalentPanel charId={charId} level={10} />

      <h3>Consumables ({CONSUMABLE_SLOTS} slots)</h3>
      <p className="muted">
        The whole party draws on the bank's shared stock — slots claim it in party order at pull
        time.
      </p>
      {Array.from({ length: CONSUMABLE_SLOTS }, (_, i) => {
        const id = build.consumables[i] ?? '';
        const stock = id ? inventory[id] ?? 0 : 0;
        return (
          <div className="control" key={i}>
            <div className="control-label">Slot {i + 1}</div>
            <select value={id} onChange={(e) => setRosterConsumableSlot(charId, i, e.target.value)}>
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

      <h3>Earned stats</h3>
      <div className="statline">
        discipline {def.behavior.discipline} · reacts in{' '}
        {(reactionTimeMs(def.behavior.discipline) / 1000).toFixed(1)}s ·{' '}
        {(mistakeChance(def.behavior.discipline) * 100).toFixed(1)}% mistake chance
      </div>
      <p className="muted">
        Familiarity with each boss grows per attempt (wipes included) and adds bonus discipline
        against that boss — see the journal.
      </p>

      <h3>Abilities</h3>
      <ul className="ability-list">
        {def.abilities.map((a) => (
          <li key={a.id}>
            <span className="ability-name">{a.name}</span>
            <span className="ability-info">
              {a.castTimeMs > 0 ? `${a.castTimeMs / 1000}s cast` : 'instant'}
              {a.cooldownMs > 0 ? ` · ${a.cooldownMs / 1000}s cd` : ''}
              {a.tags.length > 0 ? ` · ${a.tags.join(', ')}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
