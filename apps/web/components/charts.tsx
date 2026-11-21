import { crNumber } from '../lib/format';
import { DEFAULT_FRAME, lineGeometry, waterfallGeometry } from '../lib/chart-geometry';
import type { Frame, LineSeries, WfItem } from '../lib/chart-geometry';

const FILL: Record<string, string> = {
  total: 'var(--chart-total)',
  good: 'var(--good)',
  bad: 'var(--bad)',
  flat: 'var(--muted)',
};

/** Waterfall of a bridge. Values are rupees; labels are shown in crore. Pair it with a data table for accessibility. */
export function Waterfall({
  items,
  title,
  frame = DEFAULT_FRAME,
}: {
  items: WfItem[];
  title: string;
  frame?: Frame;
}) {
  const g = waterfallGeometry(items, frame);
  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label={title}
        className="chart-svg"
      >
        <title>{title}</title>
        {g.ticks.map((t) => (
          <g key={t.y}>
            <line
              x1={frame.left}
              x2={frame.width - frame.right}
              y1={t.y}
              y2={t.y}
              className="gridline"
            />
            <text x={frame.left - 6} y={t.y + 4} textAnchor="end" className="axis-label">
              {crNumber(t.value, 0)}
            </text>
          </g>
        ))}
        {g.connectors.map((c, i) => (
          <line key={i} x1={c.x1} x2={c.x2} y1={c.y} y2={c.y} className="connector" />
        ))}
        {g.bars.map((b) => {
          const labelAbove = b.kind === 'total' || b.value >= 0;
          return (
            <g key={b.label}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={FILL[b.tone]}
                rx={2}
                data-tone={b.tone}
              />
              <text
                x={b.x + b.w / 2}
                y={labelAbove ? b.y - 5 : b.y + b.h + 12}
                textAnchor="middle"
                className="bar-label"
              >
                {b.kind === 'delta' && b.value > 0 ? '+' : ''}
                {crNumber(b.value)}
              </text>
              <text
                x={b.x + b.w / 2}
                y={frame.height - frame.bottom + 16}
                textAnchor="middle"
                className="axis-label"
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="chart-note">
        Values in ₹ crore.
        {g.truncated
          ? ' The vertical axis does not start at zero, so bar heights show changes, not proportions.'
          : ''}
      </figcaption>
    </figure>
  );
}

const SERIES_STYLE = [
  { stroke: 'var(--chart-1)', dash: undefined },
  { stroke: 'var(--chart-2)', dash: '6 4' },
  { stroke: 'var(--chart-3)', dash: undefined },
  { stroke: 'var(--muted)', dash: '2 3' },
];

/** Multi-series line chart with an optional marker after which values are forecast rather than actual. */
export function LineChart({
  series,
  labels,
  title,
  markerAfter,
  frame = DEFAULT_FRAME,
}: {
  series: LineSeries[];
  labels: string[];
  title: string;
  markerAfter?: number;
  frame?: Frame;
}) {
  const g = lineGeometry(series, labels, frame);
  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label={title}
        className="chart-svg"
      >
        <title>{title}</title>
        {g.yTicks.map((t) => (
          <g key={t.y}>
            <line
              x1={frame.left}
              x2={frame.width - frame.right}
              y1={t.y}
              y2={t.y}
              className="gridline"
            />
            <text x={frame.left - 6} y={t.y + 4} textAnchor="end" className="axis-label">
              {crNumber(t.value, 0)}
            </text>
          </g>
        ))}
        {g.xTicks.map((t) => (
          <text
            key={t.label + t.x}
            x={t.x}
            y={frame.height - frame.bottom + 16}
            textAnchor="middle"
            className="axis-label"
          >
            {t.label}
          </text>
        ))}
        {markerAfter !== undefined && (
          <g>
            <line
              x1={g.xAt(markerAfter) + (g.xAt(1) - g.xAt(0)) / 2}
              x2={g.xAt(markerAfter) + (g.xAt(1) - g.xAt(0)) / 2}
              y1={frame.top}
              y2={frame.height - frame.bottom}
              className="marker"
            />
            <text
              x={g.xAt(markerAfter) + (g.xAt(1) - g.xAt(0)) / 2 + 4}
              y={frame.top + 10}
              className="axis-label"
            >
              forecast →
            </text>
          </g>
        )}
        {g.paths.map((p, i) => (
          <path
            key={p.name}
            d={p.d}
            fill="none"
            strokeWidth={2}
            stroke={SERIES_STYLE[i % SERIES_STYLE.length]?.stroke}
            strokeDasharray={SERIES_STYLE[i % SERIES_STYLE.length]?.dash}
          />
        ))}
      </svg>
      <figcaption className="legend">
        {series.map((s, i) => (
          <span key={s.name} className="legend-item">
            <svg width="26" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="26"
                y1="4"
                y2="4"
                strokeWidth={2}
                stroke={SERIES_STYLE[i % SERIES_STYLE.length]?.stroke}
                strokeDasharray={SERIES_STYLE[i % SERIES_STYLE.length]?.dash}
              />
            </svg>
            {s.name}
          </span>
        ))}
      </figcaption>
      <p className="chart-note">
        Values in ₹ crore.{g.truncated ? ' The vertical axis does not start at zero.' : ''}
      </p>
    </figure>
  );
}

const SPARK: Frame = { width: 120, height: 32, left: 2, right: 2, top: 3, bottom: 3 };
/** Tiny trend line with the last point marked. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const g = lineGeometry(
    [{ name: label, values }],
    values.map((_, i) => String(i)),
    SPARK,
  );
  const last = g.paths[0]?.points.at(-1);
  return (
    <svg
      viewBox={`0 0 ${SPARK.width} ${SPARK.height}`}
      width={SPARK.width}
      height={SPARK.height}
      role="img"
      aria-label={label}
      className="spark"
    >
      <path d={g.paths[0]?.d} fill="none" stroke="var(--bad)" strokeWidth={1.8} />
      {last && <circle cx={last.x} cy={last.y} r={2.5} fill="var(--bad)" />}
    </svg>
  );
}
