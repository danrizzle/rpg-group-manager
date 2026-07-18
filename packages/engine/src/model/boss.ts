import type { DamageType } from './stats';

/**
 * Declarative boss definition covering mechanic types 1–3 (GDD §4):
 *   1. damage check / enrage        → enrageAtMs
 *   2. AoE + movement phases        → timeline + movementWindows
 *   3. adds & priority targets      → addPhase (incl. tantrum soft enrage)
 * Type 4 (tank/debuff mechanics) is raid content and deliberately absent.
 */

export interface TimedBossAbility {
  id: string;
  name: string;
  firstAtMs: number;
  everyMs: number;
  damage: number;
  damageType: DamageType;
}

export interface AddDefinition {
  name: string;
  hp: number;
  meleeDamage: number;
  meleeSwingMs: number;
}

export interface BossDefinition {
  id: string;
  name: string;
  hp: number;
  meleeDamage: number;
  meleeSwingMs: number;
  meleeDamageType: DamageType;

  /** Type 1 — hard enrage: boss damage multiplies massively at this time. */
  enrageAtMs: number;
  enrageDamageMult: number;

  /** Type 2 — unavoidable group damage on timers (heal/sustain check). */
  timeline: TimedBossAbility[];

  /** Type 2 — periodic windows where the group must move or take a hit. */
  movementWindows: {
    firstAtMs: number;
    everyMs: number;
    durationMs: number;
    /** Damage taken when a character fails to move. */
    failDamage: number;
    failDamageType: DamageType;
    /**
     * Raid tolerance: this many characters may fail to move without being
     * hit (the raid soaks it). Absent = 0 = every failure is punished
     * (byte-identical to pre-raid bosses). Only failures BEYOND the tolerance
     * take damage — the per-character fail rolls are unchanged.
     */
    maxSafeFails?: number;
  };

  /** Type 3 — add waves from a HP-triggered phase, with tantrum soft enrage. */
  addPhase: {
    /** Phase 2 begins when boss HP falls to this percent. */
    atHpPct: number;
    waveEveryMs: number;
    addsPerWave: number;
    add: AddDefinition;
    /** An add alive longer than this enrages the boss until that add dies. */
    tantrumAfterMs: number;
    tantrumDamageMult: number;
  };

  /**
   * ± fraction applied to timeline/wave periods (GDD §9: variance so plans
   * must be robust, not frame-perfect). 0 = fixed timers.
   */
  timerJitterPct: number;
}
