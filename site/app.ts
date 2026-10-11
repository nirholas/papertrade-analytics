import { ago } from './../src/format.js';
import { cards, initCharts, updateCharts } from './app/chart-set.js';
import { watchTheme } from './app/charts.js';
import { renderKpis } from './app/kpis.js';
import { renderMarkets, setCalcField } from './app/markets.js';
import { initPaper, paperCard, renderPaper } from './app/paper.js';
import { ALL_SOURCES, REFRESH_MS, load, loadAll, settings, sources, subscribe, writeSettings, type SourceName } from './app/store.js';
import { renderTraders } from './app/traders.js';
import { $ } from './app/util.js';

const kpis = $('#kpis');
const marketCards = $('#market-cards');
const paperPanel = $('#paper-panel');
const traderPanel = $('#trader-panel');
const notice = $('#notice');
const updated = $('#updated');
const pauseButton = $<HTMLButtonElement>('#pause');

let paused = false;
const isRefreshable = (name: SourceName): boolean => name !== 'insights';

function syncControls(): void {
  const groups: Array<[string, keyof typeof settings]> = [
    ['#range', 'range'],
    ['#market-filter', 'market'],
    ['#scale', 'scale'],
  ];
  for (const [selector, key] of groups) {
    document.querySelectorAll<HTMLElement>(`${selector} [role="radio"]`).forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset[key] === String(settings[key])));
    });
  }
  document.querySelectorAll<HTMLElement>('[data-volume]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.volume === settings.volume)));
}

function renderNotice(): void {
  const failing = ALL_SOURCES.filter((n) => sources[n].error && sources[n].data);
  if (!failing.length) {
    notice.hidden = true;
    return;
  }
  notice.hidden = false;
  notice.textContent = `Showing the last good data. Refresh failed for ${failing.join(', ')}: ${sources[failing[0]].error}`;
}

function lastUpdate(): number {
  const times = (['metrics', 'history', 'house'] as const).map((n) => sources[n].at).filter((t) => t > 0);
  return times.length ? Math.min(...times) : 0;
}

function tick(): void {
  const at = lastUpdate();
  if (paused) updated.textContent = at ? `Paused. Last updated ${ago(Date.now() - at)}` : 'Paused';
  else updated.textContent = at ? `Updated ${ago(Date.now() - at)}` : 'Loading';
  const stale = at > 0 && Date.now() - at > REFRESH_MS * 3;
  updated.classList.toggle('stale', stale);
}

function paint(name?: SourceName): void {
  if (!name || name === 'metrics') {
    renderKpis(kpis);
    renderMarkets(marketCards);
    renderPaper(paperPanel);
  }
  if (!name || name === 'trading') renderMarkets(marketCards);
  if (!name || name === 'board' || name === 'insights' || name === 'metrics') renderTraders(traderPanel);
  if (!name || name === 'history' || name === 'house' || name === 'snapshots') updateCharts(name);
  renderNotice();
}

let lastAttempt = 0;
function refresh(): void {
  lastAttempt = Date.now();
  void Promise.all(ALL_SOURCES.filter(isRefreshable).map(load));
}

function change(patch: Partial<typeof settings>): void {
  Object.assign(settings, patch);
  writeSettings(settings);
  syncControls();
}

subscribe((name) => paint(name));

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const button = target.closest<HTMLElement>('button');
  if (!button) return;
  if (button.dataset.retry) {
    void load(button.dataset.retry as SourceName);
    return;
  }
  if (button.dataset.range) {
    change({ range: button.dataset.range as typeof settings.range });
    updateCharts();
  } else if (button.dataset.market) {
    change({ market: button.dataset.market as typeof settings.market });
    updateCharts();
    renderMarkets(marketCards);
  } else if (button.dataset.scale) {
    change({ scale: button.dataset.scale as typeof settings.scale });
    updateCharts();
  } else if (button.dataset.volume) {
    change({ volume: button.dataset.volume as typeof settings.volume });
    updateCharts('history');
  } else if (button.dataset.window) {
    change({ window: button.dataset.window as typeof settings.window, page: 0 });
    void load('board');
    renderTraders(traderPanel);
  } else if (button.dataset.page !== undefined) {
    change({ page: Math.max(0, Number(button.dataset.page)) });
    void load('board');
  } else if (button.id === 'refresh') {
    refresh();
  } else if (button.id === 'pause') {
    paused = !paused;
    pauseButton.setAttribute('aria-pressed', String(paused));
    pauseButton.textContent = paused ? 'Resume' : 'Pause';
    if (!paused) refresh();
    tick();
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLSelectElement && target.id === 'lb-sort') {
    change({ sort: target.value as typeof settings.sort, page: 0 });
    void load('board');
  }
});

marketCards.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  const host = target.closest<HTMLElement>('[data-calc]');
  if (host?.dataset.calc && target.dataset.field) setCalcField(host.dataset.calc, target.dataset.field, target.value);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !paused && Date.now() - Math.max(lastUpdate(), lastAttempt) > REFRESH_MS) refresh();
});

setInterval(() => {
  tick();
  if (!paused && !document.hidden && Date.now() - Math.max(lastUpdate(), lastAttempt) >= REFRESH_MS) refresh();
}, 1000);

watchTheme(() => {
  const all = [...cards.values()];
  const curve = paperCard();
  return curve ? [...all, curve] : all;
});

initCharts($('#chart-grid'));
initPaper(paperPanel);
syncControls();
paint();
void loadAll();
