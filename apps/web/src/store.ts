import {
  CONSUMABLES_BY_ID,
  CONSUMABLE_SLOTS,
  ITEMS_BY_ID,
  MAGE_TALENTS,
  PLAYER_ID,
  levelForXp,
  makeBanditWarlord,
  makeCinderMaw,
  makeEmberwing,
  makeMage,
  runFight,
  sanitizeTalentSelection,
  talentPointsForLevel,
  unlockedControls,
  fightReview,
  type BossDefinition,
  type CharacterDef,
  type FightResult,
  type FightReview,
  type GearSlot,
  type GrindRates,
  type Item,
  type StanceConfig,
} from '@rpg/engine';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  GrindRequest,
  GrindResponse,
  SimRequest,
  SimResponse,
  WorkerRequest,
  WorkerResponse,
} from './sim/worker';
import { advanceWorld } from './world/advance';
import { RECIPES_BY_ID, RESPEC_COST, resolveConsumables } from './world/professions';
import {
  BRIDGE_COST,
  DEFAULT_MULTIPLIER,
  GATHER_BLOCK_GAME_MS,
  GRIND_BLOCK_GAME_MS,
  MAX_CATCHUP_GAME_MS,
  REGIONS,
  TRAVEL_HOP_GAME_MS,
  rateKey,
} from './world/tasks';
import type {
  AwaySummary,
  BossId,
  CraftTask,
  GatherTask,
  GrindTask,
  Inventory,
  Materials,
  RegionId,
  Task,
  TravelTask,
  Unlocks,
  View,
  ZoneId,
} from './world/types';

/** Fixed base seed: the dummy sim is reproducible; only setup changes results. */
const SIM_BASE_SEED = 42;

/**
 * Named intent stances (GDD §3): the player sets intent via discrete named
 * states; internally each maps to the engine's numeric config.
 */
export const STANCES = [
  { id: 'reckless', label: 'Reckless', offense: 0.9, intent: 'reckless-stance', desc: 'All-in damage; defensives almost never. For outgeared content.' },
  { id: 'balanced', label: 'Balanced', offense: 0.55, intent: 'balanced-stance', desc: 'Trades some damage for sensible defensive use.' },
  { id: 'guarded', label: 'Guarded', offense: 0.2, intent: 'guarded-stance', desc: 'Survival first; uses defensives early and often.' },
] as const;

export const TARGET_STEPS = [
  { label: 'Focus', value: 0 },
  { label: 'Lean ST', value: 0.25 },
  { label: 'Balanced', value: 0.5 },
  { label: 'Lean AoE', value: 0.75 },
  { label: 'Cleave', value: 1 },
] as const;

export const POTION_STEPS = [0, 20, 35, 50, 65] as const;

/** The AFK floor: what a fresh character runs on with zero configuration. */
export const AUTO_PRESET: StanceConfig = {
  offense: 0.55,
  targeting: 0.5,
  potionThresholdPct: 35,
  burstCds: 'automatic',
};

/** Earned execution stats — dev-overridable in the prototype for tuning. */
export interface BehaviorOverrides {
  discipline: number;
  aoeEfficiency: number;
  damageWhileMoving: number;
}

export const DEFAULT_BEHAVIOR: BehaviorOverrides = {
  discipline: 50,
  aoeEfficiency: 1.0,
  damageWhileMoving: 0.6,
};

/** Equipped item id per slot ('' = empty). */
export type GearSelection = Record<GearSlot, string>;

export const DEFAULT_GEAR_SELECTION: GearSelection = {
  weapon: 'emberwood-staff',
  chest: 'runeweave-robe',
  ring: 'copper-band',
  trinket: 'lucky-charm',
};

export function resolveGear(sel: GearSelection): Item[] {
  return Object.values(sel)
    .map((id) => ITEMS_BY_ID[id])
    .filter((i): i is Item => Boolean(i));
}

/** A saved build: everything needed to re-apply it later (GDD §2 Loadouts). */
export interface Loadout {
  name: string;
  stance: StanceConfig;
  talents: string[];
  gear: GearSelection;
  /** Equipped consumable slot ids (may repeat, e.g. 2× healing-potion). */
  consumables: string[];
}

/** Repair a consumable slot list against current content and the slot cap. */
export function sanitizeConsumableSelection(ids: string[]): string[] {
  return ids.filter((id) => Boolean(CONSUMABLES_BY_ID[id])).slice(0, CONSUMABLE_SLOTS);
}

const TALENT_COSTS: Record<string, number> = Object.fromEntries(
  MAGE_TALENTS.nodes.map((n) => [n.id, n.cost]),
);

/** Points left to spend for a selection at the given level. */
export function talentPointsRemaining(talents: string[], level: number): number {
  const spent = talents.reduce((sum, id) => sum + (TALENT_COSTS[id] ?? 0), 0);
  return talentPointsForLevel(level) - spent;
}

/** Drop stance settings whose unlocking talent isn't in the selection. */
function stripLockedControls(stance: StanceConfig, talents: string[]): StanceConfig {
  if (stance.barrierPolicy && !unlockedControls(MAGE_TALENTS, talents).has('barrier-policy')) {
    const { barrierPolicy: _, ...rest } = stance;
    return rest;
  }
  return stance;
}

const BOSS_FACTORIES: Record<string, () => BossDefinition> = {
  'cinder-maw': makeCinderMaw,
  'bandit-warlord': makeBanditWarlord,
  emberwing: makeEmberwing,
};

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });

export interface SimState {
  running: boolean;
  result: (SimResponse & { request: SimRequest }) | null;
}

/** What one attempt leaves behind for later comparison (GDD §3 review #4). */
export interface AttemptSummary {
  result: FightResult['result'];
  durationMs: number;
  dps: number;
  at: number; // wall-clock ms
}

export interface AttemptRecord {
  last?: AttemptSummary;
  /** Fastest kill so far. */
  best?: AttemptSummary;
}

export interface FightState {
  result: FightResult;
  seed: number;
  player: CharacterDef;
  boss: BossDefinition;
  bossId: string;
  review: FightReview;
  /** The boss's attempt record BEFORE this pull — what "vs last/best" compares against. */
  compare: AttemptRecord;
}

interface Store {
  // --- character build ---
  stance: StanceConfig;
  behavior: BehaviorOverrides;
  gear: GearSelection;
  talents: string[];
  /** Equipped consumable slot ids ('' never stored; length ≤ CONSUMABLE_SLOTS). */
  equippedConsumables: string[];
  loadouts: Loadout[];
  setStance: (patch: Partial<StanceConfig>) => void;
  setBehavior: (patch: Partial<BehaviorOverrides>) => void;
  setGear: (slot: GearSlot, itemId: string) => void;
  setConsumableSlot: (slot: number, id: string) => void;
  applyAutoPreset: () => void;
  spendTalent: (id: string) => void;
  refundTalent: (id: string) => void;
  respecTalents: () => void;
  saveLoadout: (name: string) => void;
  applyLoadout: (name: string) => void;
  deleteLoadout: (name: string) => void;

  // --- training dummy (worker) ---
  sim: SimState;
  runSim: (iterations: number) => void;

  // --- single real fight ---
  fight: FightState | null;
  /** Per-boss last/best attempt summaries (persisted). */
  attempts: Record<string, AttemptRecord>;
  pull: (bossId?: string) => void;

  // --- replay playback clock ---
  playT: number;
  playing: boolean;
  speed: number;
  setPlayback: (patch: Partial<{ playT: number; playing: boolean; speed: number }>) => void;

  // --- world loop ---
  view: View;
  setView: (v: View) => void;
  xp: number;
  region: RegionId;
  unlocks: Unlocks;
  materials: Materials;
  inventory: Inventory;
  queue: Task[];
  lastSeenWall: number;
  multiplier: number;
  setMultiplier: (m: number) => void;
  awaySummary: AwaySummary | null;
  dismissAwaySummary: () => void;
  rateCache: Record<string, GrindResponse>;
  requestGrindRates: (zone: ZoneId) => void;
  enqueueTravel: (to: RegionId) => void;
  enqueueGrind: (zone: ZoneId) => void;
  enqueueGather: (zone: ZoneId) => void;
  enqueueCraft: (recipeId: string, count: number) => void;
  cancelTask: (id: string) => void;
  tickWorld: () => void;
  catchUp: () => void;
  recordBossKill: (boss: BossId) => void;
  buildBridge: () => void;
}

const DEFAULT_UNLOCKS: Unlocks = { banditKilled: false, bridgeBuilt: false, emberwingKilled: false };

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `t${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** The region the character will be in once all currently-queued travel resolves. */
function projectedRegion(queue: Task[], region: RegionId): RegionId {
  let r = region;
  for (const t of queue) if (t.kind === 'travel') r = t.to;
  return r;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      // Offline catch-up runs exactly once per load, before the live tick.
      let caughtUp = false;
      // Worker dispatch is keyed by id so 'sim' and 'grind' replies never cross.
      let nextId = 1;
      const pendingSim = new Map<number, SimRequest>();
      const pendingGrindKey = new Map<number, string>();
      const inFlightGrind = new Set<string>();

      worker.onmessage = (msg: MessageEvent<WorkerResponse>) => {
        const m = msg.data;
        if (m.kind === 'sim') {
          const request = pendingSim.get(m.id);
          if (!request) return;
          pendingSim.delete(m.id);
          set({ sim: { running: false, result: { ...m.res, request } } });
        } else {
          const key = pendingGrindKey.get(m.id);
          if (!key) return;
          pendingGrindKey.delete(m.id);
          inFlightGrind.delete(key);
          set((s) => ({ rateCache: { ...s.rateCache, [key]: m.res } }));
        }
      };

      const post = (envelope: WorkerRequest) => worker.postMessage(envelope);

      return {
        stance: { ...AUTO_PRESET },
        behavior: { ...DEFAULT_BEHAVIOR },
        gear: { ...DEFAULT_GEAR_SELECTION },
        talents: [],
        equippedConsumables: [],
        loadouts: [],
        setStance: (patch) => set((s) => ({ stance: { ...s.stance, ...patch } })),
        setBehavior: (patch) => set((s) => ({ behavior: { ...s.behavior, ...patch } })),
        setGear: (slot, itemId) => set((s) => ({ gear: { ...s.gear, [slot]: itemId } })),
        setConsumableSlot: (slot, id) =>
          set((s) => {
            if (slot < 0 || slot >= CONSUMABLE_SLOTS) return {};
            const slots = Array.from({ length: CONSUMABLE_SLOTS }, (_, i) => s.equippedConsumables[i] ?? '');
            slots[slot] = CONSUMABLES_BY_ID[id] ? id : '';
            return { equippedConsumables: slots.filter((x) => x !== '') };
          }),
        applyAutoPreset: () => set({ stance: { ...AUTO_PRESET } }),

        spendTalent: (id) =>
          set((s) => {
            const node = MAGE_TALENTS.nodes.find((n) => n.id === id);
            if (!node || s.talents.includes(id)) return {};
            if ((node.requires ?? []).some((req) => !s.talents.includes(req))) return {};
            if (node.cost > talentPointsRemaining(s.talents, levelForXp(s.xp))) return {};
            return { talents: [...s.talents, id] };
          }),
        refundTalent: (id) =>
          set((s) => {
            if (!s.talents.includes(id)) return {};
            const dependent = MAGE_TALENTS.nodes.some(
              (n) => s.talents.includes(n.id) && (n.requires ?? []).includes(id),
            );
            if (dependent) return {};
            const talents = s.talents.filter((t) => t !== id);
            return { talents, stance: stripLockedControls(s.stance, talents) };
          }),
        // Respec costs herbs (GDD §2 "small resource cost") — payable from the
        // start region, so it's never a hard lock.
        respecTalents: () =>
          set((s) => {
            if (s.talents.length === 0) return {};
            if ((s.materials[RESPEC_COST.material] ?? 0) < RESPEC_COST.count) return {};
            return {
              talents: [],
              stance: stripLockedControls(s.stance, []),
              materials: {
                ...s.materials,
                [RESPEC_COST.material]: s.materials[RESPEC_COST.material] - RESPEC_COST.count,
              },
            };
          }),

        saveLoadout: (name) =>
          set((s) => {
            const loadout: Loadout = {
              name,
              stance: { ...s.stance },
              talents: [...s.talents],
              gear: { ...s.gear },
              consumables: [...s.equippedConsumables],
            };
            const others = s.loadouts.filter((l) => l.name !== name);
            return { loadouts: [...others, loadout] };
          }),
        applyLoadout: (name) =>
          set((s) => {
            const saved = s.loadouts.find((l) => l.name === name);
            if (!saved) return {};
            // The stored loadout is never mutated; the applied copy is repaired
            // against current content and the current level's point budget.
            const talents = sanitizeTalentSelection(
              MAGE_TALENTS,
              saved.talents,
              talentPointsForLevel(levelForXp(s.xp)),
            );
            const gear = Object.fromEntries(
              Object.entries(saved.gear).map(([slot, id]) => [slot, ITEMS_BY_ID[id] ? id : '']),
            ) as GearSelection;
            return {
              talents,
              gear,
              stance: stripLockedControls({ ...saved.stance }, talents),
              equippedConsumables: sanitizeConsumableSelection(saved.consumables ?? []),
            };
          }),
        deleteLoadout: (name) =>
          set((s) => ({ loadouts: s.loadouts.filter((l) => l.name !== name) })),

        sim: { running: false, result: null },
        runSim: (iterations) => {
          const { stance, behavior, gear, sim, xp, talents, equippedConsumables } = get();
          if (sim.running) return;
          const id = nextId++;
          // The dummy simulates the equipped slots for free at nominal charges
          // (GDD §3) — results don't churn with stock levels.
          const request: SimRequest = {
            stance,
            behavior,
            gear,
            level: levelForXp(xp),
            talents,
            consumables: [...equippedConsumables],
            iterations,
            baseSeed: SIM_BASE_SEED,
          };
          pendingSim.set(id, request);
          set({ sim: { running: true, result: sim.result } });
          post({ kind: 'sim', id, req: request });
        },

        fight: null,
        attempts: {},
        pull: (bossId = 'cinder-maw') => {
          const { stance, behavior, gear, xp, talents, equippedConsumables, inventory, attempts } = get();
          const seed = Math.floor(Math.random() * 2 ** 31);
          // Slots the current stock can actually cover; short slots are
          // skipped for this fight (never blocks the pull).
          const defs = resolveConsumables(equippedConsumables, inventory);
          const player = makeMage(behavior, resolveGear(gear), levelForXp(xp), talents, defs);
          const boss = (BOSS_FACTORIES[bossId] ?? makeCinderMaw)();
          const result = runFight({ player, boss, stance, seed });
          const review = fightReview(result, { player, boss, stance });
          // Comparison targets are the attempts BEFORE this pull; then the
          // record advances (best = fastest kill).
          const compare: AttemptRecord = attempts[bossId] ?? {};
          const attempt: AttemptSummary = {
            result: result.result,
            durationMs: result.durationMs,
            dps: review.summary.dps,
            at: Date.now(),
          };
          const best =
            attempt.result === 'kill' &&
            (compare.best === undefined || attempt.durationMs < compare.best.durationMs)
              ? attempt
              : compare.best;
          const nextAttempts = {
            ...attempts,
            [bossId]: { last: attempt, ...(best !== undefined ? { best } : {}) },
          };
          // Real fights consume what they brought (GDD §3), win or lose:
          // passives 1 per distinct granted id; potion charges from the event
          // stream (the stream is the source of truth), capped by stock.
          const spent: Inventory = {};
          for (const def of defs) {
            if (def.kind === 'passive') spent[def.id] = 1;
          }
          for (const def of defs) {
            if (def.kind !== 'active' || spent[def.id] !== undefined) continue;
            const used = result.events.filter(
              (e) => e.type === 'heal' && e.source === PLAYER_ID && e.meta?.['abilityId'] === def.ability.id,
            ).length;
            spent[def.id] = Math.min(used, inventory[def.id] ?? 0);
          }
          const nextInventory = { ...inventory };
          for (const [id, n] of Object.entries(spent)) {
            if (n > 0) nextInventory[id] = Math.max(0, (nextInventory[id] ?? 0) - n);
          }
          set({
            fight: { result, seed, player, boss, bossId, review, compare },
            attempts: nextAttempts,
            inventory: nextInventory,
            playT: 0,
            playing: true,
            speed: 1,
            view: 'combat',
          });
        },

        playT: 0,
        playing: false,
        speed: 1,
        setPlayback: (patch) => set(patch),

        // ---- world loop ----
        view: 'map',
        setView: (v) => set({ view: v }),
        xp: 0,
        region: 'heartfield',
        unlocks: { ...DEFAULT_UNLOCKS },
        materials: { bridgeTimber: 0, sunleaf: 0, emberbloom: 0 },
        inventory: {},
        queue: [],
        lastSeenWall: Date.now(),
        multiplier: DEFAULT_MULTIPLIER,
        setMultiplier: (m) => set({ multiplier: m }),
        awaySummary: null,
        dismissAwaySummary: () => set({ awaySummary: null }),

        rateCache: {},
        requestGrindRates: (zone) => {
          const { gear, stance, behavior, xp, talents, rateCache } = get();
          const level = levelForXp(xp);
          const key = rateKey(zone, level, gear, stance, behavior, talents);
          if (rateCache[key] || inFlightGrind.has(key)) return;
          const id = nextId++;
          pendingGrindKey.set(id, key);
          inFlightGrind.add(key);
          const req: GrindRequest = { zone, stance, behavior, gear, level, talents, iterations: 300, baseSeed: SIM_BASE_SEED };
          post({ kind: 'grind', id, req });
        },

        enqueueTravel: (to) =>
          set((s) => {
            if (projectedRegion(s.queue, s.region) === to) return {};
            const task: TravelTask = { id: uid(), kind: 'travel', to, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 };
            return { queue: [...s.queue, task] };
          }),

        enqueueGrind: (zone) => {
          const { gear, stance, behavior, xp, talents, rateCache, queue, region } = get();
          const level = levelForXp(xp);
          const rate = rateCache[rateKey(zone, level, gear, stance, behavior, talents)];
          if (!rate) return; // card keeps the button disabled until the rate is known
          const next = [...queue];
          if (projectedRegion(next, region) !== zone) {
            next.push({ id: uid(), kind: 'travel', to: zone, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 });
          }
          const grind: GrindTask = {
            id: uid(),
            kind: 'grind',
            zone,
            durationGameMs: GRIND_BLOCK_GAME_MS,
            accruedGameMs: 0,
            xpPerHour: rate.xpPerHour,
            deathsPerHour: rate.deathsPerHour,
            levelAtEnqueue: level,
          };
          set({ queue: [...next, grind] });
        },

        enqueueGather: (zone) =>
          set((s) => {
            const meta = REGIONS.find((r) => r.id === zone)?.gather;
            if (!meta) return {};
            const next = [...s.queue];
            if (projectedRegion(next, s.region) !== zone) {
              next.push({ id: uid(), kind: 'travel', to: zone, durationGameMs: TRAVEL_HOP_GAME_MS, accruedGameMs: 0 });
            }
            const gather: GatherTask = {
              id: uid(),
              kind: 'gather',
              zone,
              material: meta.material,
              ratePerHour: meta.ratePerHour,
              durationGameMs: GATHER_BLOCK_GAME_MS,
              accruedGameMs: 0,
            };
            return { queue: [...next, gather] };
          }),

        // Crafting runs anywhere in v1 (no travel hop); the slice-6 workshop
        // will gate/upgrade it. Herbs for ALL units are paid at enqueue.
        enqueueCraft: (recipeId, count) =>
          set((s) => {
            const recipe = RECIPES_BY_ID[recipeId];
            if (!recipe || count < 1 || !Number.isInteger(count)) return {};
            const materials = { ...s.materials };
            for (const [herb, per] of Object.entries(recipe.herbs)) {
              const need = per * count;
              if ((materials[herb as keyof Materials] ?? 0) < need) return {};
              materials[herb as keyof Materials] -= need;
            }
            const craft: CraftTask = {
              id: uid(),
              kind: 'craft',
              recipeId,
              count,
              unitGameMs: recipe.unitGameMs,
              producedUnits: 0,
              durationGameMs: recipe.unitGameMs * count,
              accruedGameMs: 0,
            };
            return { materials, queue: [...s.queue, craft] };
          }),

        cancelTask: (id) =>
          set((s) => {
            const t = s.queue.find((task) => task.id === id);
            if (!t) return {};
            const queue = s.queue.filter((task) => task.id !== id);
            // Cancelling a craft refunds herbs for units not yet started;
            // the in-progress unit's herbs are lost, produced units stay.
            if (t.kind === 'craft') {
              const recipe = RECIPES_BY_ID[t.recipeId];
              const started = Math.ceil(t.accruedGameMs / t.unitGameMs);
              const refundUnits = Math.max(0, t.count - Math.max(started, t.producedUnits));
              if (recipe && refundUnits > 0) {
                const materials = { ...s.materials };
                for (const [herb, per] of Object.entries(recipe.herbs)) {
                  materials[herb as keyof Materials] =
                    (materials[herb as keyof Materials] ?? 0) + per * refundUnits;
                }
                return { queue, materials };
              }
            }
            return { queue };
          }),

        tickWorld: () =>
          set((s) => {
            const now = Date.now();
            const elapsedGameMs = Math.max(0, (now - s.lastSeenWall) * s.multiplier);
            if (elapsedGameMs <= 0) return { lastSeenWall: now };
            const { next } = advanceWorld(s, elapsedGameMs);
            return { ...next, lastSeenWall: now };
          }),

        // Reconcile the wall-time the app was closed, once per load, via the
        // same pure reducer — and surface a "while you were away" summary.
        // Called from App on mount BEFORE the live tick starts, so the summary
        // is never lost to a tick draining the queue first.
        catchUp: () => {
          if (caughtUp) return;
          caughtUp = true;
          const s = get();
          const now = Date.now();
          const elapsedGameMs = Math.min(
            MAX_CATCHUP_GAME_MS,
            Math.max(0, (now - s.lastSeenWall) * s.multiplier),
          );
          const { next, events } = advanceWorld(s, elapsedGameMs);
          set({ ...next, lastSeenWall: now, awaySummary: events.length ? { events, elapsedGameMs } : null });
        },

        recordBossKill: (boss) =>
          set((s) => ({
            unlocks: {
              ...s.unlocks,
              banditKilled: s.unlocks.banditKilled || boss === 'bandit-warlord',
              emberwingKilled: s.unlocks.emberwingKilled || boss === 'emberwing',
            },
          })),

        buildBridge: () =>
          set((s) => {
            if (s.unlocks.bridgeBuilt || s.materials.bridgeTimber < BRIDGE_COST.bridgeTimber) return {};
            return {
              unlocks: { ...s.unlocks, bridgeBuilt: true },
              materials: { ...s.materials, bridgeTimber: s.materials.bridgeTimber - BRIDGE_COST.bridgeTimber },
            };
          }),
      };
    },
    {
      name: 'rpg-world-v1',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        stance: s.stance,
        behavior: s.behavior,
        gear: s.gear,
        talents: s.talents,
        equippedConsumables: s.equippedConsumables,
        loadouts: s.loadouts,
        xp: s.xp,
        region: s.region,
        unlocks: s.unlocks,
        materials: s.materials,
        inventory: s.inventory,
        attempts: s.attempts,
        queue: s.queue,
        lastSeenWall: s.lastSeenWall,
        multiplier: s.multiplier,
      }),
      migrate: (persisted, version) => {
        const s = persisted as Partial<Store>;
        if (version < 2) {
          s.talents = [];
          s.loadouts = [];
        }
        if (version < 3) {
          // Slice 5: professions/consumables join. Backfill herb keys so the
          // reducer's `+=` never sees undefined; old task kinds carry forward.
          s.inventory = {};
          s.equippedConsumables = [];
          s.loadouts = (s.loadouts ?? []).map((l) => ({ ...l, consumables: [] }));
        }
        if (version < 4) {
          // Post-fight review follow-up: per-boss attempt history joins.
          s.attempts = {};
        }
        s.materials = { bridgeTimber: 0, sunleaf: 0, emberbloom: 0, ...(s.materials ?? {}) };
        // Repair against current content — talent ids may have changed.
        s.talents = sanitizeTalentSelection(
          MAGE_TALENTS,
          s.talents ?? [],
          talentPointsForLevel(levelForXp(s.xp ?? 0)),
        );
        s.equippedConsumables = sanitizeConsumableSelection(s.equippedConsumables ?? []);
        s.loadouts = (s.loadouts ?? []).map((l) => ({
          ...l,
          consumables: sanitizeConsumableSelection(l.consumables ?? []),
        }));
        return s;
      },
    },
  ),
);

/** Is the shown sim result out of date vs. the current setup? */
export function simIsStale(
  sim: SimState,
  stance: StanceConfig,
  behavior: BehaviorOverrides,
  gear: GearSelection,
  level: number,
  talents: string[],
  consumables: string[],
): boolean {
  if (!sim.result) return false;
  const r = sim.result.request;
  return (
    r.level !== level ||
    r.talents.join(',') !== talents.join(',') ||
    r.consumables.join(',') !== consumables.join(',') ||
    Object.entries(gear).some(([slot, id]) => r.gear[slot as GearSlot] !== id) ||
    r.behavior.discipline !== behavior.discipline ||
    r.behavior.aoeEfficiency !== behavior.aoeEfficiency ||
    r.behavior.damageWhileMoving !== behavior.damageWhileMoving ||
    r.stance.offense !== stance.offense ||
    r.stance.targeting !== stance.targeting ||
    r.stance.potionThresholdPct !== stance.potionThresholdPct ||
    r.stance.burstCds !== stance.burstCds ||
    (r.stance.barrierPolicy ?? 'reactive') !== (stance.barrierPolicy ?? 'reactive')
  );
}
