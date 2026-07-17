import type { BossDefinition } from './boss';
import type { MobPackDefinition } from './mobPack';

/**
 * Dungeons (GDD §4): the first group content — several bosses + trash for a
 * 3–5-character party. Declarative: each encounter is an existing fight kind
 * (mob pack or boss), so running a dungeon needs no engine changes; run
 * order/progress is a consumer concern (the web tracks cleared encounters).
 */

export type DungeonEncounter =
  | { id: string; name: string; kind: 'trash'; pack: MobPackDefinition }
  | { id: string; name: string; kind: 'boss'; boss: BossDefinition };

export interface DungeonDefinition {
  id: string;
  name: string;
  /** Supported party sizes (v1: the 3-char trinity). */
  partySize: { min: number; max: number };
  /** Encounters in run order — trash gates the boss behind it. */
  encounters: DungeonEncounter[];
}

export function encounterById(
  dungeon: DungeonDefinition,
  id: string,
): DungeonEncounter | undefined {
  return dungeon.encounters.find((e) => e.id === id);
}
