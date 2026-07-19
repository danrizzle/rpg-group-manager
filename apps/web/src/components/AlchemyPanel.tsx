import { useStore } from '../store';
import { bankCapacity, craftTimeMult } from '../world/base';
import { MATERIAL_LABELS, RECIPES, type Recipe } from '../world/professions';
import type { Materials } from '../world/types';

/**
 * Alchemy (GDD §6): craft consumables from gathered herbs via queued craft
 * tasks. Lives at the home base; the workshop building speeds crafting up
 * but never gates it (the unbuilt "field kit" crafts at normal pace).
 */

const costText = (r: Recipe): string =>
  Object.entries(r.cost)
    .map(([herb, n]) => `${n} ${MATERIAL_LABELS[herb as keyof Materials]}`)
    .join(' + ');

export function AlchemyPanel() {
  const materials = useStore((s) => s.materials);
  const inventory = useStore((s) => s.inventory);
  const buildings = useStore((s) => s.buildings);
  const enqueueCraft = useStore((s) => s.enqueueCraft);
  // Crafting runs anywhere, so it goes on the acting character's queue.
  const charId = useStore((s) => s.activeWorldChar);
  const raidAccess = useStore((s) => s.unlocks.raidAccess);
  const cap = bankCapacity(buildings);
  const mult = craftTimeMult(buildings);
  // Raid-tier recipes stay hidden until the raid is reachable — listing a
  // recipe whose only ingredient is unobtainable reads as a bug, not a goal.
  const recipes = RECIPES.filter((r) => !r.raidTier || raidAccess);

  const canAfford = (r: Recipe, count: number): boolean =>
    Object.entries(r.cost).every(
      ([herb, n]) => (materials[herb as keyof Materials] ?? 0) >= n * count,
    );
  const bankFull = (r: Recipe, count: number): boolean => (inventory[r.id] ?? 0) + count > cap;

  return (
    <div className="panel">
      <h3>Alchemy</h3>
      <div className="statline">
        {(Object.keys(MATERIAL_LABELS) as (keyof Materials)[])
          // Quest/raid materials only appear once you hold some, so the row
          // doesn't advertise things that don't exist yet.
          .filter((m) => (m !== 'forgeSeal' && m !== 'emberCatalyst') || (materials[m] ?? 0) > 0)
          .map((m) => (
          <span key={m} className="chip" title={`Gathered ${MATERIAL_LABELS[m]}`}>
            {Math.floor(materials[m] ?? 0)} {MATERIAL_LABELS[m]}
          </span>
        ))}
      </div>
      {recipes.map((r) => (
        <div className="control" key={r.id}>
          <div className="control-label">
            {r.name} — {inventory[r.id] ?? 0} in bag
          </div>
          <div className="segmented">
            {[1, 5].map((count) => (
              <button
                key={count}
                className="btn btn-small"
                disabled={!canAfford(r, count) || bankFull(r, count)}
                title={
                  bankFull(r, count)
                    ? 'bank full'
                    : `${costText(r)} each · ${Math.round((r.unitGameMs * mult) / 60_000) * count} game-min`
                }
                onClick={() => enqueueCraft(charId, r.id, count)}
              >
                Craft ×{count}
              </button>
            ))}
            <span className="muted">{costText(r)}</span>
          </div>
        </div>
      ))}
      <p className="muted">
        Crafting queues as a task (real time, works offline). Equip results in the consumable slots.
      </p>
    </div>
  );
}
