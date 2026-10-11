import { paperMintRate } from 'papertrade-sdk';
import { toCsv } from '../../src/csv.js';
import { compactNum, num, pct, usd } from '../../src/format.js';
import type { Metrics } from '../../src/types.js';
import { ChartCard } from './charts.js';
import { sources } from './store.js';
import { errorState, html, render, skeleton, type Safe } from './util.js';

let curveCard: ChartCard | null = null;
let factsEl: HTMLElement | null = null;

const millions = (seconds: number): string => `$${num(seconds / 1000, 0)}M`;
const STEP_M = 2;
const SPAN_M = 400;

interface CurvePoint {
  tailUsd: number;
  rate: number;
}

/** The mint curve itself, from the SDK. A high tracked LP keeps the curve out of its flat phase. */
function curvePoints(m: Metrics, currentTail: number): CurvePoint[] {
  const trackedLpUsd = m.paper.curve.lpFlatThresholdUsd * 2;
  const tails = new Set<number>();
  for (let h = 0; h <= SPAN_M; h += STEP_M) tails.add(h * 1e6);
  tails.add(Math.round(currentTail / 1000) * 1000);
  return [...tails].sort((a, b) => a - b).map((tailUsd) => ({ tailUsd, rate: paperMintRate({ trackedLpUsd, tailProgressUsd: tailUsd }) }));
}

function fact(label: string, value: string, sub: Safe | string): Safe {
  return html`<div class="fact"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function factList(m: Metrics): Safe {
  const p = m.paper;
  const s = m.staking;
  const toRate25 = p.tailProgressToRate25Usd;
  return html`
    ${fact('Supply', compactNum(p.supply), p.supplySource === 'onchain' ? 'Total PAPER, read from HyperEVM' : 'Total PAPER, from the indexer')}
    ${fact('Staked', `${compactNum(s.totalStaked)} (${pct(p.stakedShare)})`, html`<div class="cap" role="img" aria-label="${pct(p.stakedShare)} of supply is staked"><span data-w="${(p.stakedShare * 100).toFixed(2)}"></span></div>`)}
    ${fact('Mint rate now', `${num(p.mintRate, 2)} PAPER per $1`, p.phase === 'flat' ? `Flat at ${num(p.mintRateMax)} while tracked LP (${usd(p.trackedLpUsd)}) is under ${usd(p.curve.lpFlatThresholdUsd)}` : `Decaying. Tail progress ${usd(p.tailProgressUsd)} on a ${usd(p.curve.tailDecayScaleUsd)} scale`)}
    ${fact('Distance to 25 per $1', toRate25 === null ? 'Already below' : usd(toRate25), 'More tail progress (new LP high-water mark) before the rate falls to 25')}
    ${fact('Reward accumulator', `$${num(s.accRewardPerShareUsd, 6)} / PAPER`, `${usd(s.rewardsDistributedUsd)} distributed, ${usd(s.pendingRewardsUsd)} pending of a ${usd(s.rewardCapUsd)} cap`)}
  `;
}

function curveCsv(m: Metrics): string {
  return toCsv(['tail_progress_usd', 'paper_per_usd'], curvePoints(m, m.paper.tailProgressUsd).map((p) => [p.tailUsd, p.rate]));
}

function updateCurve(m: Metrics): void {
  if (!curveCard) return;
  const cur = m.paper.tailProgressUsd;
  const points = curvePoints(m, cur).map((p) => ({ time: (p.tailUsd / 1e6) * 1000, value: p.rate }));
  const currentTime = ((Math.round(cur / 1000) * 1000) / 1e6) * 1000;
  const format = (v: number) => `${num(v, 2)} PAPER / $1`;
  curveCard.hideOverlay();
  curveCard.update({
    series: [{ id: 'curve', kind: 'area', color: '--accent', points, format }],
    rows: [{ label: 'PAPER per $1', color: '--accent', points, format }],
    footnote: `x axis: tail progress, the LP high-water mark above the flat zone. Marker: the protocol today (${usd(cur)} of tail progress, ${num(m.paper.mintRate, 2)} PAPER per $1).`,
    marker: { seriesId: 'curve', time: currentTime, text: 'Now' },
  });
}

export function initPaper(root: HTMLElement): void {
  root.innerHTML = '<div class="fact-list" data-facts></div><div data-curve></div>';
  factsEl = root.querySelector<HTMLElement>('[data-facts]');
  const host = root.querySelector<HTMLElement>('[data-curve]')!;
  curveCard = new ChartCard(host, { csvName: 'papertrade-paper-mint-curve', customTime: true, timeFormat: millions, csv: () => (sources.metrics.data ? curveCsv(sources.metrics.data) : '') }, { title: 'PAPER mint curve', subtitle: 'PAPER minted per $1 of trader volume as the LP high-water mark grows.' });
  curveCard.showOverlay(skeleton('tall').value);
}

export function renderPaper(root: HTMLElement): void {
  const s = sources.metrics;
  if (!factsEl || !curveCard) return;
  if (!s.data) {
    if (s.error && !s.loading) {
      render(factsEl, errorState('Could not load PAPER economics', s.error, 'metrics'));
      curveCard.showOverlay('<div class="state"><div class="state-title">Curve unavailable</div><p>Retry from the panel on the left.</p></div>');
    } else render(factsEl, html`${[0, 1, 2, 3].map(() => html`<div class="fact">${skeleton('small')}${skeleton('line')}</div>`)}`);
    root.setAttribute('aria-busy', String(!s.error));
    return;
  }
  root.setAttribute('aria-busy', 'false');
  render(factsEl, factList(s.data));
  updateCurve(s.data);
}

export function paperCard(): ChartCard | null {
  return curveCard;
}
