/** Pure time-series transforms. No DOM, no network: shared by the browser app, the Pages Functions and the tests. */

import type { ProtocolHistory } from 'papertrade-sdk';

export interface Point {
  /** Milliseconds since epoch. */
  time: number;
  value: number;
}

export interface Delta {
  abs: number;
  /** Relative change against the starting value, or null when that value is zero. */
  pct: number | null;
  fromMs: number;
  toMs: number;
  spanMs: number;
  /** True when the series is shorter than the requested window, so the change is since the earliest point. */
  partial: boolean;
}

export interface HistoryShape {
  startMs: number;
  intervalMs: number;
  /** When the last bucket was computed. The last bucket is still open, so it is stamped here. */
  asOfMs: number;
}

/**
 * Turn one column of /query/protocol/history into points.
 *
 * Each value is the state at the CLOSE of its bucket (verified: the last, still-open bucket equals the live
 * summary), so points are stamped with the bucket close and the open bucket with `asOfMs`. Leading zeros are
 * the time before the protocol had data and are dropped, keeping one zero as the baseline for counters.
 */
export function historyPoints(shape: HistoryShape, values: readonly number[]): Point[] {
  const first = values.findIndex((v) => Number.isFinite(v) && v !== 0);
  if (first < 0) return [];
  const out: Point[] = [];
  const last = values.length - 1;
  for (let i = Math.max(0, first - 1); i <= last; i++) {
    const close = shape.startMs + (i + 1) * shape.intervalMs;
    const value = values[i] ?? 0;
    out.push({ time: i === last ? Math.min(close, shape.asOfMs) : close, value: Number.isFinite(value) ? value : 0 });
  }
  return out;
}

/** Per-bucket increase of a cumulative counter (volume, trades, liquidations). Decreases clamp to zero. */
export function diffSeries(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    out.push({ time: points[i].time, value: Math.max(0, points[i].value - points[i - 1].value) });
  }
  return out;
}

/** Median gap between consecutive points, used as the series resolution. */
export function typicalStep(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < points.length; i++) gaps.push(points[i].time - points[i - 1].time);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

/** Closest point to `time`, or null when nothing is within half a step (plus one second of slack). */
export function pointNear(points: readonly Point[], time: number, toleranceMs = typicalStep(points) / 2 + 1000): Point | null {
  let best: Point | null = null;
  let bestGap = Infinity;
  for (const p of points) {
    const gap = Math.abs(p.time - time);
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best && bestGap <= toleranceMs ? best : null;
}

/**
 * Change between the newest point and the point about `windowMs` earlier. When the series does not reach back
 * that far the change is measured from its earliest point and flagged `partial`. Returns null with fewer than
 * two points.
 */
export function deltaOver(points: readonly Point[], windowMs: number): Delta | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const first = points[0];
  const target = last.time - windowMs;
  const step = typicalStep(points);
  let base: Point;
  let partial = false;
  if (target < first.time - step / 2) {
    base = first;
    partial = true;
  } else {
    base = pointNear(points.slice(0, -1), target, Infinity) ?? first;
  }
  if (base.time >= last.time) return null;
  const abs = last.value - base.value;
  return { abs, pct: base.value !== 0 ? abs / Math.abs(base.value) : null, fromMs: base.time, toMs: last.time, spanMs: last.time - base.time, partial };
}

/** Value of a cumulative counter at `time`; before its first point the counter was zero. Null if past the end. */
export function cumulativeAt(points: readonly Point[], time: number): number | null {
  if (!points.length) return null;
  const last = points[points.length - 1];
  if (time > last.time) return null;
  if (time <= points[0].time) return time < points[0].time - typicalStep(points) ? 0 : points[0].value;
  const near = pointNear(points, time, Infinity);
  return near ? near.value : null;
}

/** Change in a counter over the latest `windowMs` against the `windowMs` before it. Null if the counter never reached back. */
export function windowOverWindow(points: readonly Point[], windowMs: number): Delta | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const now = last.value;
  const mid = cumulativeAt(points, last.time - windowMs);
  const old = cumulativeAt(points, last.time - 2 * windowMs);
  if (mid === null || old === null) return null;
  const current = now - mid;
  const previous = mid - old;
  return {
    abs: current - previous,
    pct: previous > 0 ? (current - previous) / previous : null,
    fromMs: last.time - 2 * windowMs,
    toMs: last.time,
    spanMs: 2 * windowMs,
    partial: last.time - 2 * windowMs < points[0].time,
  };
}

export interface Aligned<K extends string> {
  times: number[];
  columns: Record<K, Array<number | null>>;
}

/** Join several series on the union of their timestamps. A series with no point at a time contributes null there. */
export function alignSeries<K extends string>(series: Record<K, readonly Point[]>): Aligned<K> {
  const names = Object.keys(series) as K[];
  const timeSet = new Set<number>();
  for (const name of names) for (const p of series[name]) timeSet.add(p.time);
  const times = [...timeSet].sort((a, b) => a - b);
  const columns = {} as Record<K, Array<number | null>>;
  for (const name of names) {
    const byTime = new Map(series[name].map((p) => [p.time, p.value]));
    columns[name] = times.map((t) => byTime.get(t) ?? null);
  }
  return { times, columns };
}

/** Merge point lists, sorting by time and keeping the later list's value on a duplicate timestamp. */
export function mergePoints(...lists: Array<readonly Point[]>): Point[] {
  const byTime = new Map<number, number>();
  for (const list of lists) for (const p of list) byTime.set(p.time, p.value);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
}

/** Keep points at or after `fromMs`. */
export function sinceTime(points: readonly Point[], fromMs: number): Point[] {
  return points.filter((p) => p.time >= fromMs);
}

/** Pointwise combination of two series on their shared timestamps. */
export function combineSeries(a: readonly Point[], b: readonly Point[], fn: (x: number, y: number) => number): Point[] {
  const byTime = new Map(b.map((p) => [p.time, p.value]));
  const out: Point[] = [];
  for (const p of a) {
    const other = byTime.get(p.time);
    if (other !== undefined) out.push({ time: p.time, value: fn(p.value, other) });
  }
  return out;
}

/**
 * One column of the protocol history as a single series: the hourly history, extended further back with the daily
 * history where the daily one reaches earlier. Both are stamped at bucket close.
 */
export function historyColumn(hourly: ProtocolHistory, daily: ProtocolHistory, column: keyof ProtocolHistory['columns']): Point[] {
  const h = historyPoints({ startMs: hourly.startMs, intervalMs: hourly.intervalMs, asOfMs: hourly.source.asOfMs }, hourly.columns[column]);
  const d = historyPoints({ startMs: daily.startMs, intervalMs: daily.intervalMs, asOfMs: daily.source.asOfMs }, daily.columns[column]);
  if (!d.length) return h;
  if (!h.length) return d;
  return d[0].time < h[0].time ? mergePoints(d.filter((p) => p.time < h[0].time), h) : h;
}
