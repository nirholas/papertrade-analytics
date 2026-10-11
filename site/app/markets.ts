import { estimateClose, impactScale, liquidationPriceRaw, priceFromRaw, priceToRaw, WIN_FEE, wadToNumber, type Instrument } from 'papertrade-sdk';
import { num, pct, price, signedPct, usd } from '../../src/format.js';
import type { MarketMetrics } from '../../src/types.js';
import { settings, sources } from './store.js';
import { errorState, html, render, skeleton, type Safe } from './util.js';

interface CalcState {
  margin: number;
  leverage: number;
  move: number;
  side: 'long' | 'short';
}

const calc = new Map<string, CalcState>();

function calcFor(m: MarketMetrics): CalcState {
  let c = calc.get(m.symbol);
  if (!c) {
    c = { margin: 100, leverage: Math.min(500, m.maxLeverage), move: 0.1, side: 'long' };
    calc.set(m.symbol, c);
  }
  return c;
}

function sparkline(values: number[]): Safe {
  if (values.length < 2) return html``;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 300;
  const h = 44;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 4 - ((v - min) / range) * (h - 8)).toFixed(1)}`).join(' ');
  return html`<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Seven day price trend"><polyline points="${points}"></polyline></svg>`;
}

function flags(m: MarketMetrics): Safe {
  const list: Array<[string, 'ok' | 'bad' | '']> = [];
  if (m.openable) list.push(['Open for trading', 'ok']);
  if (m.paused) list.push(['Paused', 'bad']);
  if (m.closeOnly) list.push(['Close only', 'bad']);
  if (m.terminal) list.push(['Terminal', 'bad']);
  if (m.retired) list.push(['Retired', 'bad']);
  if (!m.active && !m.retired) list.push(['Inactive', 'bad']);
  return html`<div class="flags">${list.map(([text, cls]) => html`<span class="flag ${cls}">${text}</span>`)}</div>`;
}

function changeText(value: number | null, label: string): Safe {
  if (value === null) return html`<span class="num">${label} n/a</span>`;
  return html`<span class="num ${value >= 0 ? 'pos' : 'neg'}">${label} ${signedPct(value, 2)}</span>`;
}

function impactDetails(m: MarketMetrics): Safe {
  const p = m.impact;
  const rows = [0.001, 0.01, 0.1].map((move) => ({ move, kept: impactScale(move, p) * (1 - WIN_FEE) }));
  return html`
    <details>
      <summary>How wins are priced (impact parameters)</summary>
      <p>Losses pay the raw price move. Wins are trimmed in three steps, so a tiny win keeps much less than a big one:</p>
      <ul>
        <li><b>Deadband.</b> The first 0.2 bps of favourable move is ignored.</li>
        <li><b>Impact haircut.</b> A base rate of ${pct(p.baseRate, 0)} is the most that is ever trimmed from a large win. Small moves are trimmed far harder, controlled by a rate multiplier of ${num(p.rateMultiplier, 0)}, a position multiplier of ${num(p.positionMultiplier, 1)} and a ${usd(p.referenceNotionalUsd)} reference notional.</li>
        <li><b>Win fee.</b> ${pct(WIN_FEE, 0)} of what is left.</li>
      </ul>
      <p>Share of the raw gain you keep, by size of the move (after deadband, haircut and fee):</p>
      <ul>${rows.map((r) => html`<li>A +${pct(r.move, r.move < 0.01 ? 1 : 0)} move keeps about <b class="num">${pct(r.kept, 1)}</b></li>`)}</ul>
      <p>Liquidation happens ${num(p.bustBufferBps, 2)} bps before the plain 1/leverage price. Liquidated positions lose the whole margin.</p>
    </details>`;
}

function calculator(m: MarketMetrics): Safe {
  const c = calcFor(m);
  return html`
    <div class="calc" data-calc="${m.symbol}">
      <div class="calc-title">What does a win actually keep?</div>
      <div class="calc-inputs">
        <label>Margin ($)<input type="number" inputmode="decimal" min="10" step="10" value="${c.margin}" data-field="margin" aria-label="${m.symbol} margin in dollars"></label>
        <label>Leverage (x)<input type="number" inputmode="numeric" min="1" max="${m.maxLeverage}" step="1" value="${c.leverage}" data-field="leverage" aria-label="${m.symbol} leverage"></label>
        <label>Price move (%)<input type="number" inputmode="decimal" step="0.05" value="${c.move}" data-field="move" aria-label="${m.symbol} price move in percent"></label>
        <label>Side<select data-field="side" aria-label="${m.symbol} side"><option value="long" ${c.side === 'long' ? 'selected' : ''}>Long</option><option value="short" ${c.side === 'short' ? 'selected' : ''}>Short</option></select></label>
      </div>
      <div class="calc-out" aria-live="polite" data-out></div>
    </div>`;
}

/** Fill the calculator output with the SDK's estimateClose for this market's live instrument parameters. */
export function updateCalculator(symbol: string): void {
  const root = document.querySelector<HTMLElement>(`[data-calc="${CSS.escape(symbol)}"]`);
  const out = root?.querySelector<HTMLElement>('[data-out]');
  const m = sources.metrics.data?.markets.find((x) => x.symbol === symbol);
  const trading = sources.trading.data;
  const inst: Instrument | undefined = trading?.instruments.find((i) => i.symbol === symbol);
  if (!root || !out || !m) return;
  const c = calcFor(m);
  if (!inst || !trading || m.priceUsd === null) {
    out.textContent = 'Live instrument parameters are not available right now.';
    return;
  }
  if (!(c.margin > 0) || !(c.leverage >= 1) || !Number.isFinite(c.move)) {
    out.textContent = 'Enter a margin, a leverage of at least 1 and a price move.';
    return;
  }
  const notional = c.margin * c.leverage;
  const marginRaw = BigInt(Math.round(c.margin * 1e6)) * 10n ** 12n;
  const entryRaw = priceToRaw(m.priceUsd, inst.priceScale);
  const delta = BigInt(Math.round(Number(entryRaw) * (c.move / 100)));
  const exitRaw = entryRaw + delta;
  const isLong = c.side === 'long';
  const est = estimateClose({ instrument: inst, isLong, entryPriceRaw: entryRaw, exitPriceRaw: exitRaw, marginRaw, leverage: Math.floor(c.leverage) });
  const bust = liquidationPriceRaw({ entryPriceRaw: entryRaw, leverage: Math.floor(c.leverage), isLong, bustBufferRaw: inst.bustBufferRaw });
  const warnings: string[] = [];
  if (c.leverage > m.maxLeverage) warnings.push(`Above the ${m.maxLeverage}x maximum.`);
  if (notional < wadToNumber(trading.minimumOpenNotionalRaw)) warnings.push(`Below the ${usd(wadToNumber(trading.minimumOpenNotionalRaw))} minimum notional.`);
  if (c.margin < wadToNumber(trading.minimumTradeSizeRaw)) warnings.push(`Below the ${usd(wadToNumber(trading.minimumTradeSizeRaw))} minimum margin.`);
  if (notional > m.maxPositionUsd) warnings.push(`Above the ${usd(m.maxPositionUsd)} maximum position.`);
  const win = est.rawPnlUsd > 0;
  const kept = win ? html` keeps <b class="num good">${usd(est.netPnlUsd, 2)}</b> of a <b class="num">${usd(est.rawPnlUsd, 2)}</b> raw gain (${pct(est.keptFraction, 1)}), after ${usd(est.rawPnlUsd - est.adjustedPnlUsd, 2)} impact and ${usd(est.winFeeUsd, 2)} fee` : est.liquidated ? html` is liquidated and loses <b class="num bad">${usd(c.margin, 2)}</b>, the whole margin` : html` loses <b class="num bad">${usd(-est.netPnlUsd, 2)}</b>`;
  render(
    out,
    html`<p>${usd(c.margin)} at ${num(c.leverage)}x ${c.side} (${usd(notional)} notional) entering at ${price(priceFromRaw(entryRaw, inst.priceScale))}, price ${signedPct(c.move / 100, 2)}:${kept}.</p><p class="calc-note">Liquidation price ${price(priceFromRaw(bust, inst.priceScale))}, ${pct(Math.abs(priceFromRaw(bust, inst.priceScale) - m.priceUsd) / m.priceUsd, 3)} from entry.${warnings.length ? ` ${warnings.join(' ')}` : ''}</p>`,
  );
}

export function setCalcField(symbol: string, field: string, value: string): void {
  const m = sources.metrics.data?.markets.find((x) => x.symbol === symbol);
  if (!m) return;
  const c = calcFor(m);
  if (field === 'side') c.side = value === 'short' ? 'short' : 'long';
  else if (field === 'margin' || field === 'leverage' || field === 'move') c[field] = Number(value);
  updateCalculator(symbol);
}

function marketCard(m: MarketMetrics): Safe {
  const selected = settings.market === m.symbol;
  const longShare = m.longShare;
  return html`
    <article class="market" data-selected="${selected}" aria-labelledby="mk-${m.symbol}">
      <div class="market-top">
        <div class="market-sym"><h3 id="mk-${m.symbol}">${m.symbol}-PERP</h3>${flags(m)}</div>
        <div class="market-price"><div class="big">${price(m.priceUsd)}</div><div>${changeText(m.change24hPct, '24h')} &middot; ${changeText(m.change7dPct, '7d')}</div></div>
      </div>
      ${sparkline(m.sparkline)}
      <dl class="stats">
        <div class="stat"><dt>24h volume</dt><dd>${usd(m.volume24hUsd)}</dd></div>
        <div class="stat"><dt>Max leverage</dt><dd>${num(m.maxLeverage)}x</dd></div>
        <div class="stat"><dt>Max position</dt><dd>${usd(m.maxPositionUsd)}</dd></div>
        <div class="stat"><dt>Open notional</dt><dd>${usd(m.openLongUsd + m.openShortUsd)}</dd></div>
      </dl>
      <div class="meter-label"><span>Long <b>${usd(m.openLongUsd)}</b></span><span>${longShare === null ? 'No open positions' : `${pct(longShare, 1)} long`}</span><span>Short <b>${usd(m.openShortUsd)}</b></span></div>
      <div class="skew" role="img" aria-label="${longShare === null ? 'No open positions' : `${pct(longShare, 1)} of open notional is long`}"><span class="l" data-w="${((longShare ?? 0.5) * 100).toFixed(2)}"></span><span class="s"></span></div>
      <div class="meter-label"><span>Long cap used <b>${pct(m.longCapUtilization, 2)}</b> of ${usd(m.longCapUsd)}</span></div>
      <div class="cap" role="img" aria-label="Long open interest cap utilization ${pct(m.longCapUtilization, 2)}"><span data-w="${((m.longCapUtilization ?? 0) * 100).toFixed(2)}"></span></div>
      <div class="meter-label"><span>Short cap used <b>${pct(m.shortCapUtilization, 2)}</b> of ${usd(m.shortCapUsd)}</span></div>
      <div class="cap" role="img" aria-label="Short open interest cap utilization ${pct(m.shortCapUtilization, 2)}"><span data-w="${((m.shortCapUtilization ?? 0) * 100).toFixed(2)}"></span></div>
      ${m.keepsExample ? html`<p class="calc-note">A $${m.keepsExample.marginUsd} ${m.keepsExample.leverage}x long that wins +${pct(m.keepsExample.moveFraction, 1)} makes ${usd(m.keepsExample.rawGainUsd, 2)} on paper but keeps <b class="num">${usd(m.keepsExample.netUsd, 2)}</b> (${pct(m.keepsExample.keptFraction, 0)}).</p>` : ''}
      ${calculator(m)}
      ${impactDetails(m)}
    </article>`;
}

export function renderMarkets(root: HTMLElement): void {
  const s = sources.metrics;
  if (!s.data) {
    if (s.error && !s.loading) render(root, errorState('Could not load markets', s.error, 'metrics'));
    else render(root, html`${[0, 1].map(() => html`<div class="market">${skeleton('line')}${skeleton('tall')}</div>`)}`);
    root.setAttribute('aria-busy', String(!s.error));
    return;
  }
  root.setAttribute('aria-busy', 'false');
  // Keep an input focused while the 30s refresh re-renders the cards.
  const active = document.activeElement instanceof HTMLElement && root.contains(document.activeElement) ? document.activeElement : null;
  if (active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLButtonElement || active instanceof HTMLElement && active.tagName === 'SUMMARY') {
    s.data.markets.forEach((m) => {
      const card = root.querySelector(`[data-calc="${CSS.escape(m.symbol)}"]`);
      if (card && card.contains(active)) return;
    });
  }
  const focusId = active?.getAttribute('aria-label') ?? null;
  const openDetails = [...root.querySelectorAll('details')].map((d) => d.open);
  render(root, html`${s.data.markets.map(marketCard)}`);
  root.querySelectorAll('details').forEach((d, i) => {
    d.open = openDetails[i] ?? false;
  });
  s.data.markets.forEach((m) => updateCalculator(m.symbol));
  if (focusId) root.querySelector<HTMLElement>(`[aria-label="${CSS.escape(focusId)}"]`)?.focus();
}
