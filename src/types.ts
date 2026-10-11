import type { Delta } from './transforms.js';

/** One entry per market in /api/metrics. */
export interface MarketMetrics {
  id: number;
  symbol: string;
  /** Latest Hyperliquid 1h candle close (the underlying Papertrade prices against). */
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  /** Last 7 days of Hyperliquid 1h closes, newest last. */
  sparkline: number[];
  volume24hUsd: number;
  /** Open long and short notional from the house book. */
  openLongUsd: number;
  openShortUsd: number;
  /** Long share of open notional, 0..1. */
  longShare: number | null;
  /** Open interest the protocol counts against each side's cap, and the caps, in USD at the mark (on chain both are base-asset quantities). */
  capOiLongUsd: number;
  capOiShortUsd: number;
  longCapUsd: number;
  shortCapUsd: number;
  longCapUtilization: number | null;
  shortCapUtilization: number | null;
  maxLeverage: number;
  maxPositionUsd: number;
  active: boolean;
  paused: boolean;
  closeOnly: boolean;
  terminal: boolean;
  retired: boolean;
  openable: boolean;
  impact: {
    baseRate: number;
    rateMultiplier: number;
    positionMultiplier: number;
    referenceNotionalUsd: number;
    bustBufferBps: number;
  };
  /** What a $100, 500x long that wins +0.1% keeps, from the SDK's estimateClose. */
  keepsExample: KeepsExample | null;
}

export interface KeepsExample {
  marginUsd: number;
  leverage: number;
  side: 'long';
  entryPriceUsd: number;
  exitPriceUsd: number;
  moveFraction: number;
  rawGainUsd: number;
  afterImpactUsd: number;
  winFeeUsd: number;
  netUsd: number;
  keptFraction: number;
}

export interface Metrics {
  generatedAt: string;
  source: { protocolBlock: string; protocolAt: number; historyAsOf: number; onchain: boolean; snapshots: number };
  protocol: {
    tvlUsd: number;
    marginUsd: number;
    lpUsd: number;
    reserveUsd: number;
    queueUsd: number;
    allTimeVolumeUsd: number;
    volume24hUsd: number;
    openPositions: number;
    traders: number | null;
    trades: number | null;
    liquidatedVolumeUsd: number | null;
    traderPnlUsd: number | null;
    lifetimeFeesUsd: number;
    pendingFeesUsd: number;
    openNotionalUsd: number;
    houseOpenPnlUsd: number;
  };
  deltas: {
    tvl: DeltaPair;
    lp: DeltaPair;
    traders: DeltaPair;
    openPositions: DeltaPair;
    /** Last 24h volume against the 24h before it. */
    volume24h: Delta | null;
    trades24h: number | null;
  };
  markets: MarketMetrics[];
  paper: {
    supply: number;
    supplySource: 'onchain' | 'indexer';
    staked: number;
    stakedSource: 'onchain' | 'indexer';
    stakedShare: number;
    mintRate: number;
    mintRateMax: number;
    phase: 'flat' | 'decay';
    trackedLpUsd: number;
    tailProgressUsd: number;
    curve: { flatRate: number; lpFlatThresholdUsd: number; tailDecayScaleUsd: number };
    /** Tail progress still needed for the mint rate to fall to 25 PAPER per $1. */
    tailProgressToRate25Usd: number | null;
    reservePaper: number;
  };
  staking: {
    totalStaked: number;
    /** Cumulative USDC per staked PAPER (accRewardPerShare / 1e27). */
    accRewardPerShareUsd: number;
    accRewardPerShareRaw: string;
    pendingRewardsUsd: number;
    rewardCapUsd: number;
    overflowAboveCapUsd: number;
    rewardsDistributedUsd: number | null;
  };
}

export interface DeltaPair {
  h24: Delta | null;
  d7: Delta | null;
}

/** One recorded sample of the house book. Stored in KV by /api/metrics when a SNAPSHOTS namespace is bound. */
export interface Snapshot {
  t: number;
  tvl: number;
  margin: number;
  lp: number;
  pnl: number;
  open: number;
  btcLong: number;
  btcShort: number;
  ethLong: number;
  ethShort: number;
}

/** Shape of GET /state/house/current. The SDK types `heads` as number[]; the live response is columnar. */
export interface HouseResponse {
  ok: boolean;
  sourceAsOfMs: number;
  /** [t, lp, pnl, queue, btcLong, btcShort, ethLong, ethShort] */
  head: number[];
  heads: Record<string, HouseTier>;
}

export interface HouseTier {
  baseTimeMs: number;
  timeOffsetsMs: number[];
  columns: Record<HouseColumn, number[]>;
  gapIndices?: number[];
}

export type HouseColumn = 'lp' | 'pnl' | 'q' | 'bl' | 'bs' | 'el' | 'es';
