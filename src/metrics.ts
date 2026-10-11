import {
  PAPER_MINT_CURVE,
  estimateClose,
  impactParams,
  paperMintRate,
  priceFromRaw,
  priceToRaw,
  wadToNumber,
  type Candle,
  type MarketStats,
  type ProtocolHistory,
  type ProtocolSummary,
  type TradingState,
} from 'papertrade-sdk';
import { HOUSE_BOOK_COLUMNS, houseSeries, snapshotSeries } from './house.js';
import { cumulativeAt, deltaOver, historyColumn, mergePoints, windowOverWindow, type Point } from './transforms.js';
import type { DeltaPair, HouseResponse, KeepsExample, MarketMetrics, Metrics, Snapshot } from './types.js';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

export interface OnchainReads {
  paperSupplyRaw: bigint;
  totalStakedRaw: bigint;
  accRewardPerShareRaw: bigint;
}

export interface MetricsInputs {
  nowMs: number;
  summary: ProtocolSummary;
  marketStats: MarketStats;
  trading: TradingState;
  history1h: ProtocolHistory;
  history1d: ProtocolHistory;
  house: HouseResponse;
  /** Hyperliquid 1h candles keyed by symbol, oldest first. */
  candles: Record<string, Candle[]>;
  onchain: OnchainReads | null;
  snapshots: readonly Snapshot[];
}

export const KEEPS_EXAMPLE = { marginUsd: 100, leverage: 500, moveFraction: 0.001 } as const;
const ACC_PRECISION = 1e27;
/** Position of each column in the house `head` tuple [t, lp, pnl, q, bl, bs, el, es]. */
const HEAD_INDEX: Record<string, number> = { lp: 1, pnl: 2, q: 3, bl: 4, bs: 5, el: 6, es: 7 };

function pair(points: readonly Point[]): DeltaPair {
  return { h24: deltaOver(points, DAY), d7: deltaOver(points, WEEK) };
}

/** Keeps-example for one market: what `KEEPS_EXAMPLE` keeps after the deadband, impact haircut and 2% win fee. */
export function keepsExample(instrument: TradingState['instruments'][number], priceUsd: number): KeepsExample | null {
  if (!(priceUsd > 0)) return null;
  const { marginUsd, leverage, moveFraction } = KEEPS_EXAMPLE;
  const entryPriceRaw = priceToRaw(priceUsd, instrument.priceScale);
  const exitPriceRaw = entryPriceRaw + BigInt(Math.max(1, Math.round(Number(entryPriceRaw) * moveFraction)));
  const est = estimateClose({
    instrument,
    isLong: true,
    entryPriceRaw,
    exitPriceRaw,
    marginRaw: BigInt(marginUsd) * 10n ** 18n,
    leverage,
  });
  return {
    marginUsd,
    leverage,
    side: 'long',
    entryPriceUsd: priceFromRaw(entryPriceRaw, instrument.priceScale),
    exitPriceUsd: priceFromRaw(exitPriceRaw, instrument.priceScale),
    moveFraction: Number(exitPriceRaw - entryPriceRaw) / Number(entryPriceRaw),
    rawGainUsd: est.rawPnlUsd,
    afterImpactUsd: est.adjustedPnlUsd,
    winFeeUsd: est.winFeeUsd,
    netUsd: est.netPnlUsd,
    keptFraction: est.keptFraction,
  };
}

function changePct(closes: number[], barsBack: number): number | null {
  if (closes.length <= barsBack) return null;
  const now = closes[closes.length - 1];
  const then = closes[closes.length - 1 - barsBack];
  return then > 0 ? (now - then) / then : null;
}

function marketMetrics(inputs: MetricsInputs): MarketMetrics[] {
  const { trading, house, marketStats, candles } = inputs;
  const head = house.head;
  return trading.instruments.map((inst) => {
    const closes = (candles[inst.symbol] ?? []).map((c) => c.close);
    const priceUsd = closes.length ? closes[closes.length - 1] : null;
    const book = HOUSE_BOOK_COLUMNS[inst.id];
    const openLongUsd = book ? (head[HEAD_INDEX[book.long]] ?? 0) : 0;
    const openShortUsd = book ? (head[HEAD_INDEX[book.short]] ?? 0) : 0;
    const bookTotal = openLongUsd + openShortUsd;
    // OI and caps are base-asset quantities on chain. Price them at the latest close,
    // or at the price implied by the house open notional when candles are unavailable.
    const oiLongQty = wadToNumber(inst.longOiRaw);
    const oiShortQty = wadToNumber(inst.shortOiRaw);
    const oiQty = oiLongQty + oiShortQty;
    const unitPrice = priceUsd ?? (oiQty > 0 ? bookTotal / oiQty : 0);
    const capOiLongUsd = oiLongQty * unitPrice;
    const capOiShortUsd = oiShortQty * unitPrice;
    const longCapUsd = wadToNumber(inst.longCapRaw) * unitPrice;
    const shortCapUsd = wadToNumber(inst.shortCapRaw) * unitPrice;
    const params = impactParams(inst);
    return {
      id: inst.id,
      symbol: inst.symbol,
      priceUsd,
      change24hPct: changePct(closes, 24),
      change7dPct: changePct(closes, 168),
      sparkline: closes.slice(-168),
      volume24hUsd: wadToNumber(marketStats.markets[String(inst.id)]?.volume_24h ?? '0'),
      openLongUsd,
      openShortUsd,
      longShare: bookTotal > 0 ? openLongUsd / bookTotal : null,
      capOiLongUsd,
      capOiShortUsd,
      longCapUsd,
      shortCapUsd,
      longCapUtilization: longCapUsd > 0 ? capOiLongUsd / longCapUsd : null,
      shortCapUtilization: shortCapUsd > 0 ? capOiShortUsd / shortCapUsd : null,
      maxLeverage: inst.maxLeverage,
      maxPositionUsd: wadToNumber(inst.maxPositionNotionalRaw),
      active: inst.active,
      paused: inst.paused,
      closeOnly: inst.closeOnly,
      terminal: inst.terminal,
      retired: inst.retired,
      openable: inst.openable,
      impact: {
        baseRate: params.baseRate,
        rateMultiplier: params.rateMultiplier,
        positionMultiplier: params.positionMultiplier,
        referenceNotionalUsd: params.referenceNotionalUsd,
        bustBufferBps: Number(inst.bustBufferRaw) / 1e14,
      },
      keepsExample: priceUsd ? keepsExample(inst, priceUsd) : null,
    };
  });
}

/** The KPI document served by GET /api/metrics. Pure: every input is passed in. */
export function buildMetrics(inputs: MetricsInputs): Metrics {
  const { summary, history1h, history1d, house, trading, snapshots, onchain, nowMs } = inputs;
  const markets = marketMetrics(inputs);
  const tvl = historyColumn(history1h, history1d, 'tvl');
  const users = historyColumn(history1h, history1d, 'users');
  const trades = historyColumn(history1h, history1d, 'trades');
  const volume = historyColumn(history1h, history1d, 'volume');
  const liquidation = historyColumn(history1h, history1d, 'liquidation');
  const traderPnl = historyColumn(history1h, history1d, 'traderPnl');

  const lpSeries = mergePoints(houseSeries(house, '1d', 'lp'), houseSeries(house, '1h', 'lp'), snapshotSeries(snapshots, 'lp'));
  const openSeries = snapshotSeries(snapshots, 'open');

  const paperSupplyIndexer = wadToNumber(summary.paper.supply);
  const paperStakedIndexer = wadToNumber(summary.paper.staked);
  const supply = onchain ? wadToNumber(onchain.paperSupplyRaw) : paperSupplyIndexer;
  const staked = onchain ? wadToNumber(onchain.totalStakedRaw) : paperStakedIndexer;
  const trackedLpUsd = wadToNumber(summary.paper.trackedLp);
  const tailProgressUsd = wadToNumber(summary.paper.tailProgress);
  const mintRate = paperMintRate({ trackedLpUsd, tailProgressUsd });
  const S = PAPER_MINT_CURVE.tailDecayScaleUsd;
  const tailFor25 = S * (Math.sqrt(PAPER_MINT_CURVE.flatRate / 25) - 1);
  const accRaw = onchain?.accRewardPerShareRaw ?? trading.accRewardPerShareRaw;
  const totalVolume = wadToNumber(summary.activity.volume);
  const volume24hUsd = markets.reduce((s, m) => s + m.volume24hUsd, 0);
  const tradesNow = trades.length ? trades[trades.length - 1].value : null;
  const tradesAgo = trades.length ? cumulativeAt(trades, trades[trades.length - 1].time - DAY) : null;
  const lastOf = (points: Point[]) => (points.length ? points[points.length - 1].value : null);

  const openNotionalUsd = markets.reduce((s, m) => s + m.openLongUsd + m.openShortUsd, 0);

  const deltas: Metrics['deltas'] = {
    tvl: pair(tvl),
    lp: pair(lpSeries),
    traders: pair(users),
    openPositions: pair(openSeries),
    volume24h: windowOverWindow(volume, DAY),
    trades24h: tradesNow !== null && tradesAgo !== null ? tradesNow - tradesAgo : null,
  };

  return {
    generatedAt: new Date(nowMs).toISOString(),
    source: {
      protocolBlock: summary.source.block,
      protocolAt: summary.source.at,
      historyAsOf: history1h.source.asOfMs,
      onchain: onchain !== null,
      snapshots: snapshots.length,
    },
    protocol: {
      tvlUsd: wadToNumber(summary.balances.tvl),
      marginUsd: wadToNumber(summary.balances.margin),
      lpUsd: wadToNumber(summary.balances.lp),
      reserveUsd: wadToNumber(summary.balances.reserve),
      queueUsd: wadToNumber(summary.balances.queue),
      allTimeVolumeUsd: totalVolume,
      volume24hUsd,
      openPositions: summary.activity.open,
      traders: lastOf(users),
      trades: tradesNow,
      liquidatedVolumeUsd: lastOf(liquidation),
      traderPnlUsd: lastOf(traderPnl),
      lifetimeFeesUsd: wadToNumber(summary.fees.lifetime),
      pendingFeesUsd: wadToNumber(summary.fees.pending),
      openNotionalUsd,
      houseOpenPnlUsd: house.head[2] ?? 0,
    },
    deltas,
    markets,
    paper: {
      supply,
      supplySource: onchain ? 'onchain' : 'indexer',
      staked,
      stakedSource: onchain ? 'onchain' : 'indexer',
      stakedShare: supply > 0 ? staked / supply : 0,
      mintRate,
      mintRateMax: wadToNumber(summary.paper.rate),
      phase: trackedLpUsd < PAPER_MINT_CURVE.lpFlatThresholdUsd ? 'flat' : 'decay',
      trackedLpUsd,
      tailProgressUsd,
      curve: { ...PAPER_MINT_CURVE },
      tailProgressToRate25Usd: tailFor25 > tailProgressUsd ? tailFor25 - tailProgressUsd : null,
      reservePaper: wadToNumber(summary.paper.reserve),
    },
    staking: {
      totalStaked: staked,
      accRewardPerShareUsd: Number(accRaw) / ACC_PRECISION,
      accRewardPerShareRaw: accRaw.toString(),
      pendingRewardsUsd: wadToNumber(summary.paper.pendingRewards),
      rewardCapUsd: wadToNumber(summary.paper.cap),
      overflowAboveCapUsd: wadToNumber(summary.paper.excess),
      rewardsDistributedUsd: history1h.totals.rewardsRaw ? wadToNumber(history1h.totals.rewardsRaw) : null,
    },
  };
}
