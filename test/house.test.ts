import { describe, expect, it } from 'vitest';
import { houseChartSeries, houseSeries, resolutionForRange } from '../src/house.js';
import type { Snapshot } from '../src/types.js';
import { house } from './helpers.js';

describe('houseSeries', () => {
  it('stamps recorded tiers at bucket close and ends at the live head time', () => {
    const h = house();
    const lp = houseSeries(h, '1h', 'lp');
    expect(lp.length).toBeGreaterThan(1);
    expect(lp[lp.length - 1].time).toBeLessThanOrEqual(h.head[0]);
    for (let i = 1; i < lp.length; i++) expect(lp[i].time).toBeGreaterThan(lp[i - 1].time);
  });

  it('returns an empty series for a missing tier', () => {
    expect(houseSeries({ ...house(), heads: {} }, '1h', 'lp')).toEqual([]);
  });
});

describe('houseChartSeries', () => {
  it('falls back to protocol tiers with fewer than 12 recorded snapshots', () => {
    const out = houseChartSeries({ house: house(), snapshots: [], range: '24h', column: 'lp', snapshotKey: 'lp', nowMs: house().head[0] });
    expect(out.source).toBe(resolutionForRange('24h'));
  });

  it('prefers recorded snapshots once there are enough inside the range', () => {
    const now = house().head[0];
    const snaps: Snapshot[] = Array.from({ length: 20 }, (_, i) => ({ t: now - (20 - i) * 300_000, tvl: 1, margin: 1, lp: 100 + i, pnl: 0, open: 3, btcLong: 1, btcShort: 1, ethLong: 1, ethShort: 1 }));
    const out = houseChartSeries({ house: house(), snapshots: snaps, range: '24h', column: 'lp', snapshotKey: 'lp', nowMs: now });
    expect(out.source).toBe('recorded');
    expect(out.points.length).toBeGreaterThanOrEqual(20);
  });
});
