import { describe, expect, it } from 'vitest';
import { LEVERAGE_BUCKETS, SIZE_BUCKETS, bucketize, concentration, positionInsights, settledPositions, traderRows, walletUrl } from '../src/insights.js';
import { leaderboard, positions } from './helpers.js';

describe('bucketize', () => {
  it('counts items into half-open buckets and sums weights', () => {
    const out = bucketize(
      [
        { value: 1, weight: 10 },
        { value: 9.99, weight: 5 },
        { value: 10, weight: 1 },
        { value: 1000, weight: 2 },
      ],
      LEVERAGE_BUCKETS,
    );
    expect(out[0].count).toBe(2);
    expect(out[0].weight).toBe(15);
    expect(out[1].count).toBe(1);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(4);
  });

  it('counts every item exactly once for the recorded positions', () => {
    const all = settledPositions(positions());
    const out = bucketize(all.map((p) => ({ value: p.notionalUsd })), SIZE_BUCKETS);
    expect(out.reduce((s, b) => s + b.count, 0)).toBe(all.length);
  });
});

describe('positionInsights', () => {
  it('derives long and short counts, notional shares and medians from recorded positions', () => {
    const all = settledPositions(positions());
    const ins = positionInsights(all);
    expect(ins.count).toBe(all.length);
    expect(ins.longCount + ins.shortCount).toBe(all.length);
    expect(ins.longShareByNotional).toBeGreaterThanOrEqual(0);
    expect(ins.longShareByNotional).toBeLessThanOrEqual(1);
    expect(ins.medianLeverage).toBeGreaterThan(0);
  });

  it('deduplicates the same position seen in two windows', () => {
    expect(settledPositions(positions(), positions())).toHaveLength(settledPositions(positions()).length);
  });

  it('has no share and no medians for an empty list', () => {
    const ins = positionInsights([]);
    expect(ins.longShareByNotional).toBeNull();
    expect(ins.medianLeverage).toBeNull();
  });
});

describe('traders and concentration', () => {
  const rows = traderRows(leaderboard('lbacc-all').accounts);

  it('lowercases addresses and converts wad strings to USD', () => {
    expect(rows[0].address).toBe(rows[0].address.toLowerCase());
    expect(Number.isFinite(rows[0].windowedPnlUsd)).toBe(true);
  });

  it('computes cumulative shares that never decrease and stay within the total', () => {
    const total = rows.reduce((s, r) => s + r.openNotionalUsd, 0) * 2;
    const c = concentration(rows, total);
    for (let i = 1; i < c.cumulative.length; i++) expect(c.cumulative[i].share).toBeGreaterThanOrEqual(c.cumulative[i - 1].share);
    expect(c.shareOfTotal).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('reports no share when the protocol total is zero', () => {
    expect(concentration(rows, 0).shareOfTotal).toBeNull();
  });
});

describe('walletUrl', () => {
  it('links to the explorer wallet route with a lowercase address', () => {
    expect(walletUrl('0xABCDEF0000000000000000000000000000000001')).toBe('https://papertrade-explorer.pages.dev/#/wallet/0xabcdef0000000000000000000000000000000001');
  });
});
