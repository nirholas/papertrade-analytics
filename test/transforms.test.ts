import { describe, expect, it } from 'vitest';
import { alignSeries, cumulativeAt, deltaOver, diffSeries, historyPoints, mergePoints, windowOverWindow, type Point } from '../src/transforms.js';
import { history1h } from './helpers.js';

const H = 3_600_000;

describe('historyPoints', () => {
  it('stamps buckets at close, drops leading zeros but keeps one zero baseline, and stamps the open bucket at asOf', () => {
    const pts = historyPoints({ startMs: 0, intervalMs: H, asOfMs: 4 * H + 1000 }, [0, 0, 5, 7, 9]);
    expect(pts.map((p) => p.value)).toEqual([0, 5, 7, 9]);
    expect(pts.map((p) => p.time)).toEqual([2 * H, 3 * H, 4 * H, 4 * H + 1000]);
  });

  it('returns nothing when every value is zero', () => {
    expect(historyPoints({ startMs: 0, intervalMs: H, asOfMs: H }, [0, 0, 0])).toEqual([]);
  });

  it('keeps the recorded hourly TVL series ending at the open bucket time', () => {
    const h = history1h();
    const pts = historyPoints({ startMs: h.startMs, intervalMs: h.intervalMs, asOfMs: h.source.asOfMs }, h.columns.tvl);
    expect(pts.length).toBeGreaterThan(2);
    expect(pts[pts.length - 1].time).toBe(Math.min(h.startMs + h.columns.tvl.length * h.intervalMs, h.source.asOfMs));
    for (let i = 1; i < pts.length; i++) expect(pts[i].time).toBeGreaterThan(pts[i - 1].time);
  });
});

describe('diffSeries', () => {
  it('turns a cumulative counter into per-bucket increases and clamps decreases', () => {
    const pts: Point[] = [{ time: 1, value: 10 }, { time: 2, value: 15 }, { time: 3, value: 12 }, { time: 4, value: 20 }];
    expect(diffSeries(pts).map((p) => p.value)).toEqual([5, 0, 8]);
  });

  it('recorded cumulative volume never produces a negative bucket', () => {
    const h = history1h();
    const vol = historyPoints({ startMs: h.startMs, intervalMs: h.intervalMs, asOfMs: h.source.asOfMs }, h.columns.volume);
    expect(diffSeries(vol).every((p) => p.value >= 0)).toBe(true);
  });
});

describe('deltaOver', () => {
  const day: Point[] = [0, 6, 12, 18, 24, 30, 36, 42, 48].map((hours, i) => ({ time: hours * H, value: 100 + i * 10 }));

  it('measures a full window against the nearest earlier point', () => {
    const d = deltaOver(day, 24 * H);
    expect(d).not.toBeNull();
    expect(d!.abs).toBe(40);
    expect(d!.pct).toBeCloseTo(40 / 140);
    expect(d!.partial).toBe(false);
  });

  it('flags a window longer than the series as partial and measures from the earliest point', () => {
    const d = deltaOver(day, 7 * 24 * H);
    expect(d!.partial).toBe(true);
    expect(d!.abs).toBe(80);
  });

  it('returns null for fewer than two points', () => {
    expect(deltaOver([{ time: 1, value: 1 }], H)).toBeNull();
  });
});

describe('cumulativeAt and windowOverWindow', () => {
  const pts: Point[] = [0, 12, 24, 36, 48].map((h, i) => ({ time: h * H, value: i * 100 }));
  it('interpolates nothing: it takes the latest point at or before the time', () => {
    expect(cumulativeAt(pts, 30 * H)).toBe(200);
  });
  it('compares the last window of a cumulative counter with the one before it', () => {
    const d = windowOverWindow(pts, 24 * H);
    expect(d).not.toBeNull();
    expect(d!.abs).toBe(0);
  });
  it('treats the counter as zero before its first point and flags the comparison partial', () => {
    const d = windowOverWindow(pts.slice(2), 24 * H);
    expect(d).not.toBeNull();
    expect(d!.partial).toBe(true);
  });
  it('is null for a single point', () => {
    expect(windowOverWindow(pts.slice(0, 1), 24 * H)).toBeNull();
  });
});

describe('alignSeries and mergePoints', () => {
  it('aligns series on the union of timestamps with null for missing values', () => {
    const a: Point[] = [{ time: 1, value: 1 }, { time: 3, value: 3 }];
    const b: Point[] = [{ time: 2, value: 20 }, { time: 3, value: 30 }];
    const out = alignSeries({ a, b });
    expect(out.times).toEqual([1, 2, 3]);
    expect(out.columns.a).toEqual([1, null, 3]);
    expect(out.columns.b).toEqual([null, 20, 30]);
  });

  it('merges lists by time, later lists winning on equal timestamps', () => {
    const merged = mergePoints([{ time: 1, value: 1 }, { time: 2, value: 2 }], [{ time: 2, value: 9 }, { time: 3, value: 3 }]);
    expect(merged).toEqual([{ time: 1, value: 1 }, { time: 2, value: 9 }, { time: 3, value: 3 }]);
  });
});
