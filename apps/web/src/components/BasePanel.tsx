import { Fragment } from 'react';
import { useStore } from '../store';
import {
  BUILDINGS,
  bankCapacity,
  canAffordTier,
  craftTimeMult,
  nextTier,
  type BuildingDefinition,
} from '../world/base';
import { MATERIAL_LABELS, RECIPES } from '../world/professions';
import type { Materials } from '../world/types';
import { AlchemyPanel } from './AlchemyPanel';
import { QueueStrip } from './QueueStrip';

/**
 * Home base v1 (GDD §5, slice 6): the economy's home — bank storage,
 * building upgrades, and the alchemy workshop's crafting UI. Always
 * reachable (no travel); the training arena is deferred past v1.
 */

const costText = (cost: Partial<Materials>): string =>
  Object.entries(cost)
    .map(([m, n]) => `${n} ${MATERIAL_LABELS[m as keyof Materials]}`)
    .join(' + ') || 'free';

function effectText(b: BuildingDefinition, tier: number): string {
  if (b.id === 'workshop') {
    const mult = tier > 0 ? b.tiers[tier - 1]?.craftTimeMult ?? 1 : 1;
    return tier === 0 ? 'field kit — normal craft speed' : `−${Math.round((1 - mult) * 100)}% craft time`;
  }
  const cap = tier > 0 ? b.tiers[tier - 1]?.capacityPerKind : undefined;
  return cap !== undefined ? `stores ${cap} of each item` : 'no storage';
}

function nextEffectText(b: BuildingDefinition, tierIdx: number): string {
  const t = b.tiers[tierIdx];
  if (!t) return '';
  if (t.craftTimeMult !== undefined) return `−${Math.round((1 - t.craftTimeMult) * 100)}% craft time`;
  if (t.capacityPerKind !== undefined) return `stores ${t.capacityPerKind} of each item`;
  return '';
}

function BuildingCard({ def }: { def: BuildingDefinition }) {
  const buildings = useStore((s) => s.buildings);
  const materials = useStore((s) => s.materials);
  const upgradeBuilding = useStore((s) => s.upgradeBuilding);

  const tier = buildings[def.id] ?? 0;
  const next = nextTier(def.id, buildings);
  const affordable = next !== undefined && canAffordTier(next, materials);

  return (
    <div className={`panel region-card ${tier === 0 ? 'region-locked' : ''}`}>
      <div className="region-head">
        <span className="region-name">{def.name}</span>
        {tier > 0 ? (
          <span className="chip">Tier {tier}</span>
        ) : (
          <span className="chip chip-warn">not built</span>
        )}
      </div>
      <div className="statline">{effectText(def, tier)}</div>
      <p className="muted">{def.desc}</p>
      <div className="region-actions">
        {next ? (
          <button
            className="btn btn-small btn-primary"
            disabled={!affordable}
            title={`${nextEffectText(def, tier)} — costs ${costText(next.cost)}`}
            onClick={() => upgradeBuilding(def.id)}
          >
            {tier === 0 ? 'Build' : `Upgrade to tier ${tier + 1}`} ({costText(next.cost)})
          </button>
        ) : (
          <span className="chip">Max tier</span>
        )}
      </div>
    </div>
  );
}

function BankStorage() {
  const materials = useStore((s) => s.materials);
  const inventory = useStore((s) => s.inventory);
  const buildings = useStore((s) => s.buildings);
  const cap = bankCapacity(buildings);

  const rows: { label: string; qty: number }[] = [
    ...(Object.keys(MATERIAL_LABELS) as (keyof Materials)[]).map((m) => ({
      label: MATERIAL_LABELS[m],
      qty: Math.floor(materials[m] ?? 0),
    })),
    ...RECIPES.map((r) => ({ label: r.name, qty: inventory[r.id] ?? 0 })),
  ];

  return (
    <div className="panel region-card">
      <div className="region-head">
        <span className="region-name">Bank storage</span>
        <span className="chip">{Number.isFinite(cap) ? `${cap} per item` : 'unlimited'}</span>
      </div>
      <dl className="kv">
        {rows.map((r) => (
          <Fragment key={r.label}>
            <dt>{r.label}</dt>
            <dd>
              {r.qty}/{Number.isFinite(cap) ? cap : '∞'}{' '}
              {r.qty >= cap && <span className="chip chip-warn">full</span>}
            </dd>
          </Fragment>
        ))}
      </dl>
    </div>
  );
}

export function BasePanel() {
  const buildings = useStore((s) => s.buildings);
  const mult = craftTimeMult(buildings);

  return (
    <section className="panel map-panel">
      <div className="fight-header">
        <h2>Home Base</h2>
        <span className="muted">
          {mult < 1 ? `workshop active — ${Math.round((1 - mult) * 100)}% faster crafting` : 'always within reach'}
        </span>
      </div>

      <QueueStrip />

      <div className="region-grid">
        {BUILDINGS.map((b) => (
          <BuildingCard key={b.id} def={b} />
        ))}
        <BankStorage />
      </div>

      <AlchemyPanel />
    </section>
  );
}
