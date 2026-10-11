import {
  MAINNET,
  PapertradeClient,
  fetchCandles,
  paperTotalSupply,
  publicClient,
  stakingState,
  type Candle,
  type HttpOptions,
} from 'papertrade-sdk';
import { buildMetrics, type MetricsInputs, type OnchainReads } from './metrics.js';
import type { HouseResponse, Metrics, Snapshot } from './types.js';

/** Read PAPER supply and staking state from HyperEVM, trying each configured RPC once. Null if every RPC refuses. */
export async function readOnchain(rpcUrls: readonly string[] = [MAINNET.network.rpcUrl, ...MAINNET.network.fallbackRpcUrls]): Promise<OnchainReads | null> {
  for (const url of rpcUrls) {
    try {
      const client = publicClient(url);
      const [paperSupplyRaw, staking] = await Promise.all([paperTotalSupply(client), stakingState(client)]);
      return { paperSupplyRaw, totalStakedRaw: staking.totalStakedRaw, accRewardPerShareRaw: staking.accRewardPerShareRaw };
    } catch {
      continue;
    }
  }
  return null;
}

/** Fetch everything the KPI document needs. Reads run in parallel; only the on-chain and candle reads may degrade. */
export async function collectInputs(params: {
  http?: HttpOptions;
  snapshots?: readonly Snapshot[];
  nowMs?: number;
  onchain?: () => Promise<OnchainReads | null>;
}): Promise<MetricsInputs> {
  const client = new PapertradeClient({ clientBuild: 'papertrade-analytics', ...params.http });
  const nowMs = params.nowMs ?? Date.now();
  const symbols = MAINNET.instruments.map((i) => i.name);
  const [summary, marketStats, trading, history1h, history1d, house, onchain, ...candleLists] = await Promise.all([
    client.protocolSummary(),
    client.marketStats(),
    client.tradingState(),
    client.protocolHistory('1h'),
    client.protocolHistory('1d'),
    client.http.get<HouseResponse>('/state/house/current'),
    (params.onchain ?? readOnchain)(),
    ...symbols.map((s) => fetchCandles(s, '1h', nowMs - 8 * 86_400_000, nowMs).catch((): Candle[] => [])),
  ]);
  const candles: Record<string, Candle[]> = {};
  symbols.forEach((s, i) => {
    candles[s] = candleLists[i];
  });
  return {
    nowMs,
    summary,
    marketStats,
    trading,
    history1h,
    history1d,
    house,
    candles,
    onchain,
    snapshots: params.snapshots ?? [],
  };
}

export async function computeMetrics(params: Parameters<typeof collectInputs>[0]): Promise<{ metrics: Metrics; inputs: MetricsInputs }> {
  const inputs = await collectInputs(params);
  return { metrics: buildMetrics(inputs), inputs };
}

/** One KV sample of the house book, taken from the same inputs as a metrics document. */
export function snapshotFrom(inputs: MetricsInputs): Snapshot {
  const head = inputs.house.head;
  return {
    t: head[0] ?? inputs.nowMs,
    tvl: Number(inputs.summary.balances.tvl) / 1e18,
    margin: Number(inputs.summary.balances.margin) / 1e18,
    lp: head[1] ?? 0,
    pnl: head[2] ?? 0,
    open: inputs.summary.activity.open,
    btcLong: head[4] ?? 0,
    btcShort: head[5] ?? 0,
    ethLong: head[6] ?? 0,
    ethShort: head[7] ?? 0,
  };
}
