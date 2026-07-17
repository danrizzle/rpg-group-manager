/** Small stats helpers for Monte Carlo aggregation. */

export interface Distribution {
  mean: number;
  stddev: number;
  p10: number;
  p50: number;
  p90: number;
}

export function distribution(values: number[]): Distribution {
  if (values.length === 0) return { mean: 0, stddev: 0, p10: 0, p50: 0, p90: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length;
  return {
    mean,
    stddev: Math.sqrt(variance),
    p10: percentile(sorted, 0.1),
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
  return sorted[idx]!;
}
