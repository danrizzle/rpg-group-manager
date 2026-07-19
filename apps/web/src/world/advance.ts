import { bankCapacity } from './base';
import {
  type AwayEvent,
  type CharWorld,
  type Task,
  type WorldCharId,
  type WorldSlice,
} from './types';

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
  // Bank cap (slice 6): read-only input from state — deposits clamp at it,
  // but nothing above it is ever confiscated (min(max(cur, cap), cur + gain)).
  const cap = bankCapacity(s.buildings);
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
      const before = materials[t.material] ?? 0;
      const after = Math.min(Math.max(before, cap), before + t.ratePerHour * (spent / MS_PER_HOUR));
      materials[t.material] = after;
      t.gained = (t.gained ?? 0) + (after - before);
    } else if (t.kind === 'craft') {
      // Crafting deposits WHOLE units only (herbs were paid at enqueue).
      // A full bank loses the overflow rather than stalling the task —
      // stalling would freeze everything queued behind it while offline.
      const done = Math.min(t.count, Math.floor(t.accruedGameMs / t.unitGameMs));
      if (done > t.producedUnits) {
        const due = done - t.producedUnits;
        const space = Math.max(0, cap - Math.floor(inventory[t.recipeId] ?? 0));
        const deposited = Math.min(due, space);
        if (deposited > 0) inventory[t.recipeId] = (inventory[t.recipeId] ?? 0) + deposited;
        t.lostUnits = (t.lostUnits ?? 0) + (due - deposited);
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
        const nominal = t.ratePerHour * (t.durationGameMs / MS_PER_HOUR);
        const gained = t.gained ?? nominal;
        events.push({
          kind: 'gather',
          zone: t.zone,
          material: t.material,
          materialGained: gained,
          ...(nominal - gained >= 0.5 ? { lostToCapacity: nominal - gained } : {}),
        });
      } else {
        events.push({
          kind: 'craft',
          recipeId: t.recipeId,
          craftedCount: t.count,
          ...((t.lostUnits ?? 0) > 0 ? { lostToCapacity: t.lostUnits } : {}),
        });
      }
      queue.shift();
    }
  }

  return { next: { xp, region, materials, inventory, buildings: s.buildings, queue }, events };
}

/** The shared pools every character's queue draws on / deposits into. */
export interface SharedSlice {
  xp: number;
  materials: WorldSlice['materials'];
  inventory: WorldSlice['inventory'];
  buildings: WorldSlice['buildings'];
}

/**
 * Fold the SAME `elapsedGameMs` through every character's queue — the parallel
 * world clock (GDD §2 "division of labor", §5 task queues).
 *
 * Each character owns their position + queue; the bank (materials, inventory)
 * is shared, so characters are folded in the caller's explicit `order` and the
 * shared pools are threaded from one to the next. That order is what keeps the
 * capacity clamp deterministic when two characters gather into a full bank in
 * the same step — without it, live ticks and offline catch-up could disagree.
 * Slice 8 made it a parameter (the store's `rosterOrder`) so a growing roster
 * folds in a stable, explicit sequence rather than a hardcoded trio.
 *
 * Still pure: the live tick (many tiny steps) and catch-up (one big step)
 * share this function, exactly as they shared `advanceWorld` before.
 *
 * v1 simplification: XP credits `xpCharId` (Elara) only. Recruits arrive at the
 * level cap (10 = MAX), so grind XP is meaningless for them — crediting the
 * shared pool for their kills would silently inflate her level instead.
 */
export function advanceAll(
  shared: SharedSlice,
  chars: Record<WorldCharId, CharWorld>,
  elapsedGameMs: number,
  order: readonly WorldCharId[],
  xpCharId: WorldCharId = 'mage',
): { shared: SharedSlice; chars: Record<WorldCharId, CharWorld>; events: AwayEvent[] } {
  let acc = { ...shared };
  const nextChars = { ...chars };
  const events: AwayEvent[] = [];

  for (const charId of order) {
    const cw = chars[charId];
    if (!cw || cw.queue.length === 0) continue;
    const xpBefore = acc.xp;
    const { next, events: evs } = advanceWorld(
      {
        xp: acc.xp,
        region: cw.region,
        materials: acc.materials,
        inventory: acc.inventory,
        buildings: acc.buildings,
        queue: cw.queue,
      },
      elapsedGameMs,
    );
    acc = {
      // Only Elara banks XP (see above); recruits are capped.
      xp: charId === xpCharId ? next.xp : xpBefore,
      materials: next.materials,
      inventory: next.inventory,
      buildings: acc.buildings,
    };
    nextChars[charId] = { region: next.region, queue: next.queue };
    for (const e of evs) events.push({ ...e, charId });
  }

  return { shared: acc, chars: nextChars, events };
}
