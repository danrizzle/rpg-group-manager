import type { Ability, BuffEffect, DispelType } from './ability';
import { mitigation, type CombatStats, type DamageType } from './stats';

export type Side = 'players' | 'enemies';

interface ActiveBuff {
  buffId: string;
  expiresAtMs: number;
  damageMult: number;
  critBonus: number;
  /** Per-stack incoming-damage multiplier (compounds by `stacks`). */
  damageTakenMult: number;
  absorbRemaining: number;
  /** Current stack count (1 unless the buff sets maxStacks > 1). */
  stacks: number;
  maxStacks: number;
  /** Dispellable category, if any (drives dispel effects). */
  dispelType?: DispelType;
}

export interface DamageResult {
  /** Damage that reached HP. */
  dealt: number;
  absorbed: number;
}

/** Runtime combat state of one character, boss or add. */
export class Actor {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly stats: CombatStats;
  hp: number;
  alive = true;
  private cooldownReadyAt = new Map<string, number>();
  private buffs: ActiveBuff[] = [];

  constructor(id: string, name: string, side: Side, stats: CombatStats) {
    this.id = id;
    this.name = name;
    this.side = side;
    this.stats = stats;
    this.hp = stats.maxHp;
  }

  get hpPct(): number {
    return this.hp / this.stats.maxHp;
  }

  isReady(ability: Ability, now: number): boolean {
    return (this.cooldownReadyAt.get(ability.id) ?? 0) <= now;
  }

  startCooldown(ability: Ability, now: number): void {
    if (ability.cooldownMs > 0) {
      this.cooldownReadyAt.set(ability.id, now + ability.cooldownMs);
    }
  }

  applyBuff(effect: BuffEffect, now: number): void {
    const maxStacks = effect.maxStacks ?? 1;
    const existing = maxStacks > 1 ? this.buffs.find((b) => b.buffId === effect.buffId) : undefined;
    if (existing) {
      // Stacking debuff: bump the stack count (capped) and refresh the timer.
      existing.stacks = Math.min(existing.maxStacks, existing.stacks + 1);
      existing.expiresAtMs = now + effect.durationMs;
      return;
    }
    // Default: reapplying refreshes rather than stacks (byte-identical).
    this.buffs = this.buffs.filter((b) => b.buffId !== effect.buffId);
    this.buffs.push({
      buffId: effect.buffId,
      expiresAtMs: now + effect.durationMs,
      damageMult: effect.damageMult ?? 1,
      critBonus: effect.critBonus ?? 0,
      damageTakenMult: effect.damageTakenMult ?? 1,
      absorbRemaining: effect.absorb ?? 0,
      stacks: 1,
      maxStacks,
      ...(effect.dispelType !== undefined ? { dispelType: effect.dispelType } : {}),
    });
  }

  /**
   * Remove buffs matching a dispel category; returns the removed ids (once
   * each). Used by dispel abilities — `buffRemoved` is emitted by the sim.
   */
  removeBuffsOfType(types: readonly DispelType[], now: number): string[] {
    const set = new Set(types);
    const removed = this.activeBuffs(now).filter((b) => b.dispelType !== undefined && set.has(b.dispelType));
    if (removed.length > 0) {
      const gone = new Set(removed);
      this.buffs = this.buffs.filter((b) => !gone.has(b));
    }
    return removed.map((b) => b.buffId);
  }

  /** True if any active buff is dispellable by one of these categories. */
  hasDispellable(types: readonly DispelType[], now: number): boolean {
    const set = new Set(types);
    return this.activeBuffs(now).some((b) => b.dispelType !== undefined && set.has(b.dispelType));
  }

  /** Drop expired buffs; returns the ids that expired. */
  expireBuffs(now: number): string[] {
    const expired = this.buffs.filter((b) => b.expiresAtMs <= now);
    if (expired.length > 0) {
      this.buffs = this.buffs.filter((b) => b.expiresAtMs > now);
    }
    return expired.map((b) => b.buffId);
  }

  damageMult(now: number): number {
    return this.activeBuffs(now).reduce((m, b) => m * b.damageMult, 1);
  }

  critChance(now: number): number {
    return Math.min(1, this.stats.critChance + this.activeBuffs(now).reduce((c, b) => c + b.critBonus, 0));
  }

  damageTakenMult(now: number): number {
    return this.activeBuffs(now).reduce((m, b) => m * Math.pow(b.damageTakenMult, b.stacks), 1);
  }

  /** Current stacks of a named buff (0 if absent). */
  buffStacks(buffId: string, now: number): number {
    return this.activeBuffs(now).find((b) => b.buffId === buffId)?.stacks ?? 0;
  }

  /** Highest stack count among active STACKING buffs (0 if none) — tank swaps. */
  maxStackCount(now: number): number {
    return this.activeBuffs(now).reduce((m, b) => Math.max(m, b.maxStacks > 1 ? b.stacks : 0), 0);
  }

  /** Apply typed damage after mitigation CDs, resist/armor and absorbs. */
  takeDamage(amount: number, type: DamageType, now: number): DamageResult {
    let remaining = Math.round(amount * this.damageTakenMult(now) * (1 - mitigation(this.stats, type)));
    let absorbed = 0;
    for (const buff of this.activeBuffs(now)) {
      if (remaining <= 0) break;
      if (buff.absorbRemaining > 0) {
        const soak = Math.min(buff.absorbRemaining, remaining);
        buff.absorbRemaining -= soak;
        remaining -= soak;
        absorbed += soak;
      }
    }
    this.hp = Math.max(0, this.hp - remaining);
    if (this.hp === 0) this.alive = false;
    return { dealt: remaining, absorbed };
  }

  heal(amount: number): number {
    const healed = Math.min(this.stats.maxHp - this.hp, Math.round(amount));
    this.hp += healed;
    return healed;
  }

  /** Battle res (GDD §3): bring a corpse back at a fraction of max HP. */
  resurrect(hpPct: number): void {
    if (this.alive) return;
    this.alive = true;
    this.hp = Math.max(1, Math.round(this.stats.maxHp * Math.min(1, Math.max(0, hpPct))));
    this.buffs = [];
  }

  private activeBuffs(now: number): ActiveBuff[] {
    return this.buffs.filter((b) => b.expiresAtMs > now);
  }
}
