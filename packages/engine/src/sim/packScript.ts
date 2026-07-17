import type { Fight } from './engine';

/**
 * Interprets a MobPackDefinition into scheduled behavior (GDD §5). Every mob
 * in the pack is present from t=0 and melees the player on its own swing
 * timer — simultaneous incoming damage is the survival pressure, and a single
 * AoE cast hits them all, which is what makes a better AoE stance genuinely
 * grind faster. The fight clears when the last mob dies (see Fight.onEnemyDamaged).
 */
export function installPack(fight: Fight): void {
  const def = fight.setup.pack!;
  const rng = fight.rng.fork('pack');

  const jitter = (ms: number): number =>
    Math.max(1, Math.round(ms * (1 + rng.range(-def.timerJitterPct, def.timerJitterPct))));

  for (const mob of fight.enemies) {
    const mdef = fight.mobDefs.get(mob.id)!;
    // Document the pull's roster in the stream (analogous to boss addSpawn).
    fight.emit({
      type: 'addSpawn',
      source: mob.id,
      meta: { name: mdef.name, mobId: mdef.id, xpPerKill: mdef.xpPerKill },
    });
    const swing = (): void => {
      if (fight.ended !== null || !mob.alive) return;
      const amount = mdef.meleeDamage * (1 + rng.range(-0.15, 0.15));
      const target = fight.pickTarget(mob.id);
      if (target) {
        fight.damageChar(target, amount, mdef.meleeDamageType, mob.id, {
          abilityId: 'melee',
          damageType: mdef.meleeDamageType,
        });
      }
      fight.scheduler.in(jitter(mdef.meleeSwingMs), swing);
    };
    fight.scheduler.in(jitter(mdef.meleeSwingMs), swing);
  }
}
