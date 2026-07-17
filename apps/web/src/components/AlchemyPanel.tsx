import { useStore } from '../store';
import { MATERIAL_LABELS, RECIPES, type Recipe } from '../world/professions';
import type { Materials } from '../world/types';

/**
 * Alchemy v1 (GDD §6): craft consumables from gathered herbs via queued
 * craft tasks. Lives on the world map for now; the slice-6 home-base
 * workshop becomes its real home (and will gate/upgrade recipes).
 */

const herbCostText = (r: Recipe): string =>
  Object.entries(r.herbs)
    .map(([herb, n]) => `${n} ${MATERIAL_LABELS[herb as keyof Materials]}`)
    .join(' + ');

export function AlchemyPanel() {
  const materials = useStore((s) => s.materials);
  const inventory = useStore((s) => s.inventory);
  const enqueueCraft = useStore((s) => s.enqueueCraft);

  const canAfford = (r: Recipe, count: number): boolean =>
    Object.entries(r.herbs).every(
      ([herb, n]) => (materials[herb as keyof Materials] ?? 0) >= n * count,
    );

  return (
    <div className="panel">
      <h3>Alchemy</h3>
      <div className="statline">
        {(Object.keys(MATERIAL_LABELS) as (keyof Materials)[]).map((m) => (
          <span key={m} className="chip" title={`Gathered ${MATERIAL_LABELS[m]}`}>
            {Math.floor(materials[m] ?? 0)} {MATERIAL_LABELS[m]}
          </span>
        ))}
      </div>
      {RECIPES.map((r) => (
        <div className="control" key={r.id}>
          <div className="control-label">
            {r.name} — {inventory[r.id] ?? 0} in bag
          </div>
          <div className="segmented">
            {[1, 5].map((count) => (
              <button
                key={count}
                className="btn btn-small"
                disabled={!canAfford(r, count)}
                title={`${herbCostText(r)} each · ${(r.unitGameMs / 60_000) * count} game-min`}
                onClick={() => enqueueCraft(r.id, count)}
              >
                Craft ×{count}
              </button>
            ))}
            <span className="muted">{herbCostText(r)}</span>
          </div>
        </div>
      ))}
      <p className="muted">
        Crafting queues as a task (real time, works offline). Equip results in the consumable slots.
      </p>
    </div>
  );
}
