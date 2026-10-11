import { houseChartSeries } from '../../src/house.js';
import { combineSeries, diffSeries, historyColumn, type Point } from '../../src/transforms.js';
import { compactNum, num, span, usd } from '../../src/format.js';
import { typicalStep } from '../../src/transforms.js';
import { ChartCard, sliceRange, type ChartUpdate } from './charts.js';
import { settings, sources, load, type SourceName } from './store.js';
import { errorState, skeleton } from './util.js';

type CardId = 'tvl' | 'volume' | 'lp' | 'oi' | 'activity' | 'pnl';

const volumeTools = `
  <div class="seg" role="radiogroup" aria-label="Volume view">
    <button type="button" role="radio" data-volume="total" aria-checked="false">Total</button>
    <button type="button" role="radio" data-volume="split" aria-checked="false">BTC / ETH</button>
    <button type="button" role="radio" data-volume="cumulative" aria-checked="false">Cumulative</button>
  </div>`;

export const cards = new Map<CardId, ChartCard>();

export function initCharts(grid: HTMLElement): void {
  const make = (id: CardId, csvName: string, title: string, subtitle: string, toolsHtml?: string) => {
    const card = new ChartCard(grid, { csvName }, { title, subtitle, toolsHtml });
    card.root.dataset.chart = id;
    card.setCsvSuffix(() => `-${settings.range}`);
    card.showOverlay(skeleton('tall').value);
    cards.set(id, card);
  };
  make('tvl', 'papertrade-tvl', 'Total value locked', 'Margin, LP equity and reserve held by the protocol, in USD.');
  make('volume', 'papertrade-volume', 'Trading volume', 'Notional traded per history bucket, or running total.', volumeTools);
  make('lp', 'papertrade-lp', 'LP equity', 'Liquidity providers\' equity in the house book, in USD.');
  make('oi', 'papertrade-open-interest', 'Open interest', 'Open notional the house carries on each side.');
  make('activity', 'papertrade-activity', 'Traders and trades', 'Cumulative unique traders (right axis) and trades per bucket (left axis).');
  make('pnl', 'papertrade-pnl', 'Trader PnL and staker revenue', 'Cumulative trader PnL (right axis, negative means the house is winning) and PAPER staker revenue per bucket (left axis).');
}

const fmtUsd = (v: number) => usd(v);
const fmtCount = (v: number) => num(v, 0);

function resolution(points: readonly Point[]): string {
  const step = typicalStep(points);
  return step ? `${span(step)} buckets` : 'single bucket';
}

function historyNote(points: readonly Point[], widened: boolean): string {
  return `${resolution(points)} from the protocol history.${widened ? ' Range widened to the latest buckets because history is coarser than the range.' : ''}`;
}

function failure(name: SourceName, retry: string): string | null {
  const s = sources[name];
  if (s.data) return null;
  if (s.loading || (!s.error && !s.at)) return skeleton('tall').value;
  return errorState('Could not load this chart', s.error ?? 'No data returned.', retry).value;
}

function show(card: ChartCard, name: SourceName): boolean {
  const overlay = failure(name, name);
  if (overlay) {
    card.showOverlay(overlay);
    return false;
  }
  card.hideOverlay();
  return true;
}

function emptyOverlay(card: ChartCard, message: string): void {
  card.showOverlay(`<div class="state"><div class="state-title">Nothing to plot yet</div><p>${message}</p></div>`);
}

function updateHistoryCharts(): void {
  const data = sources.history.data;
  const now = Date.now();
  const { range, market, volume } = settings;
  const col = (c: Parameters<typeof historyColumn>[2]) => (data ? historyColumn(data.h1, data.d1, c) : []);

  const tvl = cards.get('tvl')!;
  tvl.setScale(settings.scale, true);
  if (show(tvl, 'history')) {
    const s = sliceRange(col('tvl'), range, now);
    if (!s.points.length) emptyOverlay(tvl, 'The protocol has not reported TVL yet.');
    else tvl.update({ series: [{ id: 'tvl', kind: 'area', color: '--accent', points: s.points, format: fmtUsd }], rows: [{ label: 'TVL', color: '--accent', points: s.points, format: fmtUsd }], footnote: historyNote(s.points, s.widened) });
  }

  const vol = cards.get('volume')!;
  vol.setScale(settings.scale, volume === 'cumulative');
  if (show(vol, 'history')) {
    const total = col('volume');
    const btc = col('volumeBtc');
    const eth = col('volumeEth');
    const one = market === 'BTC' ? btc : market === 'ETH' ? eth : total;
    const oneLabel = market === 'all' ? 'Volume' : market;
    const oneColor = market === 'ETH' ? '--eth' : market === 'BTC' ? '--btc' : '--accent';
    let update: ChartUpdate | null = null;
    if (volume === 'cumulative') {
      const s = sliceRange(one, range, now);
      update = { series: [{ id: 'cum', kind: 'line', color: oneColor, points: s.points, format: fmtUsd }], rows: [{ label: `${oneLabel} (cumulative)`, color: oneColor, points: s.points, format: fmtUsd }], footnote: `All-time total, ${historyNote(s.points, s.widened)}` };
    } else if (volume === 'split' && market === 'all') {
      const b = sliceRange(diffSeries(btc), range, now);
      const e = sliceRange(diffSeries(eth), range, now);
      const stacked = combineSeries(e.points, b.points, (x, y) => x + y);
      update = {
        series: [
          { id: 'stack', kind: 'hist', color: '--eth', points: stacked, format: fmtUsd },
          { id: 'btc', kind: 'hist', color: '--btc', points: b.points, format: fmtUsd },
        ],
        rows: [
          { label: 'BTC', color: '--btc', points: b.points, format: fmtUsd },
          { label: 'ETH', color: '--eth', points: e.points, format: fmtUsd },
        ],
        footnote: `Stacked, BTC at the bottom. ${historyNote(b.points, b.widened)}`,
      };
    } else {
      const s = sliceRange(diffSeries(one), range, now);
      update = { series: [{ id: 'bars', kind: 'hist', color: oneColor, points: s.points, format: fmtUsd }], rows: [{ label: `${oneLabel} per bucket`, color: oneColor, points: s.points, format: fmtUsd }], footnote: `Notional traded in each bucket. ${historyNote(s.points, s.widened)}` };
    }
    if (!update.rows.some((r) => r.points.length)) emptyOverlay(vol, 'No trades in this range yet.');
    else vol.update(update);
  }

  const act = cards.get('activity')!;
  act.setScale('linear', false);
  if (show(act, 'history')) {
    const u = sliceRange(col('users'), range, now);
    const t = sliceRange(diffSeries(col('trades')), range, now);
    if (!u.points.length && !t.points.length) emptyOverlay(act, 'No trading activity yet.');
    else {
      act.update({
        series: [
          { id: 'trades', kind: 'hist', color: '--muted', left: true, points: t.points, format: fmtCount },
          { id: 'users', kind: 'line', color: '--accent', points: u.points, format: fmtCount },
        ],
        rows: [
          { label: 'Traders', color: '--accent', points: u.points, format: fmtCount },
          { label: 'Trades per bucket', color: '--muted', points: t.points, format: fmtCount },
        ],
        footnote: historyNote(u.points, u.widened),
      });
    }
  }

  const pnl = cards.get('pnl')!;
  pnl.setScale('linear', false);
  if (show(pnl, 'history')) {
    const p = sliceRange(col('traderPnl'), range, now);
    const r = sliceRange(col('paperRevenue'), range, now);
    if (!p.points.length && !r.points.length) emptyOverlay(pnl, 'No settled trades yet.');
    else {
      pnl.update({
        series: [
          { id: 'rev', kind: 'hist', color: '--long', left: true, points: r.points, format: fmtUsd },
          { id: 'pnl', kind: 'line', color: '--short', points: p.points, format: fmtUsd },
        ],
        rows: [
          { label: 'Trader PnL', color: '--short', points: p.points, format: fmtUsd },
          { label: 'Staker revenue per bucket', color: '--long', points: r.points, format: fmtUsd },
        ],
        footnote: historyNote(p.points, p.widened),
      });
    }
  }
}

function houseNote(source: string, count: number): string {
  if (source === 'recorded') return `${compactNum(count)} samples recorded every 5 minutes by /api/snapshots.`;
  return `Protocol ${source} tier. The protocol keeps only its latest few buckets, so this grows once snapshot recording is enabled (see the README).`;
}

function updateHouseCharts(): void {
  const house = sources.house.data;
  const snaps = sources.snapshots.data ?? [];
  const now = Date.now();
  const { range, market } = settings;

  const lp = cards.get('lp')!;
  lp.setScale(settings.scale, true);
  if (show(lp, 'house') && house) {
    const r = houseChartSeries({ house, snapshots: snaps, range, column: 'lp', snapshotKey: 'lp', nowMs: now });
    if (!r.points.length) emptyOverlay(lp, 'The house book has no history yet.');
    else lp.update({ series: [{ id: 'lp', kind: 'area', color: '--long', points: r.points, format: fmtUsd }], rows: [{ label: 'LP equity', color: '--long', points: r.points, format: fmtUsd }], footnote: houseNote(r.source, r.points.length) });
  }

  const oi = cards.get('oi')!;
  oi.setScale(settings.scale, true);
  if (show(oi, 'house') && house) {
    const side = (column: 'bl' | 'bs' | 'el' | 'es', key: 'btcLong' | 'btcShort' | 'ethLong' | 'ethShort') => houseChartSeries({ house, snapshots: snaps, range, column, snapshotKey: key, nowMs: now });
    const bl = side('bl', 'btcLong');
    const bs = side('bs', 'btcShort');
    const el = side('el', 'ethLong');
    const es = side('es', 'ethShort');
    const long = market === 'BTC' ? bl.points : market === 'ETH' ? el.points : combineSeries(bl.points, el.points, (a, b) => a + b);
    const short = market === 'BTC' ? bs.points : market === 'ETH' ? es.points : combineSeries(bs.points, es.points, (a, b) => a + b);
    const label = market === 'all' ? 'all markets' : market;
    if (!long.length && !short.length) emptyOverlay(oi, 'The house book has no history yet.');
    else {
      oi.update({
        series: [
          { id: 'long', kind: 'line', color: '--long', points: long, format: fmtUsd },
          { id: 'short', kind: 'line', color: '--short', points: short, format: fmtUsd },
        ],
        rows: [
          { label: `Long (${label})`, color: '--long', points: long, format: fmtUsd },
          { label: `Short (${label})`, color: '--short', points: short, format: fmtUsd },
        ],
        footnote: houseNote(bl.source, long.length),
      });
    }
  }
}

export function updateCharts(changed?: SourceName): void {
  if (!changed || changed === 'history') updateHistoryCharts();
  if (!changed || changed === 'house' || changed === 'snapshots') updateHouseCharts();
}

export async function retryChart(name: SourceName): Promise<void> {
  await load(name);
}
