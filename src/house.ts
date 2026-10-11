import type { Point } from './transforms.js';
import { mergePoints } from './transforms.js';
import type { HouseColumn, HouseResponse, Snapshot } from './types.js';

/** Resolutions the protocol keeps for the house book. Each holds only its most recent handful of buckets. */
export const HOUSE_RESOLUTIONS = {
  '1s': 1_000,
  '1m': 60_000,
  '1h': 3_600_000,
  '1d': 86_400_000,
} as const;

export type HouseResolution = keyof typeof HOUSE_RESOLUTIONS;

/** Column names that hold each market's long and short open notional, by instrument id. */
export const HOUSE_BOOK_COLUMNS: Record<number, { long: HouseColumn; short: HouseColumn }> = {
  0: { long: 'bl', short: 'bs' },
  1: { long: 'el', short: 'es' },
};

/**
 * One column of one resolution as points. Values are the state at each bucket's close (the newest bucket is
 * still open and equals `head`), so they are stamped the same way as /query/protocol/history. Leading zeros are
 * the time before the book existed and are dropped.
 */
export function houseSeries(house: HouseResponse, resolution: HouseResolution, column: HouseColumn): Point[] {
  const tier = house.heads[String(HOUSE_RESOLUTIONS[resolution])];
  const values = tier?.columns?.[column];
  if (!tier || !values) return [];
  const step = HOUSE_RESOLUTIONS[resolution];
  const headTime = house.head[0] ?? house.sourceAsOfMs;
  const first = values.findIndex((v) => Number.isFinite(v) && v !== 0);
  if (first < 0) return [];
  const out: Point[] = [];
  const last = values.length - 1;
  for (let i = first; i <= last; i++) {
    const offset = tier.timeOffsetsMs[i] ?? i * step;
    const close = tier.baseTimeMs + offset + step;
    out.push({ time: i === last ? Math.min(close, headTime) : close, value: values[i] ?? 0 });
  }
  return out;
}

/** The point in time each range reaches back, in ms. `all` is unbounded. */
export const RANGE_MS = {
  '1h': 3_600_000,
  '6h': 21_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  all: Infinity,
} as const;

export type Range = keyof typeof RANGE_MS;

/** Which house resolution fills a range when no recorded snapshots exist. */
export function resolutionForRange(range: Range): HouseResolution {
  if (range === '1h') return '1m';
  if (range === '6h' || range === '24h') return '1h';
  return '1d';
}

export type SnapshotKey = keyof Omit<Snapshot, 't'>;

export function snapshotSeries(snapshots: readonly Snapshot[], key: SnapshotKey): Point[] {
  return snapshots.map((s) => ({ time: s.t, value: s[key] })).sort((a, b) => a.time - b.time);
}

/**
 * Best available series for a house-book value over a range. Recorded snapshots win when they have enough
 * points inside the range; otherwise the protocol's own bucketed heads are used. The newest head point is
 * always appended so the chart ends at the live value.
 */
export function houseChartSeries(params: {
  house: HouseResponse;
  snapshots: readonly Snapshot[];
  range: Range;
  column: HouseColumn;
  snapshotKey: SnapshotKey;
  nowMs: number;
}): { points: Point[]; source: 'recorded' | HouseResolution } {
  const { house, snapshots, range, column, snapshotKey, nowMs } = params;
  const from = range === 'all' ? -Infinity : nowMs - RANGE_MS[range];
  const recorded = snapshotSeries(snapshots, snapshotKey).filter((p) => p.time >= from);
  if (recorded.length >= 12) {
    const head = houseSeries(house, '1s', column).slice(-1);
    return { points: mergePoints(recorded, head.filter((p) => p.time > recorded[recorded.length - 1].time)), source: 'recorded' };
  }
  const resolution = resolutionForRange(range);
  return { points: houseSeries(house, resolution, column), source: resolution };
}
