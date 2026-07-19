import { EventLog, type CombatEvent } from '../core/events';
import { Rng } from '../core/rng';
import { Scheduler } from '../core/scheduler';
import {
  GCD_MS,
  type Ability,
  type BuffEffect,
  type DispelEffect,
  type GroupHealTarget,
  type ResurrectEffect,
  type TauntEffect,
} from '../model/ability';
import { Actor } from '../model/actor';
import { addsMechanic, type BossDebuff, type BossDebuffTarget, type BossDefinition } from '../model/boss';
import type { MobDefinition, MobPackDefinition } from '../model/mobPack';
import type { EquippedConsumable } from '../model/consumable';
import type { BossPlan, TimedCall } from '../model/plan';
import { installPlan } from './planRunner';
import { hasteMult, type BehaviorStats, type CombatStats } from '../model/stats';
import { validateStance, type StanceConfig } from '../model/stance';
import { chooseAction, selectGroupIndices, shouldUseBurst, type AllyView } from './decision';
import {
  hesitationDelayMs,
  reactionTimeMs,
  rollDecisionMistake,
  rollSlowPotionMs,
} from './mistakes';
import { installBoss } from './bossScript';
import { installPack } from './packScript';

export type CharacterRole = 'tank' | 'healer' | 'dps';

export interface CharacterDef {
  /** Actor id in the event stream. Absent = the solo PLAYER_ID. */
  id?: string;
  name: string;
  /** Trinity role (party fights); informational — behavior comes from the kit. */
  role?: CharacterRole;
  /** Class id ('warrior' | 'priest' | 'mage' | …) — comp rules key on it. */
  classId?: string;
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

/** One party slot: who fights and under which intent (GDD §3 — per character). */
export interface PartyMember {
  character: CharacterDef;
  stance: StanceConfig;
}

/**
 * A fight runs exactly one encounter: a boss (single enemy + mechanics,
 * ends when the boss dies) or a mob pack (2–3 enemies from t=0, ends when
 * all are dead). Provide exactly one of `boss` / `pack`, and exactly one of
 * `player`+`stance` (solo — the pre-party path, byte-identical streams) /
 * `party` (each member carries their own stance).
 */
export interface FightSetup {
  player?: CharacterDef;
  stance?: StanceConfig;
  party?: PartyMember[];
  boss?: BossDefinition;
  pack?: MobPackDefinition;
  /** The boss plan (GDD §4) — absent = auto defaults only (Law 2). */
  plan?: BossPlan;
  /** Live calls (GDD §3): plan actions fired at recorded moments. */
  calls?: TimedCall[];
  seed: number;
}

/** A solo setup with the legacy fields guaranteed present (tests, grind sims). */
export type SoloFightSetup = FightSetup & { player: CharacterDef; stance: StanceConfig };

export type EndCondition = 'bossDead' | 'allEnemiesDead';

export type FightResultKind = 'kill' | 'playerDeath' | 'enrage' | 'timeout' | 'retreat';

export interface FightResult {
  result: FightResultKind;
  durationMs: number;
  events: readonly CombatEvent[];
}

const MAX_FIGHT_MS = 600_000;
const DAMAGE_VARIANCE = 0.15;
/** Threat generated per point of effective healing (applied to every enemy). */
const HEAL_THREAT_COEFF = 0.5;
/** Raids are 10-man (GDD amendment 2026-07-18) — a hard ceiling, not headroom. */
export const MAX_PARTY_SIZE = 10;
/**
 * The pre-raid ceiling (old MAX_PARTY_SIZE, and the dungeon party cap). The
 * raid-only heal-threat clamp engages only for parties LARGER than this, so
 * every solo / trinity / ≤5 stream is untouched by construction.
 */
const RAID_THREAT_CLAMP_MIN_SIZE = 5;

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

/**
 * Runtime state of one party character. Solo fights draw from the fight's
 * main RNG stream (byte-identity with the pre-party engine); party members
 * each get an independent fork so adding a character never perturbs the
 * others' rolls.
 */
export interface CharState {
  def: CharacterDef;
  /** Mutable — plan/call stance switches repoint it mid-fight. */
  stance: StanceConfig;
  actor: Actor;
  rng: Rng;
  moving: boolean;
  /** "Stop damage!": true after this character reacted to a hold order. */
  holding: boolean;
  potionPending: boolean;
  /** abilityId → remaining uses, for abilities with chargesPerFight. */
  chargesLeft: Map<string, number>;
}

/** One rolled run. Pure function of (setup, seed) — bit-identical everywhere. */
export function runFight(setup: FightSetup): FightResult {
  return new Fight(setup).run();
}

export class Fight {
  readonly scheduler = new Scheduler();
  readonly log = new EventLog();
  readonly rng: Rng;
  /** The party (a solo fight is a party of one legacy character). */
  readonly chars: CharState[] = [];
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

  /** enemyId → (charId → threat). Damage feeds one table; healing feeds all. */
  private readonly threat = new Map<string, Map<string, number>>();
  private lastHealer: CharState | null = null;
  /** enemyId → forced target (taunt): overrides threat until untilMs. */
  private readonly forcedTarget = new Map<string, { charId: string; untilMs: number }>();
  /** Boss casts currently mid-window (interruptible); bossScript pushes/pops. */
  readonly activeBossCasts: { abilityId: string; cancelled: boolean }[] = [];

  // Plan/call trigger hooks (sim/planRunner.ts). Empty when no plan — the
  // notify calls below are then no-ops, keeping plan-less streams identical.
  readonly bossCastHooks: ((abilityId: string) => void)[] = [];
  readonly phaseHooks: ((phase: number) => void)[] = [];
  private readonly hpTriggers: { pct: number; fn: () => void }[] = [];

  /** Register a fire-once trigger for boss HP dropping below `pct`. */
  addHpTrigger(pct: number, fn: () => void): void {
    this.hpTriggers.push({ pct, fn });
  }

  /** bossScript reports each timeline cast here (plan bossCast triggers). */
  noteBossCast(abilityId: string): void {
    for (const hook of this.bossCastHooks) hook(abilityId);
  }

  ended: FightResultKind | null = null;
  enraged = false;
  /** Ids of adds that outlived the tantrum timer and still live. */
  readonly overdueAdds = new Set<string>();

  constructor(setup: FightSetup) {
    if (setup.boss && setup.pack) {
      throw new Error('fight needs exactly one of boss / pack, not both');
    }
    if (setup.player && setup.party) {
      throw new Error('fight needs exactly one of player / party, not both');
    }
    this.setup = setup;
    this.rng = new Rng(setup.seed);

    if (setup.player) {
      if (!setup.stance) throw new Error('solo fight needs a stance');
      validateStance(setup.stance);
      this.chars.push({
        def: setup.player,
        stance: { ...setup.stance },
        actor: new Actor(PLAYER_ID, setup.player.name, 'players', setup.player.stats),
        // Legacy solo path: the main stream, exactly as before parties.
        rng: this.rng,
        moving: false,
        holding: false,
        potionPending: false,
        chargesLeft: new Map(),
      });
    } else if (setup.party) {
      if (setup.party.length < 1 || setup.party.length > MAX_PARTY_SIZE) {
        throw new Error(`party size must be 1..${MAX_PARTY_SIZE}`);
      }
      const seen = new Set<string>();
      for (const [i, member] of setup.party.entries()) {
        validateStance(member.stance);
        const id = member.character.id ?? `p${i + 1}`;
        if (seen.has(id)) throw new Error(`duplicate party member id: ${id}`);
        seen.add(id);
        this.chars.push({
          def: member.character,
          stance: { ...member.stance },
          actor: new Actor(id, member.character.name, 'players', member.character.stats),
          rng: this.rng.fork(`char:${id}`),
          moving: false,
          holding: false,
          potionPending: false,
          chargesLeft: new Map(),
        });
      }
    } else {
      throw new Error('fight needs a player or a party');
    }

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
    // Party fights document their roster in the stream (metrics, replays and
    // reviews reconstruct the player side from `join` events alone). The solo
    // path emits none — pre-party streams stay byte-identical.
    if (this.setup.party) {
      for (const c of this.chars) {
        this.emit({
          type: 'join',
          source: c.actor.id,
          meta: {
            name: c.def.name,
            maxHp: c.def.stats.maxHp,
            ...(c.def.role ? { role: c.def.role } : {}),
          },
        });
      }
    }
    // Equipped passive consumables are stream-visible from t=0 (their stats
    // were folded at build time; no expiry — they last the whole fight).
    for (const c of this.chars) {
      for (const eq of c.def.consumables ?? []) {
        if (eq.kind !== 'passive') continue;
        this.emit({
          type: 'buffApplied',
          source: c.actor.id,
          target: c.actor.id,
          meta: { buffId: eq.id, consumable: true },
        });
      }
    }
    if (this.setup.boss) installBoss(this);
    else installPack(this);
    if (this.setup.plan || this.setup.calls) installPlan(this);
    for (const c of this.chars) {
      this.scheduler.at(0, () => this.decide(c));
    }
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

  /** End the fight early by retreating (GDD §3) — the party lives, consumables
   *  spent so far are the only cost; the rest are saved by the caller. */
  retreat(): void {
    this.end('retreat');
  }

  livingEnemies(): Actor[] {
    return [...this.enemies, ...this.adds].filter((a) => a.alive);
  }

  livingChars(): CharState[] {
    return this.chars.filter((c) => c.actor.alive);
  }

  // ---- Threat ---------------------------------------------------------------

  private addThreat(enemyId: string, charId: string, amount: number): void {
    let table = this.threat.get(enemyId);
    if (!table) {
      table = new Map();
      this.threat.set(enemyId, table);
    }
    table.set(charId, (table.get(charId) ?? 0) + amount);
  }

  /**
   * Who an enemy attacks: its top living threat. A fresh table (a just-spawned
   * add) goes for the most recent healer — classic aggro drama the tank
   * answers with AoE threat — falling back to the first living member.
   */
  pickTarget(enemyId: string): CharState | null {
    // Taunt overrides threat entirely while its window is open.
    const forced = this.forcedTarget.get(enemyId);
    if (forced && forced.untilMs > this.scheduler.now) {
      const c = this.chars.find((x) => x.actor.id === forced.charId && x.actor.alive);
      if (c) return c;
    }
    const table = this.threat.get(enemyId);
    let best: CharState | null = null;
    let bestVal = 0;
    if (table) {
      // Raid regime only (party > 5): cap each non-tank's effective threat at
      // the top living tank's threat on this enemy, so healers can't out-threat
      // the tanks as their count grows. `cap === 0` (no living tank with
      // threat) leaves everyone uncapped — fresh-add aggro drama survives. The
      // gate never fires for any ≤5 party, so existing streams are unchanged.
      const cap =
        this.chars.length > RAID_THREAT_CLAMP_MIN_SIZE ? this.topTankThreat(table) : 0;
      for (const c of this.chars) {
        if (!c.actor.alive) continue;
        let v = table.get(c.actor.id) ?? 0;
        if (cap > 0 && c.def.role !== 'tank') v = Math.min(v, cap);
        if (v > bestVal) {
          best = c;
          bestVal = v;
        }
      }
    }
    if (best) return best;
    if (this.lastHealer?.actor.alive) return this.lastHealer;
    return this.livingChars()[0] ?? null;
  }

  /** Highest threat on this enemy held by any living tank (0 if none). */
  private topTankThreat(table: Map<string, number>): number {
    let top = 0;
    for (const c of this.chars) {
      if (c.def.role === 'tank' && c.actor.alive) {
        top = Math.max(top, table.get(c.actor.id) ?? 0);
      }
    }
    return top;
  }

  /**
   * A boss timeline cast applies a debuff to characters (GDD §4 type 4 — the
   * tank-swap / dispel lever). Mirrors the character buff branch but is
   * boss-sourced (`buffApplied`/`buffExpired` with source BOSS_ID). Only
   * invoked when a mechanic sets `applies`, so plain bosses draw/emit nothing.
   */
  applyBossDebuff(debuff: BossDebuff, sourceAbilityId: string, rng: Rng): void {
    const now = this.scheduler.now;
    const effect: BuffEffect = {
      kind: 'buff',
      buffId: debuff.buffId,
      durationMs: debuff.durationMs,
      ...(debuff.damageMult !== undefined ? { damageMult: debuff.damageMult } : {}),
      ...(debuff.critBonus !== undefined ? { critBonus: debuff.critBonus } : {}),
      ...(debuff.damageTakenMult !== undefined ? { damageTakenMult: debuff.damageTakenMult } : {}),
      ...(debuff.absorb !== undefined ? { absorb: debuff.absorb } : {}),
      ...(debuff.maxStacks !== undefined ? { maxStacks: debuff.maxStacks } : {}),
      ...(debuff.dispelType !== undefined ? { dispelType: debuff.dispelType } : {}),
    };
    for (const target of this.debuffTargets(debuff.target, rng)) {
      if (!target.actor.alive) continue;
      target.actor.applyBuff(effect, now);
      this.emit({
        type: 'buffApplied',
        source: BOSS_ID,
        target: target.actor.id,
        meta: { buffId: debuff.buffId, abilityId: sourceAbilityId },
      });
      this.scheduler.in(debuff.durationMs, () => {
        for (const buffId of target.actor.expireBuffs(this.scheduler.now)) {
          this.emit({
            type: 'buffExpired',
            source: target.actor.id,
            target: target.actor.id,
            meta: { buffId },
          });
        }
      });
    }
  }

  /** Resolve a boss-debuff target mode to the affected characters. */
  private debuffTargets(mode: BossDebuffTarget, rng: Rng): CharState[] {
    if (mode === 'all') return this.livingChars();
    if (mode === 'current-tank') {
      const t = this.pickTarget(BOSS_ID);
      return t ? [t] : [];
    }
    const living = this.livingChars();
    return living.length > 0 ? [rng.pick(living)] : [];
  }

  // ---- Character action cycle ----------------------------------------------

  private decide(char: CharState): void {
    if (this.ended !== null || !char.actor.alive) return;
    const now = this.scheduler.now;
    const { stance, def } = char;
    const kit = def.abilities;

    // Off-GCD burst cooldowns fire outside the cycle (not while holding).
    if (shouldUseBurst(stance) && !char.holding) {
      for (const a of kit) {
        if (a.offGcd && a.tags.includes('burst') && char.actor.isReady(a, now)) {
          this.resolveAbility(char, a);
        }
      }
    }

    // Situational raid abilities (taunt / dispel / interrupt) fire on an auto
    // policy (GDD §4 Law 2) — plans and calls fire them deliberately too. This
    // is a no-op for any kit without such an ability, so existing streams are
    // untouched.
    const situational = this.autoSituational(char, now);
    if (situational) {
      this.castAbility(char, situational);
      return;
    }

    // "Stop damage!" (GDD §3): a holding character keeps healing and
    // defending, but casts nothing that would push the boss.
    const ready = kit.filter(
      (a) =>
        !a.offGcd &&
        !a.tags.includes('consumable') &&
        (!char.holding || a.effect.kind !== 'damage') &&
        char.actor.isReady(a, now),
    );
    const allies: AllyView[] | undefined = this.setup.party
      ? this.livingChars().map((c) => ({
          id: c.actor.id,
          hpPct: c.actor.hpPct,
          ...(c.def.role ? { role: c.def.role } : {}),
        }))
      : undefined;
    let choice = chooseAction({
      ready,
      stance,
      stats: def.stats,
      behavior: def.behavior,
      hpPct: char.actor.hpPct,
      livingEnemies: this.livingEnemies().length,
      moving: char.moving,
      ...(allies ? { allies } : {}),
    });
    if (choice === null) {
      this.scheduler.in(GCD_MS, () => this.decide(char));
      return;
    }

    const mistake = rollDecisionMistake(char.rng, def.behavior.discipline);
    if (mistake === 'hesitation') {
      const delay = hesitationDelayMs(char.rng);
      this.emit({
        type: 'mistake',
        source: char.actor.id,
        meta: { kind: 'hesitation', delayMs: delay },
      });
      this.scheduler.in(delay, () => this.decide(char));
      return;
    }
    if (mistake === 'wrong-ability' && ready.length > 1) {
      const wrong = char.rng.pick(ready.filter((a) => a !== choice));
      this.emit({
        type: 'mistake',
        source: char.actor.id,
        meta: { kind: 'wrong-ability', chose: wrong.id, insteadOf: choice.id },
      });
      choice = wrong;
    }

    this.castAbility(char, choice);
  }

  private castAbility(char: CharState, ability: Ability): void {
    const haste = hasteMult(char.def.stats);
    const castMs = Math.round(ability.castTimeMs * haste);
    this.emit({ type: 'castStart', source: char.actor.id, meta: { abilityId: ability.id } });
    const finish = () => {
      if (this.ended !== null || !char.actor.alive) return;
      this.resolveAbility(char, ability);
      this.decide(char);
    };
    // Instants still occupy the GCD; casts of >= GCD length resolve at cast end.
    this.scheduler.in(Math.max(castMs, Math.round(GCD_MS * haste)), finish);
  }

  /** Remaining uses for a charge-limited ability; Infinity when unlimited. */
  private charges(char: CharState, ability: Ability): number {
    if (ability.chargesPerFight === undefined) return Infinity;
    return char.chargesLeft.get(ability.id) ?? ability.chargesPerFight;
  }

  /** Apply an ability's effect now and start its cooldown. */
  resolveAbility(char: CharState, ability: Ability): void {
    const now = this.scheduler.now;
    if (ability.chargesPerFight !== undefined) {
      char.chargesLeft.set(ability.id, this.charges(char, ability) - 1);
    }
    char.actor.startCooldown(ability, now);
    this.emit({ type: 'castEnd', source: char.actor.id, meta: { abilityId: ability.id } });
    const effect = ability.effect;

    if (effect.kind === 'damage') {
      const power =
        effect.powerStat === 'attackPower' ? char.def.stats.attackPower : char.def.stats.spellPower;
      const targets = effect.aoe ? this.livingEnemies() : this.livingEnemies().slice(0, 1);
      for (const target of targets) {
        let amount = effect.base + effect.coeff * power;
        if (effect.aoe) amount *= char.def.behavior.aoeEfficiency;
        if (char.moving && ability.movementPenalty) {
          amount *= char.def.behavior.damageWhileMoving;
        }
        amount *= char.actor.damageMult(now);
        amount *= 1 + char.rng.range(-DAMAGE_VARIANCE, DAMAGE_VARIANCE);
        const crit = char.rng.chance(char.actor.critChance(now));
        if (crit) amount *= 2;
        const { dealt, absorbed } = target.takeDamage(amount, effect.damageType, now);
        this.emit({
          type: 'damage',
          source: char.actor.id,
          target: target.id,
          value: dealt,
          meta: { abilityId: ability.id, damageType: effect.damageType, crit, ...(absorbed > 0 ? { absorbed } : {}) },
        });
        this.addThreat(target.id, char.actor.id, dealt * (ability.threatMult ?? 1));
        this.onEnemyDamaged(target);
        if (this.ended !== null) return;
      }
    } else if (effect.kind === 'heal') {
      const targets = this.healTargets(char, effect.target ?? 'self');
      let totalHealed = 0;
      for (const target of targets) {
        const healed = target.actor.heal(effect.base + effect.coeff * char.def.stats.healingPower);
        totalHealed += healed;
        this.emit({
          type: 'heal',
          source: char.actor.id,
          target: target.actor.id,
          value: healed,
          meta: { abilityId: ability.id },
        });
      }
      // Effective healing threatens every living enemy — healer aggro is real.
      if (totalHealed > 0) {
        for (const enemy of this.livingEnemies()) {
          this.addThreat(enemy.id, char.actor.id, totalHealed * HEAL_THREAT_COEFF);
        }
      }
      this.lastHealer = char;
    } else if (effect.kind === 'buff') {
      const targets =
        (effect.target ?? 'self') === 'party' ? this.livingChars() : [char];
      for (const target of targets) {
        target.actor.applyBuff(effect, now);
        this.emit({
          type: 'buffApplied',
          source: char.actor.id,
          target: target.actor.id,
          meta: { buffId: effect.buffId, abilityId: ability.id },
        });
        this.scheduler.in(effect.durationMs, () => {
          for (const buffId of target.actor.expireBuffs(this.scheduler.now)) {
            this.emit({
              type: 'buffExpired',
              source: target.actor.id,
              target: target.actor.id,
              meta: { buffId },
            });
          }
        });
      }
    } else if (effect.kind === 'taunt') {
      this.resolveTaunt(char, effect);
    } else if (effect.kind === 'dispel') {
      this.resolveDispel(char, effect);
    } else if (effect.kind === 'interrupt') {
      this.resolveInterrupt(char);
    } else if (effect.kind === 'resurrect') {
      this.resolveResurrect(char, effect);
    }
  }

  /** Battle res: revive the highest-priority dead ally and restart its loop. */
  private resolveResurrect(char: CharState, effect: ResurrectEffect): void {
    const dead = this.chars.filter((c) => !c.actor.alive);
    if (dead.length === 0) return;
    const pri = (r?: string) => (r === 'healer' ? 0 : r === 'tank' ? 1 : 2);
    const target = [...dead].sort((a, b) => pri(a.def.role) - pri(b.def.role))[0]!;
    target.actor.resurrect(effect.hpPct);
    target.potionPending = false;
    target.moving = false;
    this.emit({ type: 'resurrect', source: char.actor.id, target: target.actor.id, meta: { hpPct: effect.hpPct } });
    // The decide loop returns on death and never reschedules — restart it.
    this.scheduler.in(GCD_MS, () => this.decide(target));
  }

  /** Taunt: force every enemy onto the caster and leave them top-threat. */
  private resolveTaunt(char: CharState, effect: TauntEffect): void {
    const until = this.scheduler.now + effect.durationMs;
    for (const enemy of this.livingEnemies()) {
      this.forcedTarget.set(enemy.id, { charId: char.actor.id, untilMs: until });
      // Bump the taunter above the current top so aggro sticks after the window.
      const table = this.threat.get(enemy.id);
      let top = 0;
      if (table) for (const v of table.values()) top = Math.max(top, v);
      const have = table?.get(char.actor.id) ?? 0;
      if (top * 1.1 > have) this.addThreat(enemy.id, char.actor.id, top * 1.1 - have);
      this.emit({ type: 'targetChanged', source: enemy.id, target: char.actor.id, meta: { reason: 'taunt' } });
    }
  }

  /** Dispel: strip matching dispellable debuffs off the chosen ally. */
  private resolveDispel(char: CharState, effect: DispelEffect): void {
    const now = this.scheduler.now;
    const target =
      (effect.target ?? 'lowest-ally') === 'self'
        ? char
        : this.livingChars().find((c) => c.actor.hasDispellable(effect.dispelTypes, now));
    if (!target) return;
    for (const buffId of target.actor.removeBuffsOfType(effect.dispelTypes, now)) {
      this.emit({ type: 'buffRemoved', source: char.actor.id, target: target.actor.id, meta: { buffId } });
    }
  }

  /** Interrupt: cancel the most recent boss cast still in its window. */
  private resolveInterrupt(char: CharState): void {
    for (let i = this.activeBossCasts.length - 1; i >= 0; i--) {
      const cast = this.activeBossCasts[i]!;
      if (cast.cancelled) continue;
      cast.cancelled = true;
      this.emit({ type: 'interrupted', source: char.actor.id, target: BOSS_ID, meta: { abilityId: cast.abilityId } });
      return;
    }
  }

  /**
   * Auto policy for the situational raid abilities (Law 2): returns the one to
   * fire this GCD, or null. No-op for kits lacking them — hence no perturbation
   * of existing streams. Priority: interrupt an active cast, dispel an
   * afflicted ally, tank-swap off a heavily-stacked co-tank.
   */
  private autoSituational(char: CharState, now: number): Ability | null {
    const kit = char.def.abilities;
    const ready = (a: Ability) => char.actor.isReady(a, now) && this.charges(char, a) > 0;

    const rez = kit.find((a) => a.effect.kind === 'resurrect' && ready(a));
    if (rez && this.chars.some((c) => !c.actor.alive)) return rez;

    const interrupt = kit.find((a) => a.effect.kind === 'interrupt' && ready(a));
    if (interrupt && this.activeBossCasts.some((c) => !c.cancelled)) return interrupt;

    const dispel = kit.find((a) => a.effect.kind === 'dispel' && ready(a));
    if (dispel && dispel.effect.kind === 'dispel') {
      const types = dispel.effect.dispelTypes;
      if (this.livingChars().some((c) => c.actor.hasDispellable(types, now))) return dispel;
    }

    if (char.def.role === 'tank') {
      const taunt = kit.find((a) => a.effect.kind === 'taunt' && ready(a));
      if (taunt && this.boss) {
        const cur = this.pickTarget(BOSS_ID);
        if (
          cur &&
          cur !== char &&
          cur.def.role === 'tank' &&
          cur.actor.maxStackCount(now) >= 2 &&
          char.actor.maxStackCount(now) < cur.actor.maxStackCount(now)
        ) {
          return taunt;
        }
      }
    }
    return null;
  }

  private healTargets(
    char: CharState,
    mode: 'self' | 'lowest-ally' | 'party' | GroupHealTarget,
  ): CharState[] {
    if (mode === 'self') return [char];
    const living = this.livingChars();
    if (typeof mode === 'object') {
      // Bounded group heal: the maxTargets most-hurt living members, emitted in
      // party order. At ≤ maxTargets living this returns every member in party
      // order — byte-identical to the old whole-party 'party' heal.
      const idx = selectGroupIndices(
        living.map((c) => ({ hpPct: c.actor.hpPct, role: c.def.role })),
        mode.maxTargets,
      );
      return idx.map((i) => living[i]!);
    }
    if (mode === 'party') return living;
    let lowest = char;
    for (const c of living) {
      if (c.actor.hpPct < lowest.actor.hpPct) lowest = c;
    }
    return [lowest];
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
    const atHpPct = addsMechanic(this.setup.boss)?.atHpPct ?? 0;
    if (this.phase === 1 && this.boss.hpPct * 100 <= atHpPct) {
      this.phase = 2;
      this.emit({ type: 'phaseChange', source: BOSS_ID, meta: { phase: 2 } });
      this.onPhase2?.();
      for (const hook of this.phaseHooks) hook(2);
    }
    // Fire-once boss-HP plan triggers (highest thresholds first is not
    // needed — all crossed thresholds fire this event, in insertion order).
    const hpPct = this.boss.hpPct * 100;
    for (let i = this.hpTriggers.length - 1; i >= 0; i--) {
      if (hpPct < this.hpTriggers[i]!.pct) {
        const [t] = this.hpTriggers.splice(i, 1);
        t!.fn();
      }
    }
  }

  // ---- Incoming damage -----------------------------------------------------

  /** Boss/pack scripts route all character-directed damage through here. */
  damageChar(
    char: CharState,
    amount: number,
    type: Parameters<Actor['takeDamage']>[1],
    source: string,
    meta: Record<string, unknown>,
  ): void {
    if (this.ended !== null || !char.actor.alive) return;
    const now = this.scheduler.now;
    const { dealt, absorbed } = char.actor.takeDamage(amount, type, now);
    this.emit({
      type: 'damage',
      source,
      target: char.actor.id,
      value: dealt,
      meta: { ...meta, ...(absorbed > 0 ? { absorbed } : {}) },
    });
    if (!char.actor.alive) {
      this.emit({
        type: 'death',
        source: char.actor.id,
        // Party wipe stories need the attacker, not just the ability
        // ('melee' from the boss vs a sentry differ). Party-only meta —
        // solo streams stay byte-identical.
        meta: {
          killedBy: meta['abilityId'] ?? source,
          ...(this.setup.party ? { killedBySource: source } : {}),
        },
      });
      // The fight is lost only when the whole party is down (a solo fight is
      // a party of one, so the pre-party semantics are unchanged).
      if (this.livingChars().length === 0) {
        this.end(this.enraged ? 'enrage' : 'playerDeath');
      }
      return;
    }
    this.maybeSchedulePotion(char);
  }

  /**
   * Reactive potion use (GDD §3 slider): when HP crosses the threshold the
   * character notices after their reaction time — discipline made visible.
   */
  private maybeSchedulePotion(char: CharState): void {
    const { stance, def } = char;
    // v1: at most one distinct active consumable exists (healing-potion), so
    // `find` suffices; revisit when a second active kind joins the catalog.
    const potion = def.abilities.find((a) => a.tags.includes('consumable'));
    if (!potion || char.potionPending) return;
    if (char.actor.hpPct * 100 >= stance.potionThresholdPct) return;
    if (this.charges(char, potion) <= 0) return;
    if (!char.actor.isReady(potion, this.scheduler.now)) return;

    char.potionPending = true;
    const slow = rollSlowPotionMs(char.rng, def.behavior.discipline);
    if (slow > 0) {
      this.emit({ type: 'mistake', source: char.actor.id, meta: { kind: 'slow-potion', delayMs: slow } });
    }
    this.scheduler.in(reactionTimeMs(def.behavior.discipline) + slow, () => {
      char.potionPending = false;
      if (this.ended !== null || !char.actor.alive) return;
      if (char.actor.hpPct * 100 >= stance.potionThresholdPct) return;
      if (this.charges(char, potion) <= 0) return;
      if (!char.actor.isReady(potion, this.scheduler.now)) return;
      this.resolveAbility(char, potion);
    });
  }
}
