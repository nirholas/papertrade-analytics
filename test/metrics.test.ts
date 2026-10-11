import { describe, expect, it } from 'vitest';
import { PAPER_MINT_CURVE, paperMintRate } from 'papertrade-sdk';
import { KEEPS_EXAMPLE, buildMetrics } from '../src/metrics.js';
import { recordedInputs } from './helpers.js';

describe('buildMetrics on recorded responses', async () => {
  const inputs = await recordedInputs();
  const m = buildMetrics(inputs);

  it('reads the protocol balances from the summary', () => {
    expect(m.protocol.tvlUsd).toBeCloseTo(124_170_607.73, 1);
    expect(m.protocol.openPositions).toBe(4857);
    expect(m.protocol.lpUsd).toBeCloseTo(5_060_241.05, 1);
  });

  it('sums 24h volume across markets and keeps all-time volume separate', () => {
    expect(m.protocol.volume24hUsd).toBeCloseTo(m.markets.reduce((s, x) => s + x.volume24hUsd, 0), 4);
    expect(m.protocol.allTimeVolumeUsd).toBeGreaterThanOrEqual(m.protocol.volume24hUsd);
  });

  it('computes the PAPER mint rate from the SDK curve and tail progress, not the curve maximum', () => {
    expect(m.paper.mintRate).toBeCloseTo(paperMintRate({ trackedLpUsd: m.paper.trackedLpUsd, tailProgressUsd: m.paper.tailProgressUsd }), 10);
    expect(m.paper.mintRate).toBeLessThan(m.paper.mintRateMax);
    expect(m.paper.phase).toBe('decay');
    expect(m.paper.curve).toEqual(PAPER_MINT_CURVE);
  });

  it('falls back to indexer supply and flags it when the chain read is unavailable', () => {
    expect(m.source.onchain).toBe(false);
    expect(m.paper.supplySource).toBe('indexer');
    expect(m.paper.stakedShare).toBeGreaterThan(0.9);
  });

  it('prefers on-chain supply when provided and scales accRewardPerShare by 1e27', () => {
    const chain = buildMetrics({ ...inputs, onchain: { paperSupplyRaw: 10n * 10n ** 18n, totalStakedRaw: 5n * 10n ** 18n, accRewardPerShareRaw: 2n * 10n ** 27n } });
    expect(chain.paper.supply).toBe(10);
    expect(chain.paper.stakedShare).toBe(0.5);
    expect(chain.staking.accRewardPerShareUsd).toBe(2);
    expect(chain.paper.supplySource).toBe('onchain');
  });

  it('reports book skew from the house heads and cap utilization from the instrument tuple', () => {
    const btc = m.markets[0];
    expect(btc.symbol).toBe('BTC');
    expect(btc.longShare).toBeGreaterThan(0);
    expect(btc.longShare).toBeLessThan(1);
    expect(btc.longCapUtilization).toBeCloseTo(23_483.03502 / 1_207_459.685, 3);
    expect(btc.maxLeverage).toBe(1000);
    expect(btc.paused).toBe(false);
  });

  it('computes the keeps example through estimateClose: less than the raw gain, never negative', () => {
    const k = m.markets[0].keepsExample;
    expect(k).not.toBeNull();
    expect(k!.marginUsd).toBe(KEEPS_EXAMPLE.marginUsd);
    expect(k!.rawGainUsd).toBeGreaterThan(0);
    expect(k!.netUsd).toBeGreaterThanOrEqual(0);
    expect(k!.netUsd).toBeLessThan(k!.rawGainUsd);
    expect(k!.keptFraction).toBeCloseTo(k!.netUsd / k!.rawGainUsd, 10);
  });

  it('has no price or keeps example for a market with no candles', () => {
    const eth = m.markets[1];
    expect(eth.priceUsd).toBeNull();
    expect(eth.keepsExample).toBeNull();
  });

  it('gives deltas that are flagged partial while the protocol is under a day old', () => {
    expect(m.deltas.tvl.d7?.partial).toBe(true);
  });
});

describe('openapi.json', async () => {
  const { readFileSync } = await import('node:fs');
  const spec = JSON.parse(readFileSync(new URL('../site/public/openapi.json', import.meta.url), 'utf8')) as {
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };
  const m = buildMetrics(await recordedInputs());

  it('documents every top-level and nested key buildMetrics returns', () => {
    const schemas = spec.components.schemas;
    expect(Object.keys(schemas.Metrics.properties!).sort()).toEqual(Object.keys(m).sort());
    for (const key of ['source', 'protocol', 'paper', 'staking'] as const) {
      const documented = Object.keys((schemas.Metrics.properties![key] as { properties: object }).properties).sort();
      expect(documented, key).toEqual(Object.keys(m[key]).sort());
    }
    expect(Object.keys(schemas.Market.properties!).sort()).toEqual(Object.keys(m.markets[0]).sort());
    expect(Object.keys(schemas.KeepsExample.properties!).sort()).toEqual(Object.keys(m.markets[0].keepsExample!).sort());
  });
});
