import { EventLog, type CombatEvent } from '../core/events';
import { Rng } from '../core/rng';
import { Scheduler } from '../core/scheduler';
import { GCD_MS, type Ability } from '../model/ability';
import { Actor } from '../model/actor';
import type { BossDefinition } from '../model/boss';
import type { MobDefinition, MobPackDefinition } from '../model/mobPack';
import type { EquippedConsumable } from '../model/consumable';
import { hasteMult, type BehaviorStats, type CombatStats } from '../model/stats';
import { validateStance, type StanceConfig } from '../model/stance';
import { chooseAction, shouldUseBurst } from './decision';
import {
  hesitationDelayMs,
  reactionTimeMs,
  rollDecisionMistake,
  rollSlowPotionMs,
} from './mistakes';
import { installBoss } from './bossScript';
import { installPack } from './packScript';

export interface CharacterDef {
  name: string;
  stats: CombatStats;
  behavior: BehaviorStats;
  /** Full kit including the potion (tag 'consumable', offGcd). */
  abilities: Ability[];
  /**
   * Equipped consumable slots (passives already folded into stats, actives
   * present in the kit with charges). Absent = legacy character built with
   * no consumables argument — streams stay byte-identical to pre-slice-5.
   */
  consumables?: EquippedConsumable[];
}

/**
 * A fight runs exactly one encounter: a boss (single enemy + mechanics,
 * ends when the boss dies) or a mob pack (2–3 enemies from t=0, ends when
 * all are dead). Provide exactly one of `boss` / `pack`.
 */
export interface FightSetup {
  player: CharacterDef;
  boss?: BossDefinition;
  pack?: MobPackDefinition;
  stance: StanceConfig;
  seed: number;
}

export type EndCondition = 'bossDead' | 'allEnemiesDead';

export type FightResultKind = 'kill' | 'playerDeath' | 'enrage' | 'timeout';

export interface FightResult {
  result: FightResultKind;
  durationMs: number;
  events: readonly CombatEvent[];
}

const MAX_FIGHT_MS = 600_000;
const DAMAGE_VARIANCE = 0.15;

export const PLAYER_ID = 'player';
export const BOSS_ID = 'boss';

/** Zeroed combat stats for a non-player combatant (boss, add or mob). */
export function enemyStats(hp: number): CombatStats {
  return {
    maxHp: hp,
    attackPower: 0,
    spellPower: 0,
    healingPower: 0,
    critChance: 0,
    hastePct: 0,
    armor: 0,
    resistances: {},
  };
}

/** One rolled run. Pure function of (setup, seed) — bit-identical everywhere. */
export function runFight(setup: FightSetup): FightResult {
  return new Fight(setup).run();
}

export class Fight {
  readonly scheduler = new Scheduler();
  readonly log = new EventLog();
  readonly rng: Rng;
  readonly player: Actor;
  /** The boss actor for boss encounters; null for pack encounters. */
  readonly boss: Actor | null;
  /** Enemies present from t=0 (the boss, or each mob of a pack). */
  readonly enemies: Actor[] = [];
  /** Enemies spawned mid-fight (boss phase-2 adds). */
  readonly adds: Actor[] = [];
  readonly setup: FightSetup;
  private readonly endCondition: EndCondition;
  /** actorId → mob definition, for pack encounters (XP attribution). */
  readonly mobDefs = new Map<string, MobDefinition>();

  ended: FightResultKind | null = null;
  enraged = false;
  /** Ids of adds that outlived the tantrum timer and still live. */
  readonly overdueAdds = new Set<string>();
  playerMoving = false;
  private potionPending = false;
  /** abilityId → remaining uses, for abilities with chargesPerFight. */
  private readonly chargesLeft = new Map<string, number>();

  constructor(setup: FightSetup) {
    validateStance(setup.stance);
    if (setup.boss && setup.pack) {
      throw new Error('fight needs exactly one of boss / pack, not both');
    }
    this.setup = setup;
    this.rng = new Rng(setup.seed);
    this.player = new Actor(PLAYER_ID, setup.player.name, 'players', setup.player.stats);

    if (setup.boss) {
      this.boss = new Actor(BOSS_ID, setup.boss.name, 'enemies', enemyStats(setup.boss.hp));
      this.enemies = [this.boss];
      this.endCondition = 'bossDead';
    } else if (setup.pack) {
      this.boss = null;
      this.endCondition = 'allEnemiesDead';
      for (const mob of setup.pack.mobs) {
        const actor = new Actor(mob.id, mob.name, 'enemies', enemyStats(mob.hp));
        this.enemies.push(actor);
        this.mobDefs.set(mob.id, mob);
      }
    } else {
      throw new Error('fight needs a boss or a pack');
    }
  }

  run(): FightResult {
    // Equipped passive consumables are stream-visible from t=0 (their stats
    // were folded at build time; no expiry — they last the whole fight).
    for (const c of this.setup.player.consumables ?? []) {
      if (c.kind !== 'passive') continue;
      this.emit({
        type: 'buffApplied',
        source: PLAYER_ID,
        target: PLAYER_ID,
        meta: { buffId: c.id, consumable: true },
      });
    }
    if (this.setup.boss) installBoss(this);
    else installPack(this);
    this.scheduler.at(0, () => this.decide());
    this.scheduler.at(MAX_FIGHT_MS, () => this.end('timeout'));
    this.scheduler.run(() => this.ended !== null);
    return {
      result: this.ended ?? 'timeout',
      durationMs: this.scheduler.now,
      events: this.log.events,
    };
  }

  emit(event: Omit<CombatEvent, 't'>): void {
    this.log.emit({ t: this.scheduler.now, ...event });
  }

  end(kind: FightResultKind): void {
    if (this.ended !== null) return;
    this.ended = kind;
    this.emit({ type: 'fightEnd', source: 'sim', meta: { result: kind } });
  }

  livingEnemies(): Actor[] {
    return [...this.enemies, ...this.adds].filter((a) => a.alive);
  }

  // ---- Player action cycle -------------------------------------------------

  private decide(): void {
    if (this.ended !== null || !this.player.alive) return;
    const now = this.scheduler.now;
    const { stance, player } = this.setup;
    const kit = player.abilities;

    // Off-GCD burst cooldowns fire outside the cycle.
    if (shouldUseBurst(stance)) {
      for (const a of kit) {
        if (a.offGcd && a.tags.includes('burst') && this.player.isReady(a, now)) {
          this.resolveAbility(a);
        }
      }
    }

    const ready = kit.filter(
      (a) => !a.offGcd && !a.tags.includes('consumable') && this.player.isReady(a, now),
    );
    let choice = chooseAction({
      ready,
      stance,
      stats: player.stats,
      behavior: player.behavior,
      hpPct: this.player.hpPct,
      livingEnemies: this.livingEnemies().length,
      moving: this.playerMoving,
    });
    if (choice === null) {
      this.scheduler.in(GCD_MS, () => this.decide());
      return;
    }

    const mistake = rollDecisionMistake(this.rng, player.behavior.discipline);
    if (mistake === 'hesitation') {
      const delay = hesitationDelayMs(this.rng);
      this.emit({
        type: 'mistake',
        source: PLAYER_ID,
        meta: { kind: 'hesitation', delayMs: delay },
      });
      this.scheduler.in(delay, () => this.decide());
      return;
    }
    if (mistake === 'wrong-ability' && ready.length > 1) {
      const wrong = this.rng.pick(ready.filter((a) => a !== choice));
      this.emit({
        type: 'mistake',
        source: PLAYER_ID,
        meta: { kind: 'wrong-ability', chose: wrong.id, insteadOf: choice.id },
      });
      choice = wrong;
    }

    this.castAbility(choice);
  }

  private castAbility(ability: Ability): void {
    const haste = hasteMult(this.setup.player.stats);
    const castMs = Math.round(ability.castTimeMs * haste);
    this.emit({ type: 'castStart', source: PLAYER_ID, meta: { abilityId: ability.id } });
    const finish = () => {
      if (this.ended !== null || !this.player.alive) return;
      this.resolveAbility(ability);
      this.decide();
    };
    // Instants still occupy the GCD; casts of >= GCD length resolve at cast end.
    this.scheduler.in(Math.max(castMs, Math.round(GCD_MS * haste)), finish);
  }

  /** Remaining uses for a charge-limited ability; Infinity when unlimited. */
  private charges(ability: Ability): number {
    if (ability.chargesPerFight === undefined) return Infinity;
    return this.chargesLeft.get(ability.id) ?? ability.chargesPerFight;
  }

  /** Apply an ability's effect now and start its cooldown. */
  resolveAbility(ability: Ability): void {
    const now = this.scheduler.now;
    if (ability.chargesPerFight !== undefined) {
      this.chargesLeft.set(ability.id, this.charges(ability) - 1);
    }
    this.player.startCooldown(ability, now);
    this.emit({ type: 'castEnd', source: PLAYER_ID, meta: { abilityId: ability.id } });
    const effect = ability.effect;

    if (effect.kind === 'damage') {
      const targets = effect.aoe ? this.livingEnemies() : this.livingEnemies().slice(0, 1);
      for (const target of targets) {
        let amount = effect.base + effect.coeff * this.setup.player.stats.spellPower;
        if (effect.aoe) amount *= this.setup.player.behavior.aoeEfficiency;
        if (this.playerMoving && ability.movementPenalty) {
          amount *= this.setup.player.behavior.damageWhileMoving;
        }
        amount *= this.player.damageMult(now);
        amount *= 1 + this.rng.range(-DAMAGE_VARIANCE, DAMAGE_VARIANCE);
        const crit = this.rng.chance(this.player.critChance(now));
        if (crit) amount *= 2;
        const { dealt, absorbed } = target.takeDamage(amount, effect.damageType, now);
        this.emit({
          type: 'damage',
          source: PLAYER_ID,
          target: target.id,
          value: dealt,
          meta: { abilityId: ability.id, damageType: effect.damageType, crit, ...(absorbed > 0 ? { absorbed } : {}) },
        });
        this.onEnemyDamaged(target);
        if (this.ended !== null) return;
      }
    } else if (effect.kind === 'heal') {
      const healed = this.player.heal(effect.base + effect.coeff * this.setup.player.stats.healingPower);
      this.emit({
        type: 'heal',
        source: PLAYER_ID,
        target: PLAYER_ID,
        value: healed,
        meta: { abilityId: ability.id },
      });
    } else {
      this.player.applyBuff(effect, now);
      this.emit({
        type: 'buffApplied',
        source: PLAYER_ID,
        target: PLAYER_ID,
        meta: { buffId: effect.buffId, abilityId: ability.id },
      });
      this.scheduler.in(effect.durationMs, () => {
        for (const buffId of this.player.expireBuffs(this.scheduler.now)) {
          this.emit({ type: 'buffExpired', source: PLAYER_ID, target: PLAYER_ID, meta: { buffId } });
        }
      });
    }
  }

  private onEnemyDamaged(target: Actor): void {
    if (target.alive) {
      if (target === this.boss) this.checkPhase();
      return;
    }
    // The boss dying ends a boss fight immediately, with no death event —
    // this keeps boss event streams byte-identical to before packs existed.
    if (target === this.boss) {
      this.end('kill');
      return;
    }
    // Any other enemy (a phase-2 add, or a pack mob) emits a death event.
    // Pack mobs carry their id + XP so grind rates are recoverable from the
    // stream alone; this fires before the clear so the last kill's XP counts.
    const mob = this.mobDefs.get(target.id);
    this.emit({
      type: 'death',
      source: target.id,
      ...(mob ? { meta: { mobId: mob.id, xpPerKill: mob.xpPerKill } } : {}),
    });
    if (this.overdueAdds.delete(target.id) && this.overdueAdds.size === 0) {
      this.emit({ type: 'buffExpired', source: BOSS_ID, target: BOSS_ID, meta: { buffId: 'tantrum' } });
    }
    if (this.endCondition === 'allEnemiesDead' && this.livingEnemies().length === 0) {
      this.end('kill');
    }
  }

  private phase = 1;
  onPhase2: (() => void) | null = null;

  private checkPhase(): void {
    if (!this.boss || !this.setup.boss) return;
    if (this.phase === 1 && this.boss.hpPct * 100 <= this.setup.boss.addPhase.atHpPct) {
      this.phase = 2;
      this.emit({ type: 'phaseChange', source: BOSS_ID, meta: { phase: 2 } });
      this.onPhase2?.();
    }
  }

  // ---- Incoming damage -----------------------------------------------------

  /** Boss script routes all player-directed damage through here. */
  damagePlayer(amount: number, type: Parameters<Actor['takeDamage']>[1], source: string, meta: Record<string, unknown>): void {
    if (this.ended !== null || !this.player.alive) return;
    const now = this.scheduler.now;
    const { dealt, absorbed } = this.player.takeDamage(amount, type, now);
    this.emit({
      type: 'damage',
      source,
      target: PLAYER_ID,
      value: dealt,
      meta: { ...meta, ...(absorbed > 0 ? { absorbed } : {}) },
    });
    if (!this.player.alive) {
      this.emit({ type: 'death', source: PLAYER_ID, meta: { killedBy: meta['abilityId'] ?? source } });
      this.end(this.enraged ? 'enrage' : 'playerDeath');
      return;
    }
    this.maybeSchedulePotion();
  }

  /**
   * Reactive potion use (GDD §3 slider): when HP crosses the threshold the
   * character notices after their reaction time — discipline made visible.
   */
  private maybeSchedulePotion(): void {
    const { stance, player } = this.setup;
    // v1: at most one distinct active consumable exists (healing-potion), so
    // `find` suffices; revisit when a second active kind joins the catalog.
    const potion = player.abilities.find((a) => a.tags.includes('consumable'));
    if (!potion || this.potionPending) return;
    if (this.player.hpPct * 100 >= stance.potionThresholdPct) return;
    if (this.charges(potion) <= 0) return;
    if (!this.player.isReady(potion, this.scheduler.now)) return;

    this.potionPending = true;
    const slow = rollSlowPotionMs(this.rng, player.behavior.discipline);
    if (slow > 0) {
      this.emit({ type: 'mistake', source: PLAYER_ID, meta: { kind: 'slow-potion', delayMs: slow } });
    }
    this.scheduler.in(reactionTimeMs(player.behavior.discipline) + slow, () => {
      this.potionPending = false;
      if (this.ended !== null || !this.player.alive) return;
      if (this.player.hpPct * 100 >= stance.potionThresholdPct) return;
      if (this.charges(potion) <= 0) return;
      if (!this.player.isReady(potion, this.scheduler.now)) return;
      this.resolveAbility(potion);
    });
  }
}
