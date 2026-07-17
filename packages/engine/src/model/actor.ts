import type { Ability, BuffEffect } from './ability';
import { mitigation, type CombatStats, type DamageType } from './stats';

export type Side = 'players' | 'enemies';

interface ActiveBuff {
  buffId: string;
  expiresAtMs: number;
  damageMult: number;
  critBonus: number;
  damageTakenMult: number;
  absorbRemaining: number;
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
    // Reapplying refreshes rather than stacks.
    this.buffs = this.buffs.filter((b) => b.buffId !== effect.buffId);
    this.buffs.push({
      buffId: effect.buffId,
      expiresAtMs: now + effect.durationMs,
      damageMult: effect.damageMult ?? 1,
      critBonus: effect.critBonus ?? 0,
      damageTakenMult: effect.damageTakenMult ?? 1,
      absorbRemaining: effect.absorb ?? 0,
    });
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
    return this.activeBuffs(now).reduce((m, b) => m * b.damageTakenMult, 1);
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

  private activeBuffs(now: number): ActiveBuff[] {
    return this.buffs.filter((b) => b.expiresAtMs > now);
  }
}
