import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Scheduler } from '../src/core/scheduler';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('produces different streams for different seeds', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next());
    expect(same.every(Boolean)).toBe(false);
  });

  it('forks independent but reproducible streams', () => {
    const fork1 = new Rng(7).fork('boss');
    const fork2 = new Rng(7).fork('boss');
    const other = new Rng(7).fork('player');
    expect(fork1.next()).toBe(fork2.next());
    expect(new Rng(7).fork('boss').next()).not.toBe(other.next());
  });

  it('stays in range', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('Scheduler', () => {
  it('fires events in time order with stable ordering for ties', () => {
    const s = new Scheduler();
    const fired: string[] = [];
    s.at(100, () => fired.push('b'));
    s.at(50, () => fired.push('a'));
    s.at(100, () => fired.push('c'));
    s.run(() => false);
    expect(fired).toEqual(['a', 'b', 'c']);
  });

  it('supports scheduling from within a handler', () => {
    const s = new Scheduler();
    const fired: number[] = [];
    s.at(10, () => {
      fired.push(s.now);
      s.in(5, () => fired.push(s.now));
    });
    s.run(() => false);
    expect(fired).toEqual([10, 15]);
  });

  it('rejects scheduling into the past', () => {
    const s = new Scheduler();
    s.at(100, () => {
      expect(() => s.at(50, () => {})).toThrow(/past/);
    });
    s.run(() => false);
  });
});
