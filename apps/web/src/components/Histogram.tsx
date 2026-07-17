import { useMemo, useState } from 'react';

/**
 * Single-series DPS histogram. One hue (magnitude has no identity to
 * encode), thin bars with surface gaps, rounded data-ends, recessive
 * baseline, per-bar hover tooltip. Text stays in text tokens.
 */
export function Histogram({ values, mean }: { values: number[]; mean: number }) {
  const [hover, setHover] = useState<number | null>(null);

  const { bins, min, max, maxCount } = useMemo(() => {
    if (values.length === 0) return { bins: [] as number[], min: 0, max: 0, maxCount: 0 };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const n = 24;
    const bins = new Array<number>(n).fill(0);
    const span = max - min || 1;
    for (const v of values) {
      bins[Math.min(n - 1, Math.floor(((v - min) / span) * n))]!++;
    }
    return { bins, min, max, maxCount: Math.max(...bins) };
  }, [values]);

  if (bins.length === 0) return null;

  const W = 300;
  const H = 96;
  const plotH = H - 14;
  const barW = W / bins.length;
  const span = max - min || 1;
  const meanX = ((mean - min) / span) * W;
  const binLabel = (i: number) =>
    `${Math.round(min + (i / bins.length) * span)}–${Math.round(min + ((i + 1) / bins.length) * span)} DPS`;

  return (
    <div className="histogram">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="DPS distribution histogram">
        {bins.map((count, i) => {
          const h = maxCount > 0 ? (count / maxCount) * (plotH - 6) : 0;
          return (
            <g key={i}>
              <rect
                x={i * barW + 1}
                y={plotH - h}
                width={barW - 2}
                height={Math.max(h, count > 0 ? 2 : 0)}
                rx={2}
                className={hover === i ? 'hist-bar hist-bar-hover' : 'hist-bar'}
              />
              {/* invisible full-height hit target, bigger than the mark */}
              <rect
                x={i * barW}
                y={0}
                width={barW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
        <line x1={0} y1={plotH} x2={W} y2={plotH} className="hist-baseline" />
        <line x1={meanX} y1={4} x2={meanX} y2={plotH} className="hist-mean" />
        <text x={4} y={H - 2} className="hist-label">
          {Math.round(min)}
        </text>
        <text x={W - 4} y={H - 2} className="hist-label" textAnchor="end">
          {Math.round(max)}
        </text>
        <text
          x={Math.min(W - 30, Math.max(30, meanX))}
          y={H - 2}
          className="hist-label hist-label-mean"
          textAnchor="middle"
        >
          x̄ {Math.round(mean)}
        </text>
      </svg>
      <div className="hist-tooltip">{hover !== null ? `${binLabel(hover)}: ${bins[hover]} runs` : ' '}</div>
    </div>
  );
}
