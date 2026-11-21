/** Pure geometry for the SVG charts, so the maths can be unit-tested without a browser. */

export interface Frame {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const DEFAULT_FRAME: Frame = {
  width: 640,
  height: 280,
  left: 52,
  right: 12,
  top: 16,
  bottom: 44,
};

export interface WfItem {
  label: string;
  value: number;
  kind: 'total' | 'delta';
  /** Defaults to 1: a positive delta is good. Use -1 for costs. */
  polarity?: 1 | -1;
}
export interface WfBar {
  label: string;
  value: number;
  kind: 'total' | 'delta';
  tone: 'total' | 'good' | 'bad' | 'flat';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Running level after this item. */
  level: number;
}
export interface WfGeometry {
  frame: Frame;
  bars: WfBar[];
  connectors: Array<{ x1: number; x2: number; y: number }>;
  ticks: Array<{ y: number; value: number }>;
  yMin: number;
  yMax: number;
  /** True when the vertical axis does not start at zero (so bar heights are not proportional to totals). */
  truncated: boolean;
}

function pad(min: number, max: number): [number, number] {
  const range = max - min;
  const p = range === 0 ? Math.max(1, Math.abs(max) * 0.1) : range * 0.25;
  return [min - p, max + p];
}

export function waterfallGeometry(items: WfItem[], frame: Frame = DEFAULT_FRAME): WfGeometry {
  const visited: number[] = [];
  const levels: Array<{ from: number; to: number }> = [];
  let level = 0;
  for (const it of items) {
    if (it.kind === 'total') {
      levels.push({ from: 0, to: it.value });
      level = it.value;
      visited.push(it.value);
    } else {
      levels.push({ from: level, to: level + it.value });
      visited.push(level, level + it.value);
      level += it.value;
    }
  }
  const [yMin, yMax] = pad(
    Math.min(...visited, 0 === visited.length ? 0 : Infinity),
    Math.max(...visited, 0 === visited.length ? 0 : -Infinity),
  );
  const innerW = frame.width - frame.left - frame.right;
  const innerH = frame.height - frame.top - frame.bottom;
  const y = (v: number): number => frame.top + ((yMax - v) / (yMax - yMin)) * innerH;
  const slot = innerW / Math.max(1, items.length);
  const bw = slot * 0.6;
  const bars: WfBar[] = items.map((it, i) => {
    const lv = levels[i] as { from: number; to: number };
    const x = frame.left + i * slot + (slot - bw) / 2;
    if (it.kind === 'total') {
      const top = y(it.value);
      return {
        label: it.label,
        value: it.value,
        kind: it.kind,
        tone: 'total',
        x,
        y: top,
        w: bw,
        h: Math.max(1, frame.top + innerH - top),
        level: lv.to,
      };
    }
    const hi = Math.max(lv.from, lv.to);
    const lo = Math.min(lv.from, lv.to);
    const polarity = it.polarity ?? 1;
    const t: WfBar['tone'] = it.value === 0 ? 'flat' : it.value * polarity > 0 ? 'good' : 'bad';
    return {
      label: it.label,
      value: it.value,
      kind: it.kind,
      tone: t,
      x,
      y: y(hi),
      w: bw,
      h: Math.max(1, y(lo) - y(hi)),
      level: lv.to,
    };
  });
  const connectors = bars
    .slice(0, -1)
    .map((b, i) => ({ x1: b.x + b.w, x2: (bars[i + 1] as WfBar).x, y: y(b.level) }));
  const ticks = [0, 1, 2, 3, 4].map((k) => {
    const value = yMin + ((yMax - yMin) * k) / 4;
    return { y: y(value), value };
  });
  return { frame, bars, connectors, ticks, yMin, yMax, truncated: yMin > 0 };
}

export interface LineSeries {
  name: string;
  values: number[];
}
export interface LineGeometry {
  frame: Frame;
  paths: Array<{ name: string; d: string; points: Array<{ x: number; y: number; value: number }> }>;
  xTicks: Array<{ x: number; label: string }>;
  yTicks: Array<{ y: number; value: number }>;
  yMin: number;
  yMax: number;
  truncated: boolean;
  /** x position for an index, for markers such as "closed through". */
  xAt: (index: number) => number;
}

export function lineGeometry(
  series: LineSeries[],
  labels: string[],
  frame: Frame = DEFAULT_FRAME,
): LineGeometry {
  const all = series.flatMap((s) => s.values);
  const [yMin, yMax] = pad(Math.min(...all), Math.max(...all));
  const innerW = frame.width - frame.left - frame.right;
  const innerH = frame.height - frame.top - frame.bottom;
  const n = Math.max(1, labels.length - 1);
  const xAt = (i: number): number => frame.left + (i / n) * innerW;
  const y = (v: number): number => frame.top + ((yMax - v) / (yMax - yMin)) * innerH;
  const paths = series.map((s) => {
    const points = s.values.map((v, i) => ({ x: xAt(i), y: y(v), value: v }));
    return {
      name: s.name,
      points,
      d: points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(' '),
    };
  });
  const yTicks = [0, 1, 2, 3, 4].map((k) => {
    const value = yMin + ((yMax - yMin) * k) / 4;
    return { y: y(value), value };
  });
  return {
    frame,
    paths,
    xTicks: labels.map((label, i) => ({ x: xAt(i), label })),
    yTicks,
    yMin,
    yMax,
    truncated: yMin > 0,
    xAt,
  };
}
