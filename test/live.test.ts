import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../src/sources.js';

const live = process.env.PAPERTRADE_LIVE === '1';

describe.skipIf(!live)('live Papertrade API', () => {
  it('builds metrics from the production indexer', async () => {
    const { metrics } = await computeMetrics({ onchain: async () => null });
    expect(metrics.protocol.tvlUsd).toBeGreaterThan(0);
    expect(metrics.markets.map((m) => m.symbol)).toEqual(expect.arrayContaining(['BTC', 'ETH']));
    expect(metrics.paper.mintRate).toBeGreaterThan(0);
    expect(metrics.paper.mintRate).toBeLessThanOrEqual(100);
  }, 60_000);
});
