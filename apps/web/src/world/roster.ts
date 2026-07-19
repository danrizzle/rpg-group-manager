import type { ClassId, Unlocks } from './types';

/**
 * Roster slots and where recruits come from (GDD §2).
 *
 * Two rules shape this file:
 *
 * 1. **Slots are unlocked by progression milestones, NEVER bought.** There is
 *    deliberately no barracks and no purchase path — a building you can buy
 *    would turn roster depth into a resource sink, which §2 rules out.
 * 2. **The roster is larger than the raid.** Cinderforge takes 10; the ramp
 *    ends at 12, so the last two slots exist purely to make benching and
 *    rotation real. Picking who raids is a decision, not a formality — and
 *    per-character boss familiarity (§2) gives that decision teeth.
 *
 * Which CLASS fills a slot is the player's call, because the raid comp rule
 * (2 tanks / 3 healers / 5 dps) can't be satisfied by whatever the game hands
 * out. Earning a slot and filling it are separate steps for exactly that
 * reason.
 */

/** What the ramp reads: progression flags plus dungeon/raid clears. */
export interface RosterProgress {
  unlocks: Unlocks;
  dungeonCleared: Record<string, boolean>;
}

export interface RosterMilestone {
  id: string;
  /** Total slots owned once this milestone is met (cumulative, not additive). */
  slots: number;
  /** Shown in the roster panel as the next thing to chase. */
  label: string;
  met: (p: RosterProgress) => boolean;
}

/**
 * The ramp. Cumulative: slots = the highest `slots` among the met milestones,
 * so re-ordering or back-filling a milestone can never shrink a live roster.
 */
export const ROSTER_MILESTONES: RosterMilestone[] = [
  {
    // The founders. Elara starts alone; Borin and Seren are granted (not
    // recruited) when Cinder Maw falls, which is the phase-4 rule — so all
    // three slots are spoken for from the start and nothing is recruitable
    // until the Ember Forge starts giving slots away.
    id: 'founders',
    slots: 3,
    label: 'Elara, Borin and Seren',
    met: () => true,
  },
  {
    id: 'slagmaw',
    slots: 5,
    label: 'Defeat Slagmaw the Smelter (Ember Forge)',
    met: (p) => Boolean(p.dungeonCleared['slagmaw']),
  },
  {
    id: 'vulkan',
    slots: 7,
    label: 'Clear the Ember Forge (Forgemaster Vulkan)',
    met: (p) => Boolean(p.dungeonCleared['vulkan']),
  },
  {
    id: 'warcamp',
    slots: 10,
    label: 'Raise the Warcamp in the Cinder Wastes',
    // Slice 10 adds the flag; until then this milestone simply never fires.
    met: (p) => Boolean((p.unlocks as Unlocks & { raidAccess?: boolean }).raidAccess),
  },
  {
    id: 'cinderforge',
    slots: 12,
    label: 'Down your first Cinderforge boss',
    met: (p) => Boolean(p.dungeonCleared['ashkar'] || p.dungeonCleared['vael']),
  },
];

/** How many roster slots are currently owned. */
export function rosterSlots(p: RosterProgress): number {
  return ROSTER_MILESTONES.filter((m) => m.met(p)).reduce((n, m) => Math.max(n, m.slots), 0);
}

/** The next slot unlock to chase, for the roster panel's hint line. */
export function nextRosterMilestone(p: RosterProgress): RosterMilestone | undefined {
  const have = rosterSlots(p);
  return ROSTER_MILESTONES.find((m) => m.slots > have && !m.met(p));
}

/**
 * Recruit names per class, claimed in order. Long enough for a full 12-slot
 * roster of a single class — the player can skew the comp however they like,
 * so no pool may run dry.
 */
export const RECRUIT_NAMES: Record<ClassId, string[]> = {
  warrior: ['Borin', 'Kara', 'Dagen', 'Mirt', 'Hulda', 'Torv', 'Sella', 'Brann', 'Yrsa', 'Halvor', 'Ingrid', 'Osgar'],
  priest: ['Seren', 'Alwyn', 'Ivo', 'Perrin', 'Noa', 'Cyla', 'Emrys', 'Tamsin', 'Rowan', 'Linnea', 'Fenn', 'Marek'],
  mage: ['Elara', 'Vessa', 'Coran', 'Sable', 'Pell', 'Nim', 'Orin', 'Wren', 'Lyra', 'Tobin', 'Isolde', 'Garrick'],
};

/**
 * The next free id for a class, following the FROZEN convention: the founder
 * keeps the bare class id and later recruits are `<classId><n>` from 2 up.
 * Ids are never reused — a departed character's plans must not silently rebind
 * to their replacement.
 */
export function nextCharId(classId: ClassId, taken: readonly string[]): string {
  if (!taken.includes(classId)) return classId;
  for (let n = 2; ; n++) {
    const id = `${classId}${n}`;
    if (!taken.includes(id)) return id;
  }
}

/** First unused name for a class; falls back to a numbered one if the pool runs out. */
export function nextRecruitName(classId: ClassId, usedNames: readonly string[]): string {
  const pool = RECRUIT_NAMES[classId];
  return pool.find((n) => !usedNames.includes(n)) ?? `${RECRUIT_NAMES[classId][0]} ${usedNames.length + 1}`;
}
