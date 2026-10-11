import { compactNum, num, price, usd } from '../../src/format.js';
import { sources } from './store.js';
import { html, render, skeleton } from './util.js';

function stat(label: string, value: string, sub: string) {
  return html`<div class="hero-stat"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

/** The hero's live strip: four headline numbers and the two market prices, from the same /api/metrics read as the KPI grid. */
export function renderHero(root: HTMLElement): void {
  const s = sources.metrics;
  if (!s.data) {
    if (s.error && !s.loading) {
      render(root, html`<div class="hero-foot" role="status">Live numbers are unavailable right now (${s.error}). The dashboard below retries automatically.</div>`);
      root.setAttribute('aria-busy', 'false');
    } else {
      render(root, html`${Array.from({ length: 4 }, () => html`<div class="hero-stat">${skeleton('small')}${skeleton('line')}${skeleton('small')}</div>`)}`);
      root.setAttribute('aria-busy', 'true');
    }
    return;
  }
  const m = s.data;
  const p = m.protocol;
  const prices = m.markets.map((x) => html`<span>${x.symbol} <b>${price(x.priceUsd)}</b></span>`);
  root.setAttribute('aria-busy', 'false');
  render(
    root,
    html`${stat('Total value locked', usd(p.tvlUsd), `${usd(p.lpUsd)} LP equity`)}${stat('24h volume', usd(p.volume24hUsd), `${usd(p.allTimeVolumeUsd)} all time`)}${stat('Open notional', usd(p.openNotionalUsd), `${num(p.openPositions)} open positions`)}${stat('Traders', num(p.traders), `${compactNum(m.paper.supply)} PAPER in supply`)}<div class="hero-foot">${prices}<span>Live from the Papertrade API and HyperEVM</span></div>`,
  );
}
