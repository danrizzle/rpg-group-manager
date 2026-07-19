import type { DispelType } from './ability';
import type { DamageType } from './stats';

/**
 * Declarative boss definition. Mechanics are a heterogeneous LIST (GDD §4) so
 * a boss can carry any number of each kind — the singleton-slot shape it
 * replaced could hold only one movement window / one add phase, which raid
 * bosses outgrow. `installBoss` (sim/bossScript.ts) interprets the list;
 * content never needs engine changes.
 *
 * Mechanic types (GDD §4):
 *   1. damage check / enrage        → `enrage`
 *   2. AoE + movement phases        → `timeline` (+ optional cast window) / `movement`
 *   3. adds & priority targets      → `adds` (incl. tantrum soft enrage)
 *   4. boss→player debuffs          → `timeline.applies` (tank-swap / dispel prep)
 */

export interface AddDefinition {
  name: string;
  hp: number;
  meleeDamage: number;
  meleeSwingMs: number;
}

/** Boss→character debuff a timeline cast can apply (GDD §4 type 4). */
export type BossDebuffTarget = 'current-tank' | 'random' | 'all';
export interface BossDebuff {
  buffId: string;
  durationMs: number;
  /** Amplifies incoming damage on the victim (> 1 = the tank-swap lever). */
  damageTakenMult?: number;
  damageMult?: number;
  critBonus?: number;
  absorb?: number;
  /** Stacks up to this many (per-stack damageTakenMult compounds) — tank swaps. */
  maxStacks?: number;
  /** Dispellable category, if a healer can cleanse it. */
  dispelType?: DispelType;
  /** Who it lands on: the boss's current target (tank), a random member, or all. */
  target: BossDebuffTarget;
}

/** Type 1 — hard enrage: boss damage multiplies massively at `atMs`. */
export interface EnrageMechanic {
  kind: 'enrage';
  atMs: number;
  damageMult: number;
}

/** Type 2a — unavoidable group damage on a timer (heal/sustain check). */
export interface TimelineMechanic {
  kind: 'timeline';
  id: string;
  name: string;
  firstAtMs: number;
  everyMs: number;
  damage: number;
  damageType: DamageType;
  /**
   * If set (> 0), the ability has a real cast: `castStart` fires, then
   * `castEnd` + its effect resolve this many ms later — the interruptible
   * window (interrupts land in a later slice). Absent = instant, no
   * `castStart` (byte-identical to the pre-list boss).
   */
  castDurationMs?: number;
  /** Optional debuff applied to characters when the cast resolves. */
  applies?: BossDebuff;
}

/** Type 2b — periodic window: move (DPS penalty) or take a hit. */
export interface MovementMechanic {
  kind: 'movement';
  firstAtMs: number;
  everyMs: number;
  durationMs: number;
  failDamage: number;
  failDamageType: DamageType;
  /**
   * Raid tolerance: this many characters may fail to move without being hit.
   * Absent = 0 = every failure punished (byte-identical to pre-raid bosses).
   */
  maxSafeFails?: number;
}

/** Type 3 — add waves from an HP-triggered phase, with a tantrum soft enrage. */
export interface AddsMechanic {
  kind: 'adds';
  /** Phase 2 begins when boss HP falls to this percent. */
  atHpPct: number;
  waveEveryMs: number;
  addsPerWave: number;
  add: AddDefinition;
  /** An add alive longer than this enrages the boss until that add dies. */
  tantrumAfterMs: number;
  tantrumDamageMult: number;
}

export type Mechanic = EnrageMechanic | TimelineMechanic | MovementMechanic | AddsMechanic;

export interface BossDefinition {
  id: string;
  name: string;
  hp: number;
  meleeDamage: number;
  meleeSwingMs: number;
  meleeDamageType: DamageType;

  /** Every mechanic this boss runs (any count of each kind). */
  mechanics: Mechanic[];

  /**
   * ± fraction applied to timeline/wave periods (GDD §9: variance so plans
   * must be robust, not frame-perfect). 0 = fixed timers.
   */
  timerJitterPct: number;
}

// ---- Accessors -------------------------------------------------------------
// The one place that walks the union: `installBoss`, the journal and the web
// journal/plan UI read mechanics through these instead of switching inline.

export const timelineMechanics = (def: BossDefinition): TimelineMechanic[] =>
  def.mechanics.filter((m): m is TimelineMechanic => m.kind === 'timeline');

export const movementMechanics = (def: BossDefinition): MovementMechanic[] =>
  def.mechanics.filter((m): m is MovementMechanic => m.kind === 'movement');

export const enrageMechanic = (def: BossDefinition): EnrageMechanic | undefined =>
  def.mechanics.find((m): m is EnrageMechanic => m.kind === 'enrage');

export const addsMechanic = (def: BossDefinition): AddsMechanic | undefined =>
  def.mechanics.find((m): m is AddsMechanic => m.kind === 'adds');

/** A copy of `def` with its enrage re-timed — tuning/measurement convenience. */
export const withEnrageAt = (def: BossDefinition, atMs: number): BossDefinition => ({
  ...def,
  mechanics: def.mechanics.map((m) => (m.kind === 'enrage' ? { ...m, atMs } : m)),
});
