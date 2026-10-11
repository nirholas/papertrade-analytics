import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  PriceScaleMode,
  createChart,
  createSeriesMarkers,
  type ISeriesMarkersPluginApi,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import { seriesToCsv } from '../../src/csv.js';
import { RANGE_MS, type Range } from '../../src/house.js';
import { alignSeries, type Point } from '../../src/transforms.js';
import { download, esc } from './util.js';

export type ColorToken = '--accent' | '--long' | '--short' | '--btc' | '--eth' | '--ink' | '--muted';

export interface PlotSeries {
  id: string;
  kind: 'line' | 'area' | 'hist';
  color: ColorToken;
  points: Point[];
  /** Series on the left axis (for a second unit); the right axis is the default. */
  left?: boolean;
  format?: (value: number) => string;
}

/** What the tooltip and CSV show. Usually the plotted series, but stacked bars plot running totals. */
export interface ReadoutRow {
  label: string;
  color: ColorToken;
  points: Point[];
  format: (value: number) => string;
}

export interface ChartUpdate {
  series: PlotSeries[];
  rows: ReadoutRow[];
  footnote: string;
  /** Marker at one plotted point, used by the mint curve. */
  marker?: { seriesId: string; time: number; text: string };
}

export interface ChartOptions {
  /** Format an x value (seconds) for the axis and tooltip. Defaults to dates. */
  timeFormat?: (seconds: number) => string;
  /** Time axis is not a clock (the mint curve), so no seconds and no date logic. */
  customTime?: boolean;
  csvName: string;
  /** Replaces the default time-series CSV (the mint curve has a dollar x axis, not a clock). */
  csv?: () => string;
}

const css = (token: ColorToken | '--line' | '--surface'): string => getComputedStyle(document.documentElement).getPropertyValue(token).trim();
const seconds = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

/** Strictly increasing, one point per second, as lightweight-charts requires. */
export function toSeriesData(points: readonly Point[], customTime = false): Array<{ time: UTCTimestamp; value: number }> {
  const out: Array<{ time: UTCTimestamp; value: number }> = [];
  for (const p of points) {
    const time = customTime ? (Math.round(p.time) as UTCTimestamp) : seconds(p.time);
    if (!Number.isFinite(p.value)) continue;
    const last = out[out.length - 1];
    if (last && last.time === time) last.value = p.value;
    else if (!last || time > last.time) out.push({ time, value: p.value });
  }
  return out;
}

/** Points inside the range; when fewer than `minPoints` fall inside, the latest `minPoints` instead. */
export function sliceRange(points: readonly Point[], range: Range, nowMs: number, minPoints = 3): { points: Point[]; widened: boolean } {
  if (range === 'all' || !points.length) return { points: [...points], widened: false };
  const from = nowMs - RANGE_MS[range];
  const inside = points.filter((p) => p.time >= from);
  if (inside.length >= minPoints) return { points: inside, widened: false };
  return { points: points.slice(-minPoints), widened: points.length > inside.length };
}

export class ChartCard {
  readonly root: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly legend: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly csvButton: HTMLButtonElement;
  private chart: IChartApi | null = null;
  private plotted = new Map<string, ISeriesApi<SeriesType>>();
  private signature = '';
  private rows: ReadoutRow[] = [];
  private rowIndex: Array<Map<number, number>> = [];
  private scale: 'linear' | 'log' = 'linear';
  private logAllowed = false;
  private csvSuffix = () => '';
  private readonly overlay: HTMLElement;

  constructor(
    host: HTMLElement,
    private readonly options: ChartOptions,
    head: { title: string; subtitle: string; toolsHtml?: string },
  ) {
    this.root = document.createElement('article');
    this.root.className = 'chart-card';
    this.root.innerHTML = `
      <div class="chart-head">
        <div><h3>${esc(head.title)}</h3><p>${esc(head.subtitle)}</p></div>
        <div class="chart-tools">${head.toolsHtml ?? ''}<button type="button" class="btn small" data-csv>CSV</button></div>
      </div>
      <div class="legend" aria-hidden="true"></div>
      <div class="chart-body" role="img" aria-label="${esc(head.title)} chart. Use the CSV button for the underlying numbers."><div class="lw"></div><div class="chart-overlay" hidden></div><div class="tip" hidden></div></div>
      <p class="chart-foot"></p>`;
    host.append(this.root);
    this.body = this.root.querySelector<HTMLElement>('.lw')!;
    this.overlay = this.root.querySelector<HTMLElement>('.chart-overlay')!;
    this.tip = this.root.querySelector<HTMLElement>('.tip')!;
    this.legend = this.root.querySelector<HTMLElement>('.legend')!;
    this.foot = this.root.querySelector<HTMLElement>('.chart-foot')!;
    this.csvButton = this.root.querySelector<HTMLButtonElement>('[data-csv]')!;
    this.csvButton.addEventListener('click', () => this.exportCsv());
  }

  setCsvSuffix(fn: () => string): void {
    this.csvSuffix = fn;
  }

  /** Log scale only applies to cards whose values are always positive. */
  setScale(scale: 'linear' | 'log', allowed: boolean): void {
    this.scale = scale;
    this.logAllowed = allowed;
    this.chart?.priceScale('right').applyOptions({ mode: allowed && scale === 'log' ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }

  private ensureChart(): IChartApi {
    if (this.chart) return this.chart;
    const { customTime, timeFormat } = this.options;
    this.chart = createChart(this.body, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: css('--muted'), fontFamily: getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace', fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
      leftPriceScale: { borderVisible: false, visible: false, scaleMargins: { top: 0.1, bottom: 0.08 } },
      timeScale: {
        borderVisible: false,
        rightOffset: customTime ? 2 : 0,
        timeVisible: !customTime,
        secondsVisible: false,
        ...(customTime && timeFormat ? { tickMarkFormatter: (t: Time) => timeFormat(Number(t)) } : {}),
      },
      localization: customTime && timeFormat ? { timeFormatter: (t: Time) => timeFormat(Number(t)) } : {},
      crosshair: { mode: CrosshairMode.Magnet, vertLine: { color: css('--muted'), labelBackgroundColor: css('--ink') }, horzLine: { color: css('--muted'), labelBackgroundColor: css('--ink') } },
      handleScale: { mouseWheel: false },
      handleScroll: { mouseWheel: false },
    });
    this.chart.subscribeCrosshairMove((param) => this.showTip(param));
    this.setScale(this.scale, this.logAllowed);
    return this.chart;
  }

  /** Cover the chart with a loading, empty or error state. */
  showOverlay(markup: string): void {
    this.overlay.innerHTML = markup;
    this.overlay.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  get overlayElement(): HTMLElement {
    return this.overlay;
  }

  /** Re-read the CSS tokens after a light/dark switch. */
  applyTheme(): void {
    if (!this.chart) return;
    this.chart.applyOptions({
      layout: { textColor: css('--muted') },
      grid: { vertLines: { color: css('--line') }, horzLines: { color: css('--line') } },
      crosshair: { vertLine: { color: css('--muted'), labelBackgroundColor: css('--ink') }, horzLine: { color: css('--muted'), labelBackgroundColor: css('--ink') } },
    });
    this.plotted.forEach((s, id) => {
      const spec = this.lastSeries.find((x) => x.id === id);
      if (spec) s.applyOptions({ color: css(spec.color), lineColor: css(spec.color) } as never);
    });
    this.paintMarker();
  }

  private lastSeries: PlotSeries[] = [];
  private markers: ISeriesMarkersPluginApi<Time> | null = null;
  private markerSpec: { time: number; text: string } | null = null;

  private paintMarker(): void {
    if (!this.markers || !this.markerSpec) return;
    this.markers.setMarkers([{ time: Math.round(this.markerSpec.time) as UTCTimestamp, position: 'aboveBar', color: css('--ink'), shape: 'circle', text: this.markerSpec.text }]);
  }

  update(data: ChartUpdate): void {
    const chart = this.ensureChart();
    const signature = data.series.map((s) => `${s.id}:${s.kind}:${s.left ? 'L' : 'R'}`).join('|');
    if (signature !== this.signature) {
      this.plotted.forEach((s) => chart.removeSeries(s));
      this.plotted.clear();
      this.markers = null;
      this.signature = signature;
    }
    const custom = Boolean(this.options.customTime);
    let hasLeft = false;
    for (const spec of data.series) {
      let api = this.plotted.get(spec.id);
      const color = css(spec.color);
      if (!api) {
        const priceScaleId = spec.left ? 'left' : 'right';
        const base = { priceScaleId, lastValueVisible: false, priceLineVisible: false, priceFormat: spec.format ? { type: 'custom' as const, formatter: spec.format, minMove: 0.0001 } : undefined };
        if (spec.kind === 'hist') api = chart.addSeries(HistogramSeries, { ...base, color });
        else if (spec.kind === 'area') api = chart.addSeries(AreaSeries, { ...base, lineColor: color, topColor: `${color}55`, bottomColor: `${color}05`, lineWidth: 2 });
        else api = chart.addSeries(LineSeries, { ...base, color, lineWidth: 2 });
        this.plotted.set(spec.id, api);
      }
      if (spec.left) hasLeft = true;
      api.setData(toSeriesData(spec.points, custom));
    }
    chart.priceScale('left').applyOptions({ visible: hasLeft });
    this.lastSeries = data.series;

    if (data.marker) {
      const target = this.plotted.get(data.marker.seriesId);
      this.markerSpec = { time: data.marker.time, text: data.marker.text };
      if (target && !this.markers) this.markers = createSeriesMarkers(target, []);
      this.paintMarker();
    }

    this.rows = data.rows;
    this.rowIndex = data.rows.map((r) => new Map(toSeriesData(r.points, custom).map((p) => [p.time, p.value])));
    this.legend.innerHTML = data.rows.map((r) => `<span><i data-color="${esc(r.color)}"></i>${esc(r.label)}</span>`).join('');
    this.legend.querySelectorAll<HTMLElement>('i[data-color]').forEach((i) => {
      i.style.background = css(i.dataset.color as ColorToken);
    });
    this.foot.textContent = data.footnote;
    this.csvButton.disabled = data.rows.every((r) => r.points.length === 0);
    chart.timeScale().fitContent();
  }

  private showTip(param: MouseEventParams): void {
    if (!param.point || param.time === undefined || param.point.x < 0 || param.point.y < 0) {
      this.tip.hidden = true;
      return;
    }
    const t = Number(param.time);
    const { timeFormat, customTime } = this.options;
    const label = customTime && timeFormat ? timeFormat(t) : new Date(t * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    this.tip.replaceChildren();
    const time = document.createElement('div');
    time.className = 'tip-time';
    time.textContent = label;
    this.tip.append(time);
    let shown = 0;
    this.rows.forEach((row, i) => {
      const value = this.rowIndex[i].get(t);
      if (value === undefined) return;
      shown += 1;
      const line = document.createElement('div');
      line.className = 'tip-row';
      const name = document.createElement('span');
      const swatch = document.createElement('i');
      swatch.style.background = css(row.color);
      name.append(swatch, row.label);
      const val = document.createElement('b');
      val.textContent = row.format(value);
      line.append(name, val);
      this.tip.append(line);
    });
    if (!shown) {
      this.tip.hidden = true;
      return;
    }
    this.tip.hidden = false;
    const width = this.tip.offsetWidth;
    const x = param.point.x + 16 + width > this.body.clientWidth ? param.point.x - width - 16 : param.point.x + 16;
    this.tip.style.left = `${Math.max(0, x)}px`;
    this.tip.style.top = `${Math.max(0, Math.min(param.point.y, this.body.clientHeight - this.tip.offsetHeight))}px`;
  }

  exportCsv(): void {
    if (this.options.csv) {
      download(`${this.options.csvName}.csv`, this.options.csv());
      return;
    }
    const named: Record<string, Point[]> = {};
    this.rows.forEach((r) => {
      named[r.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')] = r.points;
    });
    const { times, columns } = alignSeries(named);
    download(`${this.options.csvName}${this.csvSuffix()}.csv`, seriesToCsv(times, columns));
  }

  destroy(): void {
    this.chart?.remove();
    this.root.remove();
  }
}

export function watchTheme(cards: () => Iterable<ChartCard>): void {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    for (const c of cards()) c.applyTheme();
  });
}
