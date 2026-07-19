/**
 * The event stream is the single source of truth for everything that
 * happened in a fight (GDD §3). All metrics, reviews and future replay
 * views are computed from it — never from sim internals. Plain JSON.
 */
export type ActorId = string;

export type EventType =
  | 'join'
  | 'planAction'
  | 'castStart'
  | 'castEnd'
  | 'damage'
  | 'heal'
  | 'buffApplied'
  | 'buffExpired'
  | 'buffRemoved'
  | 'targetChanged'
  | 'interrupted'
  | 'resurrect'
  | 'phaseChange'
  | 'addSpawn'
  | 'death'
  | 'mistake'
  | 'movementStart'
  | 'movementEnd'
  | 'enrage'
  | 'fightEnd';

export interface CombatEvent {
  /** Milliseconds since pull. */
  t: number;
  type: EventType;
  source: ActorId;
  target?: ActorId;
  value?: number;
  meta?: Record<string, unknown>;
}

export class EventLog {
  private list: CombatEvent[] = [];

  emit(event: CombatEvent): void {
    this.list.push(event);
  }

  get events(): readonly CombatEvent[] {
    return this.list;
  }
}
