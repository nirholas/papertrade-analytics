import type { LeaderboardAccount, LeaderboardPositionRow } from 'papertrade-sdk';
import { wadToNumber } from 'papertrade-sdk';

export interface BucketSpec {
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Exclusive upper bound. */
  max: number;
}

export interface Bucket extends BucketSpec {
  count: number;
  /** Sum of the weights of the items in the bucket (for example notional). */
  weight: number;
}

export const LEVERAGE_BUCKETS: BucketSpec[] = [
  { label: '1-9x', min: 1, max: 10 },
  { label: '10-24x', min: 10, max: 25 },
  { label: '25-49x', min: 25, max: 50 },
  { label: '50-99x', min: 50, max: 100 },
  { label: '100-249x', min: 100, max: 250 },
  { label: '250-499x', min: 250, max: 500 },
  { label: '500-999x', min: 500, max: 1000 },
  { label: '1000x', min: 1000, max: Infinity },
];

export const SIZE_BUCKETS: BucketSpec[] = [
  { label: 'Under $10K', min: 0, max: 10_000 },
  { label: '$10K-100K', min: 10_000, max: 100_000 },
  { label: '$100K-1M', min: 100_000, max: 1_000_000 },
  { label: '$1M-10M', min: 1_000_000, max: 10_000_000 },
  { label: '$10M and up', min: 10_000_000, max: Infinity },
];

export function bucketize(items: ReadonlyArray<{ value: number; weight?: number }>, specs: readonly BucketSpec[]): Bucket[] {
  const buckets: Bucket[] = specs.map((s) => ({ ...s, count: 0, weight: 0 }));
  for (const item of items) {
    const bucket = buckets.find((b) => item.value >= b.min && item.value < b.max);
    if (bucket) {
      bucket.count += 1;
      bucket.weight += item.weight ?? 0;
    }
  }
  return buckets;
}

export interface SettledPosition {
  address: string;
  name: string | null;
  symbol: string;
  isLong: boolean;
  leverage: number;
  marginUsd: number;
  notionalUsd: number;
  pnlUsd: number;
  openedAt: number;
  closedAt: number | null;
}

/** Union of leaderboard position rows across windows, deduplicated by wallet, market and open time. */
export function settledPositions(...windows: ReadonlyArray<ReadonlyArray<LeaderboardPositionRow>>): SettledPosition[] {
  const seen = new Set<string>();
  const out: SettledPosition[] = [];
  for (const rows of windows) {
    for (const r of rows) {
      const key = `${r.address.toLowerCase()}:${r.instrumentId}:${r.openedAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const marginUsd = wadToNumber(r.margin);
      out.push({
        address: r.address.toLowerCase(),
        name: r.leaderboardName,
        symbol: r.instrument,
        isLong: r.side === 'long',
        leverage: r.leverage,
        marginUsd,
        notionalUsd: marginUsd * r.leverage,
        pnlUsd: wadToNumber(r.pnl),
        openedAt: r.openedAt,
        closedAt: r.closedAt,
      });
    }
  }
  return out;
}

export interface PositionInsights {
  count: number;
  leverage: Bucket[];
  size: Bucket[];
  longCount: number;
  shortCount: number;
  longNotionalUsd: number;
  shortNotionalUsd: number;
  /** Long share of notional, 0..1, or null with no positions. */
  longShareByNotional: number | null;
  medianLeverage: number | null;
  medianNotionalUsd: number | null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function positionInsights(positions: readonly SettledPosition[]): PositionInsights {
  const longs = positions.filter((p) => p.isLong);
  const shorts = positions.filter((p) => !p.isLong);
  const longNotionalUsd = longs.reduce((s, p) => s + p.notionalUsd, 0);
  const shortNotionalUsd = shorts.reduce((s, p) => s + p.notionalUsd, 0);
  const total = longNotionalUsd + shortNotionalUsd;
  return {
    count: positions.length,
    leverage: bucketize(positions.map((p) => ({ value: p.leverage, weight: p.notionalUsd })), LEVERAGE_BUCKETS),
    size: bucketize(positions.map((p) => ({ value: p.notionalUsd, weight: p.notionalUsd })), SIZE_BUCKETS),
    longCount: longs.length,
    shortCount: shorts.length,
    longNotionalUsd,
    shortNotionalUsd,
    longShareByNotional: total > 0 ? longNotionalUsd / total : null,
    medianLeverage: median(positions.map((p) => p.leverage)),
    medianNotionalUsd: median(positions.map((p) => p.notionalUsd)),
  };
}

export interface TraderRow {
  rank: number;
  address: string;
  name: string | null;
  windowedPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  volumeUsd: number;
  openNotionalUsd: number;
  openPositions: number;
  balanceUsd: number;
  paper: number;
  lastActiveMs: number;
}

export function traderRows(accounts: readonly LeaderboardAccount[], rankOffset = 0): TraderRow[] {
  return accounts.map((a, i) => ({
    rank: a._leaderboardRank ?? rankOffset + i + 1,
    address: a.address.toLowerCase(),
    name: a.leaderboardName,
    windowedPnlUsd: wadToNumber(a.totalWindowedPnl),
    realizedPnlUsd: wadToNumber(a.realizedPnl),
    unrealizedPnlUsd: wadToNumber(a.currentUnrealizedPnl),
    volumeUsd: wadToNumber(a.totalVolume),
    openNotionalUsd: wadToNumber(a.currentOpenNotional),
    openPositions: a.currentOpenPositionCount,
    balanceUsd: wadToNumber(a.currentBalance),
    paper: wadToNumber(a.paperTotal),
    lastActiveMs: a.lastActiveTs * 1000,
  }));
}

export interface Concentration {
  accounts: number;
  totalOpenNotionalUsd: number;
  topNotionalUsd: number;
  /** Share of all open notional held by the sampled accounts, 0..1. */
  shareOfTotal: number | null;
  /** Cumulative share held by the top 1, 5, 10, 25 and N accounts of the sample, as a share of all open notional. */
  cumulative: Array<{ top: number; share: number }>;
  /** Average notional per open position across the sampled accounts, bucketed. */
  avgPositionSize: Bucket[];
  openPositions: number;
}

/** How concentrated live open notional is, from accounts sorted by open notional (largest first). */
export function concentration(rows: readonly TraderRow[], totalOpenNotionalUsd: number): Concentration {
  const sorted = [...rows].filter((r) => r.openNotionalUsd > 0).sort((a, b) => b.openNotionalUsd - a.openNotionalUsd);
  const topNotionalUsd = sorted.reduce((s, r) => s + r.openNotionalUsd, 0);
  const marks = [1, 5, 10, 25, sorted.length].filter((n, i, arr) => n > 0 && n <= sorted.length && arr.indexOf(n) === i);
  const cumulative = marks.map((top) => ({
    top,
    share: totalOpenNotionalUsd > 0 ? sorted.slice(0, top).reduce((s, r) => s + r.openNotionalUsd, 0) / totalOpenNotionalUsd : 0,
  }));
  return {
    accounts: sorted.length,
    totalOpenNotionalUsd,
    topNotionalUsd,
    shareOfTotal: totalOpenNotionalUsd > 0 ? topNotionalUsd / totalOpenNotionalUsd : null,
    cumulative,
    avgPositionSize: bucketize(
      sorted.filter((r) => r.openPositions > 0).map((r) => ({ value: r.openNotionalUsd / r.openPositions, weight: r.openNotionalUsd })),
      SIZE_BUCKETS,
    ),
    openPositions: sorted.reduce((s, r) => s + r.openPositions, 0),
  };
}

export const EXPLORER_WALLET_URL = 'https://papertrade-explorer.pages.dev/#/wallet/';

export function walletUrl(address: string): string {
  return `${EXPLORER_WALLET_URL}${encodeURIComponent(address.toLowerCase())}`;
}
