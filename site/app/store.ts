import { PapertradeClient, type LeaderboardAccounts, type LeaderboardPositionRow, type LeaderboardWindow, type LeaderboardSortKey, type TradingState } from 'papertrade-sdk';
import type { ProtocolHistory } from 'papertrade-sdk';
import { readSettings, settingsSearch, type Settings } from './settings.js';
import type { HouseResponse, Metrics, Snapshot } from '../../src/types.js';
import { errorMessage } from './util.js';

export const client = new PapertradeClient({ baseUrl: '/api/papertrade', clientBuild: 'papertrade-analytics', retries: 2 });

export { DEFAULTS, LB_SORTS, readSettings, settingsSearch, type MarketFilter, type Scale, type Settings, type VolumeMode } from './settings.js';

export function writeSettings(s: Settings): void {
  history.replaceState(null, '', `${location.pathname}${settingsSearch(s, location.search)}${location.hash}`);
}

export interface Source<T> {
  data: T | null;
  error: string | null;
  /** When `data` was last fetched, ms. */
  at: number;
  loading: boolean;
}

const source = <T>(): Source<T> => ({ data: null, error: null, at: 0, loading: false });

export interface BoardData {
  window: LeaderboardWindow;
  sort: LeaderboardSortKey;
  page: number;
  count: number;
  accounts: LeaderboardAccounts['accounts'];
  summary: LeaderboardAccounts['summary'];
}

export interface InsightData {
  positions: LeaderboardPositionRow[];
  topByOpenNotional: LeaderboardAccounts['accounts'];
  at: number;
}

export interface HistoryPair {
  h1: ProtocolHistory;
  d1: ProtocolHistory;
}

export const sources = {
  metrics: source<Metrics>(),
  history: source<HistoryPair>(),
  house: source<HouseResponse>(),
  snapshots: source<Snapshot[]>(),
  trading: source<TradingState>(),
  board: source<BoardData>(),
  insights: source<InsightData>(),
};
export type SourceName = keyof typeof sources;

export const settings: Settings = readSettings(location.search);

const INSIGHT_TTL_MS = 5 * 60_000;
const PAGE_SIZE = 25;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { accept: 'application/json' } });
  const body = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok || body === null) throw new Error(body && typeof body === 'object' && 'message' in body && body.message ? body.message : `HTTP ${res.status} from ${path}`);
  return body;
}

const loaders: Record<SourceName, () => Promise<unknown>> = {
  metrics: () => getJson<Metrics>('/api/metrics'),
  history: async () => {
    const [h1, d1] = await Promise.all([client.protocolHistory('1h'), client.protocolHistory('1d')]);
    return { h1, d1 } satisfies HistoryPair;
  },
  house: () => client.http.get<HouseResponse>('/state/house/current'),
  snapshots: async () => (await getJson<{ snapshots: Snapshot[] }>('/api/snapshots')).snapshots,
  trading: () => client.tradingState(),
  board: async () => {
    const res = await client.leaderboard({ window: settings.window, sortKey: settings.sort, sortDir: 'desc', page: settings.page, pageSize: PAGE_SIZE });
    return { window: settings.window, sort: settings.sort, page: settings.page, count: res.count, accounts: res.accounts, summary: res.summary } satisfies BoardData;
  },
  insights: async () => {
    const cached = sources.insights.data;
    if (cached && Date.now() - cached.at < INSIGHT_TTL_MS) return cached;
    const windows: LeaderboardWindow[] = ['24h', '7d', '30d', 'all'];
    const [positions, pages] = await Promise.all([
      Promise.all(windows.map((window) => client.http.get<{ rows: LeaderboardPositionRow[] }>('/state/leaderboard/positions', { window }))),
      Promise.all([0, 1, 2, 3].map((page) => client.leaderboard({ window: 'all', sortKey: 'currentOpenNotional', sortDir: 'desc', page, pageSize: PAGE_SIZE }))),
    ]);
    return { positions: positions.flatMap((p) => p.rows), topByOpenNotional: pages.flatMap((p) => p.accounts), at: Date.now() } satisfies InsightData;
  },
};

type Listener = (name: SourceName) => void;
const listeners = new Set<Listener>();
export const subscribe = (fn: Listener): void => void listeners.add(fn);
const emit = (name: SourceName) => listeners.forEach((fn) => fn(name));

/** Load one source. A failed refresh keeps the previous data and records the error beside it. */
export async function load(name: SourceName): Promise<void> {
  const s = sources[name] as Source<unknown>;
  if (s.loading) return;
  s.loading = true;
  emit(name);
  try {
    s.data = await loaders[name]();
    s.error = null;
    s.at = Date.now();
  } catch (err) {
    s.error = errorMessage(err);
  } finally {
    s.loading = false;
    emit(name);
  }
}

export const REFRESH_MS = 30_000;
export const ALL_SOURCES: SourceName[] = ['metrics', 'history', 'house', 'snapshots', 'trading', 'board', 'insights'];
export const loadAll = (): Promise<void[]> => Promise.all(ALL_SOURCES.map(load));
