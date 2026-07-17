import type { MobDefinition, MobPackDefinition } from '../../model/mobPack';

/**
 * The v1 world's four regions as declarative grinding content (GDD §5). Each
 * zone exposes one representative mob pack; XP/hour, deaths/hour and the risk
 * tier are sim-derived from it (analysis/grind.ts), never hand-set. Numbers
 * are placeholder balance — xpPerKill rises with the band so raw XP/hour
 * climbs across the arc, while the sim decides survival and speed.
 *
 * Level bands and flavor come straight from the §5 region table.
 */

/** Build `count` copies of a mob template with distinct actor ids. */
function pack(
  id: string,
  name: string,
  count: number,
  template: Omit<MobDefinition, 'id'>,
  timerJitterPct = 0.1,
): MobPackDefinition {
  const mobs: MobDefinition[] = Array.from({ length: count }, (_, i) => ({
    id: `${id}-mob-${i}`,
    ...template,
  }));
  return { id, name, mobs, timerJitterPct };
}

/** Heartfield (1–3): tutorial boars & bandits — soft, forgiving. */
export function makeHeartfieldPack(): MobPackDefinition {
  return pack('heartfield', 'Heartfield Pack', 3, {
    name: 'Wild Boar',
    hp: 900,
    meleeDamage: 22,
    meleeSwingMs: 2000,
    meleeDamageType: 'physical',
    levelBand: { min: 1, max: 3 },
    xpPerKill: 6,
  });
}

/** Duskwood Edge (3–6): wolves & spiders — the mining/bridge-material zone. */
export function makeDuskwoodPack(): MobPackDefinition {
  return pack('duskwood', 'Duskwood Pack', 3, {
    name: 'Timber Wolf',
    hp: 1600,
    meleeDamage: 34,
    meleeSwingMs: 1900,
    meleeDamageType: 'physical',
    levelBand: { min: 3, max: 6 },
    xpPerKill: 14,
  });
}

/** Ashen Foothills (6–9): fire-flavored mobs — fire resistance starts mattering. */
export function makeAshenFoothillsPack(): MobPackDefinition {
  return pack('ashen-foothills', 'Ashen Foothills Pack', 3, {
    name: 'Ember Stalker',
    hp: 2600,
    meleeDamage: 46,
    meleeSwingMs: 1800,
    meleeDamageType: 'fire',
    levelBand: { min: 6, max: 9 },
    xpPerKill: 30,
  });
}

/**
 * Cinder Wastes (9–10): band-9–10 mobs that shred the underlevelled — the
 * lethality gate to the capstone. Two heavy hitters rather than a big swarm:
 * a capped, geared character farms it with real risk, an underlevelled one
 * simply dies (the sim is the gate; no special "too low" rule needed).
 */
export function makeCinderWastesPack(): MobPackDefinition {
  return pack('cinder-wastes', 'Cinder Wastes Pack', 3, {
    name: 'Molten Horror',
    hp: 3000,
    meleeDamage: 52,
    meleeSwingMs: 1800,
    meleeDamageType: 'fire',
    levelBand: { min: 9, max: 10 },
    xpPerKill: 60,
  });
}

/** Zone registry keyed by pack id — the CLI's `--zone` and the world map read this. */
export const ZONES: Record<string, () => MobPackDefinition> = {
  heartfield: makeHeartfieldPack,
  duskwood: makeDuskwoodPack,
  'ashen-foothills': makeAshenFoothillsPack,
  'cinder-wastes': makeCinderWastesPack,
};
