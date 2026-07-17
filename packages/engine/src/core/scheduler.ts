/**
 * Discrete-event scheduler. Time is integer milliseconds since pull.
 * A binary min-heap ordered by (time, insertion sequence) — the sequence
 * tiebreak makes simultaneous events fire in a deterministic order.
 */
type Scheduled = { t: number; seq: number; fn: () => void };

export class Scheduler {
  private heap: Scheduled[] = [];
  private seq = 0;
  private nowMs = 0;

  get now(): number {
    return this.nowMs;
  }

  at(t: number, fn: () => void): void {
    if (!Number.isInteger(t)) throw new Error(`non-integer sim time: ${t}`);
    if (t < this.nowMs) throw new Error(`scheduling into the past: ${t} < ${this.nowMs}`);
    this.push({ t, seq: this.seq++, fn });
  }

  in(delta: number, fn: () => void): void {
    this.at(this.nowMs + Math.max(0, Math.round(delta)), fn);
  }

  /** Run events until the queue is empty or `shouldStop` returns true. */
  run(shouldStop: () => boolean): void {
    while (this.heap.length > 0 && !shouldStop()) {
      const next = this.pop();
      this.nowMs = next.t;
      next.fn();
    }
  }

  private push(item: Scheduled): void {
    const heap = this.heap;
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (compare(heap[i]!, heap[parent]!) >= 0) break;
      [heap[i], heap[parent]] = [heap[parent]!, heap[i]!];
      i = parent;
    }
  }

  private pop(): Scheduled {
    const heap = this.heap;
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let smallest = i;
        if (l < heap.length && compare(heap[l]!, heap[smallest]!) < 0) smallest = l;
        if (r < heap.length && compare(heap[r]!, heap[smallest]!) < 0) smallest = r;
        if (smallest === i) break;
        [heap[i], heap[smallest]] = [heap[smallest]!, heap[i]!];
        i = smallest;
      }
    }
    return top;
  }
}

function compare(a: Scheduled, b: Scheduled): number {
  return a.t - b.t || a.seq - b.seq;
}
