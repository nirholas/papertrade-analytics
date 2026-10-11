import { compactNum, num, pct, signedPct, span, usd } from '../../src/format.js';
import type { Delta } from '../../src/transforms.js';
import type { Metrics } from '../../src/types.js';
import { sources } from './store.js';
import { errorState, html, render, skeleton, type Safe } from './util.js';

/** "24h +3.2%" when the series reaches back that far, "+3.2% in 7h" when it does not, nothing claimed when it is empty. */
function chip(label: string, d: Delta | null, kind: 'pct' | 'abs' = 'pct'): Safe {
  if (!d) return html`<span class="chip" title="Not enough history yet">${label} n/a</span>`;
  const value = kind === 'abs' || d.pct === null ? d.abs : d.pct;
  const text = kind === 'abs' || d.pct === null ? `${d.abs > 0 ? '+' : ''}${compactNum(d.abs)}` : signedPct(value, Math.abs(value) < 0.1 ? 2 : 1);
  const cls = d.abs > 0 ? 'up' : d.abs < 0 ? 'down' : '';
  const when = d.partial ? `in ${span(d.spanMs)}` : label;
  const title = d.partial ? `History only reaches back ${span(d.spanMs)}, so this is the change since then.` : `Change over ${label}`;
  return html`<span class="chip ${cls}" title="${title}">${when} ${text}</span>`;
}

function card(label: string, value: string, sub: Safe | string, chips: Safe[] = []): Safe {
  return html`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div>${chips.length ? html`<div class="chips">${chips}</div>` : ''}</div>`;
}

function cards(m: Metrics): Safe[] {
  const p = m.protocol;
  const d = m.deltas;
  const [btc, eth] = [m.markets.find((x) => x.symbol === 'BTC'), m.markets.find((x) => x.symbol === 'ETH')];
  const dedupe = (a: Delta | null, b: Delta | null) => (a && b && a.fromMs === b.fromMs ? [chip('24h', a)] : [chip('24h', a), chip('7d', b)]);
  return [
    card('TVL', usd(p.tvlUsd), 'Margin + LP + reserve', dedupe(d.tvl.h24, d.tvl.d7)),
    card('Margin', usd(p.marginUsd), `${pct(p.tvlUsd ? p.marginUsd / p.tvlUsd : null, 0)} of TVL held as trader margin`),
    card('LP equity', usd(p.lpUsd), `House open PnL ${usd(p.houseOpenPnlUsd)}`, dedupe(d.lp.h24, d.lp.d7)),
    card('Reserve', usd(p.reserveUsd), p.reserveUsd === 0 ? 'Nothing held in reserve' : 'Protocol reserve'),
    card('Withdrawal queue', usd(p.queueUsd), p.queueUsd === 0 ? 'Queue is empty' : 'Waiting to withdraw'),
    card('All-time volume', usd(p.allTimeVolumeUsd), `${usd(p.lifetimeFeesUsd)} lifetime fees`),
    card(
      '24h volume',
      usd(p.volume24hUsd),
      html`BTC <b class="num">${usd(btc?.volume24hUsd)}</b> &middot; ETH <b class="num">${usd(eth?.volume24hUsd)}</b>`,
      d.volume24h ? [chip('vs prior 24h', d.volume24h)] : [],
    ),
    card('Open positions', num(p.openPositions), `${usd(p.openNotionalUsd)} open notional`, dedupe(d.openPositions.h24, d.openPositions.d7)),
    card('Traders', num(p.traders), `${num(p.trades)} trades, ${usd(p.liquidatedVolumeUsd)} liquidated`, dedupe(d.traders.h24, d.traders.d7)),
    card('PAPER supply', compactNum(m.paper.supply), m.paper.supplySource === 'onchain' ? 'Read from HyperEVM' : 'From the indexer (chain read unavailable)'),
    card('PAPER mint rate', `${num(m.paper.mintRate, 1)} / $1`, m.paper.phase === 'flat' ? 'Flat: LP is under the $2M threshold' : `Decaying from ${num(m.paper.mintRateMax)} along the curve`),
    card('PAPER staked', compactNum(m.staking.totalStaked), `${pct(m.paper.stakedShare)} of supply`),
  ];
}

export function renderKpis(root: HTMLElement): void {
  const s = sources.metrics;
  if (!s.data) {
    if (s.error && !s.loading) render(root, errorState('Could not load the headline numbers', s.error, 'metrics'));
    else render(root, html`${Array.from({ length: 12 }, () => html`<div class="kpi">${skeleton('small')}${skeleton('line')}${skeleton('small')}</div>`)}`);
    root.setAttribute('aria-busy', String(!s.error));
    return;
  }
  root.setAttribute('aria-busy', 'false');
  render(root, html`${cards(s.data)}`);
}
