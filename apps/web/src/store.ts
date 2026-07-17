import {
  makeCinderMaw,
  makeMage,
  runFight,
  type BossDefinition,
  type CharacterDef,
  type FightResult,
  type StanceConfig,
} from '@rpg/engine';
import { create } from 'zustand';
import type { SimRequest, SimResponse } from './sim/worker';

/** Fixed base seed: the dummy sim is reproducible; only setup changes results. */
const SIM_BASE_SEED = 42;

/**
 * Named intent stances (GDD §3): the player sets intent via discrete named
 * states; internally each maps to the engine's numeric config.
 */
export const STANCES = [
  { id: 'reckless', label: 'Reckless', offense: 0.9, desc: 'All-in damage; defensives almost never. For outgeared content.' },
  { id: 'balanced', label: 'Balanced', offense: 0.55, desc: 'Trades some damage for sensible defensive use.' },
  { id: 'guarded', label: 'Guarded', offense: 0.2, desc: 'Survival first; uses defensives early and often.' },
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

const worker = new Worker(new URL('./sim/worker.ts', import.meta.url), { type: 'module' });

export interface SimState {
  running: boolean;
  result: (SimResponse & { request: SimRequest }) | null;
}

export interface FightState {
  result: FightResult;
  seed: number;
  player: CharacterDef;
  boss: BossDefinition;
}

interface Store {
  stance: StanceConfig;
  behavior: BehaviorOverrides;
  setStance: (patch: Partial<StanceConfig>) => void;
  setBehavior: (patch: Partial<BehaviorOverrides>) => void;
  applyAutoPreset: () => void;

  sim: SimState;
  runSim: (iterations: number) => void;

  fight: FightState | null;
  pull: () => void;

  playT: number;
  playing: boolean;
  speed: number;
  setPlayback: (patch: Partial<{ playT: number; playing: boolean; speed: number }>) => void;
}

export const useStore = create<Store>((set, get) => {
  let pendingRequest: SimRequest | null = null;
  worker.onmessage = (msg: MessageEvent<SimResponse>) => {
    if (!pendingRequest) return;
    set({ sim: { running: false, result: { ...msg.data, request: pendingRequest } } });
    pendingRequest = null;
  };

  return {
    stance: { ...AUTO_PRESET },
    behavior: { ...DEFAULT_BEHAVIOR },
    setStance: (patch) => set((s) => ({ stance: { ...s.stance, ...patch } })),
    setBehavior: (patch) => set((s) => ({ behavior: { ...s.behavior, ...patch } })),
    applyAutoPreset: () => set({ stance: { ...AUTO_PRESET } }),

    sim: { running: false, result: null },
    runSim: (iterations) => {
      const { stance, behavior, sim } = get();
      if (sim.running) return;
      pendingRequest = { stance, behavior, iterations, baseSeed: SIM_BASE_SEED };
      set({ sim: { running: true, result: sim.result } });
      worker.postMessage(pendingRequest);
    },

    fight: null,
    pull: () => {
      const { stance, behavior } = get();
      const seed = Math.floor(Math.random() * 2 ** 31);
      const player = makeMage(behavior);
      const boss = makeCinderMaw();
      const result = runFight({ player, boss, stance, seed });
      set({ fight: { result, seed, player, boss }, playT: 0, playing: true, speed: 1 });
    },

    playT: 0,
    playing: false,
    speed: 1,
    setPlayback: (patch) => set(patch),
  };
});

/** Is the shown sim result out of date vs. the current setup? */
export function simIsStale(sim: SimState, stance: StanceConfig, behavior: BehaviorOverrides): boolean {
  if (!sim.result) return false;
  const r = sim.result.request;
  return (
    r.behavior.discipline !== behavior.discipline ||
    r.behavior.aoeEfficiency !== behavior.aoeEfficiency ||
    r.behavior.damageWhileMoving !== behavior.damageWhileMoving ||
    r.stance.offense !== stance.offense ||
    r.stance.targeting !== stance.targeting ||
    r.stance.potionThresholdPct !== stance.potionThresholdPct ||
    r.stance.burstCds !== stance.burstCds
  );
}
