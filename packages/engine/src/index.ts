// Public API of the combat sim engine (phase 1).
export { Rng } from './core/rng';
export { Scheduler } from './core/scheduler';
export type { ActorId, CombatEvent, EventType } from './core/events';
export type { BehaviorStats, CombatStats, DamageType } from './model/stats';
export { GCD_MS } from './model/ability';
export type { Ability, AbilityEffect, AbilityTag } from './model/ability';
export { DEFAULT_STANCE, validateStance } from './model/stance';
export type { StanceConfig } from './model/stance';
export type { AddDefinition, BossDefinition, TimedBossAbility } from './model/boss';
export type { MobDefinition, MobPackDefinition } from './model/mobPack';
export { packBandMax } from './model/mobPack';
export { runFight, PLAYER_ID, BOSS_ID, enemyStats } from './sim/engine';
export type { CharacterDef, EndCondition, FightResult, FightResultKind, FightSetup } from './sim/engine';
export { reactionTimeMs, mistakeChance } from './sim/mistakes';
export { applyGear } from './model/item';
export type { GearSlot, Item, ItemBonuses } from './model/item';
export {
  LEVEL_CAP,
  UNLOCKS,
  xpToNext,
  totalXpToReach,
  levelForXp,
  nakedBaseForLevel,
  abilitiesUpToLevel,
  intentsUpToLevel,
} from './model/progression';
export type { LevelUnlock } from './model/progression';
export {
  TALENT_POINT_POOL,
  talentPointsForLevel,
  validateTalentSelection,
  sanitizeTalentSelection,
  unlockedControls,
  applyTalents,
} from './model/talent';
export type { TalentEffect, TalentNode, TalentTree } from './model/talent';
export { GEAR_SETS, ITEMS, ITEMS_BY_ID, itemsForSlot } from './content/items';
export { makeMage } from './content/classes/mage';
export { MAGE_TALENTS, TALENT_BUILDS } from './content/classes/mageTalents';
export { makeCinderMaw } from './content/bosses/cinderMaw';
export { makeBanditWarlord } from './content/bosses/banditWarlord';
export { makeEmberwing } from './content/bosses/emberwing';
export {
  ZONES,
  makeHeartfieldPack,
  makeDuskwoodPack,
  makeAshenFoothillsPack,
  makeCinderWastesPack,
} from './content/mobs/zones';
export { summarizeRun, formatEvents } from './analysis/metrics';
export type { RunSummary } from './analysis/metrics';
export { runMonteCarlo } from './analysis/montecarlo';
export type { MonteCarloResult } from './analysis/montecarlo';
export { grindRates, riskTier, devalue, DEFAULT_PULL_CYCLE } from './analysis/grind';
export type { GrindRates, GrindSetup, PullCycle, RiskTier } from './analysis/grind';
export { distribution } from './analysis/distribution';
export type { Distribution } from './analysis/distribution';
