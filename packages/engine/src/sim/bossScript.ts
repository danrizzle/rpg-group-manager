import { Actor } from '../model/actor';
import {
  addsMechanic,
  enrageMechanic,
  movementMechanics,
  timelineMechanics,
  type AddsMechanic,
} from '../model/boss';
import { rollFailToMove } from './mistakes';
import { BOSS_ID, type Fight } from './engine';

/**
 * Interprets a BossDefinition's `mechanics` list into scheduled behavior
 * (GDD §4). Each mechanic kind is handled independently, so a boss can carry
 * any number of timeline/movement/adds mechanics.
 *
 * Byte-identity: mechanics are processed grouped by kind in a FIXED order
 * (melee → timeline[] → movement[] → enrage → adds), iterating each kind in
 * list order, so the install-time `fork('boss')` jitter draws land in exactly
 * the order the pre-list boss drew them. Optional cast windows and debuffs
 * draw nothing and emit nothing when unset.
 *
 * Party generalization: melee follows threat (Fight.pickTarget), timeline
 * abilities hit every living member (the group heal check), and movement
 * windows roll fail-to-move per character.
 */
export function installBoss(fight: Fight): void {
  const def = fight.setup.boss!;
  const boss = fight.boss!; // installBoss only runs for boss encounters
  const rng = fight.rng.fork('boss');

  const jitter = (ms: number): number =>
    Math.max(1, Math.round(ms * (1 + rng.range(-def.timerJitterPct, def.timerJitterPct))));

  const enrage = enrageMechanic(def);
  const adds = addsMechanic(def);

  const bossDamageMult = (): number =>
    (fight.enraged && enrage ? enrage.damageMult : 1) *
    (fight.overdueAdds.size > 0 && adds ? adds.tantrumDamageMult : 1);

  // Melee swings (boss and adds share the loop shape); target = top threat.
  const meleeLoop = (attacker: Actor, damage: number, swingMs: number, mult: () => number) => {
    const swing = () => {
      if (fight.ended !== null || !attacker.alive) return;
      const amount = damage * mult() * (1 + rng.range(-0.15, 0.15));
      const target = fight.pickTarget(attacker.id);
      if (target) {
        fight.damageChar(target, amount, def.meleeDamageType, attacker.id, {
          abilityId: 'melee',
          damageType: def.meleeDamageType,
        });
      }
      fight.scheduler.in(swingMs, swing);
    };
    fight.scheduler.in(swingMs, swing);
  };
  meleeLoop(boss, def.meleeDamage, def.meleeSwingMs, bossDamageMult);

  // Type 2a — unavoidable timeline abilities hit the whole party (sustain
  // check). An optional cast window (castDurationMs) makes the cast real and
  // interruptible; absent = instant, no castStart (byte-identical).
  for (const m of timelineMechanics(def)) {
    const resolve = () => {
      if (fight.ended !== null || !boss.alive) return;
      fight.emit({ type: 'castEnd', source: BOSS_ID, meta: { abilityId: m.id } });
      fight.noteBossCast(m.id);
      for (const c of fight.livingChars()) {
        fight.damageChar(c, m.damage * bossDamageMult(), m.damageType, BOSS_ID, {
          abilityId: m.id,
          damageType: m.damageType,
        });
        if (fight.ended !== null) return;
      }
      if (m.applies) fight.applyBossDebuff(m.applies, m.id, rng);
      fight.scheduler.in(jitter(m.everyMs), fire);
    };
    const fire = () => {
      if (fight.ended !== null || !boss.alive) return;
      if (m.castDurationMs && m.castDurationMs > 0) {
        fight.emit({ type: 'castStart', source: BOSS_ID, meta: { abilityId: m.id, durationMs: m.castDurationMs } });
        fight.scheduler.in(m.castDurationMs, resolve);
      } else {
        resolve();
      }
    };
    fight.scheduler.at(jitter(m.firstAtMs), fire);
  }

  // Type 2b — movement windows: each character moves (DPS penalty) or gets
  // hit (mistake). One window, one roll per living member; a raid `maxSafeFails`
  // tolerance forgives that many failures (absent = 0 = every failure hit).
  for (const mv of movementMechanics(def)) {
    const window = () => {
      if (fight.ended !== null) return;
      fight.emit({ type: 'movementStart', source: BOSS_ID, meta: { durationMs: mv.durationMs } });
      const moved: typeof fight.chars = [];
      const failed: typeof fight.chars = [];
      for (const c of fight.livingChars()) {
        if (rollFailToMove(rng, c.def.behavior.discipline)) {
          failed.push(c);
        } else {
          c.moving = true;
          moved.push(c);
        }
      }
      for (const c of failed.slice(mv.maxSafeFails ?? 0)) {
        fight.emit({ type: 'mistake', source: c.actor.id, meta: { kind: 'stayed-in-fire' } });
        fight.scheduler.in(600, () => {
          if (!c.actor.alive) return;
          fight.damageChar(c, mv.failDamage * bossDamageMult(), mv.failDamageType, BOSS_ID, {
            abilityId: 'lava-surge',
            damageType: mv.failDamageType,
          });
        });
      }
      fight.scheduler.in(mv.durationMs, () => {
        for (const c of moved) c.moving = false;
        fight.emit({ type: 'movementEnd', source: BOSS_ID });
      });
      fight.scheduler.in(jitter(mv.everyMs), window);
    };
    fight.scheduler.at(jitter(mv.firstAtMs), window);
  }

  // Type 1 — hard enrage.
  if (enrage) {
    fight.scheduler.at(enrage.atMs, () => {
      if (fight.ended !== null) return;
      fight.enraged = true;
      fight.emit({ type: 'enrage', source: BOSS_ID, meta: { damageMult: enrage.damageMult } });
    });
  }

  // Type 3 — add waves once phase 2 begins (boss HP trigger), with tantrum.
  if (adds) fight.onPhase2 = spawnWaves(fight, adds, jitter, meleeLoop);
}

/** Build the wave spawner for an add phase (assigned to Fight.onPhase2). */
function spawnWaves(
  fight: Fight,
  adds: AddsMechanic,
  jitter: (ms: number) => number,
  meleeLoop: (attacker: Actor, damage: number, swingMs: number, mult: () => number) => void,
): () => void {
  let addCounter = 0;
  const spawnWave = () => {
    if (fight.ended !== null) return;
    for (let i = 0; i < adds.addsPerWave; i++) {
      const addDef = adds.add;
      const add = new Actor(`add-${++addCounter}`, addDef.name, 'enemies', {
        maxHp: addDef.hp,
        attackPower: 0,
        spellPower: 0,
        healingPower: 0,
        critChance: 0,
        hastePct: 0,
        armor: 0,
        resistances: {},
      });
      fight.adds.push(add);
      fight.emit({ type: 'addSpawn', source: add.id, meta: { name: addDef.name } });
      meleeLoop(add, addDef.meleeDamage, addDef.meleeSwingMs, () => 1);
      fight.scheduler.in(adds.tantrumAfterMs, () => {
        if (fight.ended !== null || !add.alive) return;
        const first = fight.overdueAdds.size === 0;
        fight.overdueAdds.add(add.id);
        if (first) {
          fight.emit({
            type: 'buffApplied',
            source: BOSS_ID,
            target: BOSS_ID,
            meta: { buffId: 'tantrum', damageMult: adds.tantrumDamageMult },
          });
        }
      });
    }
    fight.scheduler.in(jitter(adds.waveEveryMs), spawnWave);
  };
  return spawnWave;
}
