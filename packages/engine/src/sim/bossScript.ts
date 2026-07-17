import { Actor } from '../model/actor';
import { rollFailToMove } from './mistakes';
import { BOSS_ID, type Fight } from './engine';

/**
 * Interprets a BossDefinition into scheduled behavior. Mechanic types 1–3:
 * enrage timer, timeline AoE + movement windows, add waves with tantrum.
 * All periods can jitter (timerJitterPct) so plans must be robust.
 */
export function installBoss(fight: Fight): void {
  const def = fight.setup.boss;
  const rng = fight.rng.fork('boss');

  const jitter = (ms: number): number =>
    Math.max(1, Math.round(ms * (1 + rng.range(-def.timerJitterPct, def.timerJitterPct))));

  const bossDamageMult = (): number =>
    (fight.enraged ? def.enrageDamageMult : 1) *
    (fight.overdueAdds.size > 0 ? def.addPhase.tantrumDamageMult : 1);

  // Melee swings (boss and adds share the loop shape).
  const meleeLoop = (attacker: Actor, damage: number, swingMs: number, mult: () => number) => {
    const swing = () => {
      if (fight.ended !== null || !attacker.alive) return;
      const amount = damage * mult() * (1 + rng.range(-0.15, 0.15));
      fight.damagePlayer(amount, def.meleeDamageType, attacker.id, {
        abilityId: 'melee',
        damageType: def.meleeDamageType,
      });
      fight.scheduler.in(swingMs, swing);
    };
    fight.scheduler.in(swingMs, swing);
  };
  meleeLoop(fight.boss, def.meleeDamage, def.meleeSwingMs, bossDamageMult);

  // Type 2a — unavoidable timeline abilities (sustain check).
  for (const timed of def.timeline) {
    const fire = () => {
      if (fight.ended !== null || !fight.boss.alive) return;
      fight.emit({ type: 'castEnd', source: BOSS_ID, meta: { abilityId: timed.id } });
      fight.damagePlayer(timed.damage * bossDamageMult(), timed.damageType, BOSS_ID, {
        abilityId: timed.id,
        damageType: timed.damageType,
      });
      fight.scheduler.in(jitter(timed.everyMs), fire);
    };
    fight.scheduler.at(jitter(timed.firstAtMs), fire);
  }

  // Type 2b — movement windows: move (DPS penalty) or get hit (mistake).
  const mv = def.movementWindows;
  const window = () => {
    if (fight.ended !== null) return;
    fight.emit({ type: 'movementStart', source: BOSS_ID, meta: { durationMs: mv.durationMs } });
    const failed = rollFailToMove(rng, fight.setup.player.behavior.discipline);
    if (failed) {
      fight.emit({ type: 'mistake', source: fight.player.id, meta: { kind: 'stayed-in-fire' } });
      fight.scheduler.in(600, () => {
        fight.damagePlayer(mv.failDamage * bossDamageMult(), mv.failDamageType, BOSS_ID, {
          abilityId: 'lava-surge',
          damageType: mv.failDamageType,
        });
      });
    } else {
      fight.playerMoving = true;
    }
    fight.scheduler.in(mv.durationMs, () => {
      fight.playerMoving = false;
      fight.emit({ type: 'movementEnd', source: BOSS_ID });
    });
    fight.scheduler.in(jitter(mv.everyMs), window);
  };
  fight.scheduler.at(jitter(mv.firstAtMs), window);

  // Type 1 — hard enrage.
  fight.scheduler.at(def.enrageAtMs, () => {
    if (fight.ended !== null) return;
    fight.enraged = true;
    fight.emit({ type: 'enrage', source: BOSS_ID, meta: { damageMult: def.enrageDamageMult } });
  });

  // Type 3 — add waves once phase 2 begins (boss HP trigger), with tantrum.
  let addCounter = 0;
  const spawnWave = () => {
    if (fight.ended !== null) return;
    for (let i = 0; i < def.addPhase.addsPerWave; i++) {
      const addDef = def.addPhase.add;
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
      fight.scheduler.in(def.addPhase.tantrumAfterMs, () => {
        if (fight.ended !== null || !add.alive) return;
        const first = fight.overdueAdds.size === 0;
        fight.overdueAdds.add(add.id);
        if (first) {
          fight.emit({
            type: 'buffApplied',
            source: BOSS_ID,
            target: BOSS_ID,
            meta: { buffId: 'tantrum', damageMult: def.addPhase.tantrumDamageMult },
          });
        }
      });
    }
    fight.scheduler.in(jitter(def.addPhase.waveEveryMs), spawnWave);
  };
  fight.onPhase2 = spawnWave;
}
