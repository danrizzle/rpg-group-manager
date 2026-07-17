import type { AwayEvent, Task, WorldSlice } from './types';

/**
 * The world clock as a PURE reducer — the open-world analogue of
 * `Replay.seek(t)` (fight/replay.ts). Fold `elapsedGameMs` through the task
 * queue head: spend time on the head, accrue its effects linearly, complete
 * and pop when full, then carry any leftover time to the next task.
 *
 * Purity is the whole point: the live tick (many tiny steps) and offline
 * catch-up (one big step) share this function, so a session left open and one
 * reloaded after the same wall-time converge to identical state. No
 * `Math.random`, no `Date` — accrual depends only on (state, elapsedGameMs).
 * Deaths are the statistical `deathsPerHour × hours` count, for display only.
 */
const MS_PER_HOUR = 3_600_000;

export function advanceWorld(
  s: WorldSlice,
  elapsedGameMs: number,
): { next: WorldSlice; events: AwayEvent[] } {
  let remaining = Math.max(0, elapsedGameMs);
  let xp = s.xp;
  let region = s.region;
  const materials = { ...s.materials };
  const inventory = { ...s.inventory };
  const queue: Task[] = s.queue.map((t) => ({ ...t }));
  const events: AwayEvent[] = [];

  while (remaining > 0 && queue.length > 0) {
    const t = queue[0]!;
    const need = t.durationGameMs - t.accruedGameMs;
    const spent = Math.min(need, remaining);
    t.accruedGameMs += spent;
    remaining -= spent;

    // Partial effects accrue proportionally so the live UI ticks smoothly.
    // (`?? 0` guards material keys a pre-migration save never had.)
    if (t.kind === 'grind') {
      xp += t.xpPerHour * (spent / MS_PER_HOUR);
    } else if (t.kind === 'gather') {
      materials[t.material] = (materials[t.material] ?? 0) + t.ratePerHour * (spent / MS_PER_HOUR);
    } else if (t.kind === 'craft') {
      // Crafting deposits WHOLE units only (herbs were paid at enqueue).
      const done = Math.min(t.count, Math.floor(t.accruedGameMs / t.unitGameMs));
      if (done > t.producedUnits) {
        inventory[t.recipeId] = (inventory[t.recipeId] ?? 0) + (done - t.producedUnits);
        t.producedUnits = done;
      }
    }

    if (t.accruedGameMs >= t.durationGameMs - 1e-6) {
      // Task complete: apply completion-only effects and record a summary line.
      if (t.kind === 'travel') {
        region = t.to;
        events.push({ kind: 'travel', to: t.to });
      } else if (t.kind === 'grind') {
        const hours = t.durationGameMs / MS_PER_HOUR;
        events.push({
          kind: 'grind',
          zone: t.zone,
          xpGained: t.xpPerHour * hours,
          estimatedDeaths: t.deathsPerHour * hours,
        });
      } else if (t.kind === 'gather') {
        events.push({
          kind: 'gather',
          zone: t.zone,
          material: t.material,
          materialGained: t.ratePerHour * (t.durationGameMs / MS_PER_HOUR),
        });
      } else {
        events.push({ kind: 'craft', recipeId: t.recipeId, craftedCount: t.count });
      }
      queue.shift();
    }
  }

  return { next: { xp, region, materials, inventory, queue }, events };
}
