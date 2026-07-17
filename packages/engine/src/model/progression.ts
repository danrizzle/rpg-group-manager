import type { CombatStats } from './stats';

/**
 * Levels & the unlock arc (GDD §2). Levels scale the *naked base* stats and
 * gate which intents/abilities a character has learned — gear stays the
 * dominant power axis on top. The level-10 character is the engine baseline
 * (all Cinder Maw tuning is against it), so level 10 must reproduce today's
 * naked base exactly; lower levels scale down from there.
 *
 * All numbers here are placeholder balance (tunable): the XP curve and the
 * naked-base endpoints come straight from the GDD.
 */

export const LEVEL_CAP = 10;

/** Naked-base endpoints (GDD §2): L1 ≈ 30 SP / 1,200 HP, L10 = 60 SP / 2,100 HP. */
const L1_SPELL_POWER = 30;
const L10_SPELL_POWER = 60;
const L1_MAX_HP = 1200;
const L10_MAX_HP = 2100;

const clampLevel = (level: number): number =>
  Math.max(1, Math.min(LEVEL_CAP, Math.round(level)));

/** Linear interpolation of a per-level value between the L1 and L10 endpoints. */
const lerpByLevel = (level: number, at1: number, at10: number): number =>
  at1 + ((at10 - at1) * (clampLevel(level) - 1)) / (LEVEL_CAP - 1);

/**
 * Naked base stats for a given level. Only HP and spell power scale with
 * level (GDD §2); crit and armor are flat. Gear applies on top via applyGear.
 * At level 10 this equals the historical NAKED_BASE (60 SP / 2,100 HP), so
 * existing balance is untouched.
 */
export function nakedBaseForLevel(level: number): CombatStats {
  return {
    maxHp: Math.round(lerpByLevel(level, L1_MAX_HP, L10_MAX_HP)),
    attackPower: 0,
    spellPower: Math.round(lerpByLevel(level, L1_SPELL_POWER, L10_SPELL_POWER)),
    healingPower: 0,
    critChance: 0.1,
    hastePct: 0,
    armor: 60,
    resistances: {},
  };
}

/**
 * XP required to advance from `level` to `level + 1` (GDD §2 placeholder:
 * `100 · n^1.6`). Target pacing at an on-band zone is ~1–2 h/level early,
 * ~3–4 h near cap — verified against sim-derived XP/hour, not hand-set.
 */
export function xpToNext(level: number): number {
  if (level >= LEVEL_CAP) return Infinity;
  return Math.round(100 * clampLevel(level) ** 1.6);
}

/** Total XP to go from level 1 to `level`. */
export function totalXpToReach(level: number): number {
  let total = 0;
  for (let n = 1; n < clampLevel(level); n++) total += xpToNext(n);
  return total;
}

/** The level a character with `xp` total experience has reached (1..cap). */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < LEVEL_CAP && xp >= totalXpToReach(level + 1)) level++;
  return level;
}

/**
 * The unlock arc (GDD §2) as declarative data — the single source of truth
 * for what each level grants. Abilities gate the Mage's kit here in the
 * engine; intents (stances) are gated by the web layer (slice 3), which reads
 * this same table to hide locked controls. Never more than one or two new
 * systems per step (Law 1, §8).
 */
export interface LevelUnlock {
  level: number;
  /** Ability ids (see mage.ts) learned at this level. */
  abilities: string[];
  /** Named intent controls unlocked at this level — data for the web layer. */
  intents: string[];
}

export const UNLOCKS: LevelUnlock[] = [
  { level: 1, abilities: ['fireball'], intents: ['balanced-stance'] },
  { level: 2, abilities: ['healing-potion'], intents: ['potion-threshold'] },
  { level: 3, abilities: ['ice-barrier'], intents: ['guarded-stance'] },
  { level: 4, abilities: ['flamestrike'], intents: ['target-steps'] },
  { level: 5, abilities: ['fire-blast'], intents: ['reckless-stance'] },
  { level: 7, abilities: ['combustion'], intents: ['burst-cd-control'] },
];

/** Ability ids a character has learned by the given level (inclusive). */
export function abilitiesUpToLevel(level: number): string[] {
  const cap = clampLevel(level);
  return UNLOCKS.filter((u) => u.level <= cap).flatMap((u) => u.abilities);
}

/** Named intent controls a character has unlocked by the given level. */
export function intentsUpToLevel(level: number): string[] {
  const cap = clampLevel(level);
  return UNLOCKS.filter((u) => u.level <= cap).flatMap((u) => u.intents);
}
