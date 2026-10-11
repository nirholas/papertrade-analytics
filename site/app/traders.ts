import { compactNum, num, pct, shortAddress, usd, ago } from '../../src/format.js';
import { concentration, positionInsights, settledPositions, traderRows, walletUrl, type Bucket } from '../../src/insights.js';
import { LB_SORTS, settings, sources } from './store.js';
import { emptyState, errorState, html, render, skeleton, type Safe } from './util.js';

const WINDOWS = ['24h', '7d', '30d', 'all'] as const;
const PAGE_SIZE = 25;

function histogram(buckets: readonly Bucket[], valueLabel: (b: Bucket) => string): Safe {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return html`${buckets.map((b) => html`<div class="hist-row"><span>${b.label}</span><div class="bar"><span data-w="${((b.count / max) * 100).toFixed(1)}"></span></div><b>${valueLabel(b)}</b></div>`)}`;
}

function pnlCell(value: number): Safe {
  return html`<td class="r num ${value > 0 ? 'pos' : value < 0 ? 'neg' : ''}">${value > 0 ? '+' : ''}${usd(value)}</td>`;
}

function tableSection(): Safe {
  const b = sources.board;
  const tabs = html`
    <div class="trader-tools">
      <div class="seg" role="radiogroup" aria-label="Leaderboard window">${WINDOWS.map((w) => html`<button type="button" role="radio" data-window="${w}" aria-checked="${settings.window === w}">${w === 'all' ? 'All time' : w}</button>`)}</div>
      <label class="hint">Sort by <select id="lb-sort" aria-label="Sort leaderboard">${LB_SORTS.map((s) => html`<option value="${s.key}" ${settings.sort === s.key ? 'selected' : ''}>${s.label}</option>`)}</select></label>
    </div>`;
  if (!b.data) {
    if (b.error && !b.loading) return html`${tabs}${errorState('Could not load the leaderboard', b.error, 'board')}`;
    return html`${tabs}<div class="table-wrap">${[0, 1, 2, 3, 4, 5].map(() => html`<div class="skeleton-row">${skeleton('line')}</div>`)}</div>`;
  }
  const rows = traderRows(b.data.accounts, b.data.page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(b.data.count / PAGE_SIZE));
  if (!rows.length) return html`${tabs}${emptyState('No traders in this window', 'Nobody has traded in this window yet. Try a longer one.')}`;
  return html`
    ${tabs}
    <div class="table-wrap" tabindex="0" role="region" aria-label="Top traders, scroll sideways on small screens">
      <table class="data">
        <thead><tr><th scope="col">#</th><th scope="col">Trader</th><th scope="col" class="r">PnL (${settings.window === 'all' ? 'all time' : settings.window})</th><th scope="col" class="r">Volume</th><th scope="col" class="r">Open notional</th><th scope="col" class="r">Open</th><th scope="col" class="r">PAPER</th><th scope="col" class="r">Last active</th></tr></thead>
        <tbody>${rows.map(
          (r) => html`<tr>
            <td class="num">${r.rank}</td>
            <td><a class="addr" href="${walletUrl(r.address)}" target="_blank" rel="noopener noreferrer" title="${r.address}">${r.name ? `${r.name} ` : ''}${shortAddress(r.address)}</a></td>
            ${pnlCell(r.windowedPnlUsd)}
            <td class="r num">${usd(r.volumeUsd, 0)}</td>
            <td class="r num">${usd(r.openNotionalUsd, 0)}</td>
            <td class="r num">${r.openPositions}</td>
            <td class="r num">${compactNum(r.paper)}</td>
            <td class="r">${r.lastActiveMs ? ago(Date.now() - r.lastActiveMs) : 'n/a'}</td>
          </tr>`,
        )}</tbody>
      </table>
    </div>
    <div class="pager"><span>${num(b.data.count)} traders. Page ${b.data.page + 1} of ${pages}</span>
      <button type="button" class="btn small" data-page="${b.data.page - 1}" ${b.data.page === 0 ? 'disabled' : ''}>Previous</button>
      <button type="button" class="btn small" data-page="${b.data.page + 1}" ${b.data.page + 1 >= pages ? 'disabled' : ''}>Next</button>
    </div>`;
}

function distributions(): Safe {
  const ins = sources.insights;
  if (!ins.data) {
    if (ins.error && !ins.loading) return errorState('Could not load position distributions', ins.error, 'insights');
    return html`<div class="dist-grid">${[0, 1, 2].map(() => html`<div class="dist">${skeleton('line')}${skeleton('tall')}</div>`)}</div>`;
  }
  const settled = settledPositions(ins.data.positions);
  const pos = positionInsights(settled);
  const metrics = sources.metrics.data;
  const rows = traderRows(ins.data.topByOpenNotional);
  const conc = concentration(rows, metrics?.protocol.openNotionalUsd ?? 0);
  const book = metrics ? metrics.markets.reduce((a, m) => ({ l: a.l + m.openLongUsd, s: a.s + m.openShortUsd }), { l: 0, s: 0 }) : null;
  const bookShare = book && book.l + book.s > 0 ? book.l / (book.l + book.s) : null;
  const sample = pos.count
    ? `${num(pos.count)} settled top positions across 24h, 7d, 30d and all-time boards. Median ${num(pos.medianLeverage, 0)}x, ${usd(pos.medianNotionalUsd, 0)} notional.`
    : 'No settled positions on the boards yet.';
  return html`
    <div class="dist-grid">
      <div class="dist"><h3>Leverage used</h3><p class="hint">${sample}</p>${pos.count ? histogram(pos.leverage, (b) => `${num(b.count)}`) : emptyState('Nothing to chart', 'No settled positions yet.')}</div>
      <div class="dist"><h3>Position size</h3><p class="hint">Notional of the same settled positions.</p>${pos.count ? histogram(pos.size, (b) => `${num(b.count)}`) : emptyState('Nothing to chart', 'No settled positions yet.')}</div>
      <div class="dist"><h3>Long vs short</h3>
        <p class="hint">Open book now: ${bookShare === null ? 'no open positions' : `${pct(bookShare, 1)} long by notional`}. Settled leaderboard positions (the biggest wins, so they skew toward whichever side has been winning): ${pos.longShareByNotional === null ? 'n/a' : `${pct(pos.longShareByNotional, 1)} long by notional, ${num(pos.longCount)} long and ${num(pos.shortCount)} short`}.</p>
        <div class="meter-label"><span>Long ${usd(book?.l ?? 0, 0)}</span><span>Short ${usd(book?.s ?? 0, 0)}</span></div>
        <div class="skew" role="img" aria-label="Open book long share ${pct(bookShare, 1)}"><span class="l" data-w="${((bookShare ?? 0.5) * 100).toFixed(2)}"></span><span class="s"></span></div>
        <div class="meter-label"><span>Settled long ${usd(pos.longNotionalUsd, 0)}</span><span>Settled short ${usd(pos.shortNotionalUsd, 0)}</span></div>
        <div class="skew" role="img" aria-label="Settled positions long share ${pct(pos.longShareByNotional, 1)}"><span class="l" data-w="${((pos.longShareByNotional ?? 0.5) * 100).toFixed(2)}"></span><span class="s"></span></div>
      </div>
      <div class="dist"><h3>Who holds the open interest</h3>
        <p class="hint">Share of all open notional held by the biggest accounts (top ${num(conc.accounts)} sampled${conc.shareOfTotal === null ? '' : `, ${pct(conc.shareOfTotal, 0)} of the total`}).</p>
        ${conc.cumulative.length ? conc.cumulative.map((c) => html`<div class="hist-row"><span>Top ${num(c.top)}</span><div class="bar"><span data-w="${(c.share * 100).toFixed(1)}"></span></div><b>${pct(c.share, 0)}</b></div>`) : emptyState('No open positions', 'Nobody holds an open position right now.')}
      </div>
      <div class="dist"><h3>Average open position</h3><p class="hint">Open notional per position, by account (${num(conc.openPositions)} open positions in the sample).</p>${conc.accounts ? histogram(conc.avgPositionSize, (b) => `${num(b.count)}`) : emptyState('No open positions', 'Nothing is open right now.')}</div>
    </div>`;
}

export function renderTraders(root: HTMLElement): void {
  const busy = (sources.board.loading && !sources.board.data) || (sources.insights.loading && !sources.insights.data);
  root.setAttribute('aria-busy', String(busy));
  const focused = document.activeElement;
  const focusSort = focused instanceof HTMLSelectElement && focused.id === 'lb-sort';
  render(root, html`${tableSection()}${distributions()}`);
  if (focusSort) root.querySelector<HTMLElement>('#lb-sort')?.focus();
}
