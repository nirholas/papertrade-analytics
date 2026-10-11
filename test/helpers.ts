import { readFileSync } from 'node:fs';
import { fetchCandles, decodeTradingState, type Candle, type LeaderboardAccounts, type LeaderboardPositionRow, type MarketStats, type ProtocolHistory, type ProtocolSummary } from 'papertrade-sdk';
import type { MetricsInputs } from '../src/metrics.js';
import type { HouseResponse } from '../src/types.js';

export function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as T;
}

/** The recorded Hyperliquid candleSnapshot response, decoded by the SDK's own fetchCandles. */
export async function recordedCandles(): Promise<Candle[]> {
  const raw = fixture<unknown[]>('candles-btc-1h');
  const stub = (async () => new Response(JSON.stringify(raw), { status: 200 })) as unknown as typeof fetch;
  return fetchCandles('BTC', '1h', 0, Date.now(), { fetch: stub });
}

export const house = () => fixture<HouseResponse>('house');
export const history1h = () => fixture<ProtocolHistory>('history1h');
export const history1d = () => fixture<ProtocolHistory>('history1d');
export const leaderboard = (name: 'lbacc-24h' | 'lbacc-all') => fixture<LeaderboardAccounts>(name);
export const positions = () => fixture<{ rows: LeaderboardPositionRow[] }>('lbpos-24h').rows;

/** Inputs assembled from the recorded responses; `nowMs` is the moment the recording was taken. */
export async function recordedInputs(overrides: Partial<MetricsInputs> = {}): Promise<MetricsInputs> {
  const summary = fixture<ProtocolSummary>('summary');
  const btc = await recordedCandles();
  return {
    nowMs: summary.source.at,
    summary,
    marketStats: fixture<MarketStats>('market-stats'),
    trading: decodeTradingState(fixture('trading')),
    history1h: history1h(),
    history1d: history1d(),
    house: house(),
    candles: { BTC: btc },
    onchain: null,
    snapshots: [],
    ...overrides,
  };
}
