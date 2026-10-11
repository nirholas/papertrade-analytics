import type { LeaderboardWindow, LeaderboardSortKey } from 'papertrade-sdk';
import { RANGE_MS, type Range } from '../../src/house.js';

/** Dashboard settings and their URL encoding. Kept free of browser globals so it is unit-testable. */
export type Scale = 'linear' | 'log';
export type VolumeMode = 'total' | 'split' | 'cumulative';
export type MarketFilter = 'all' | 'BTC' | 'ETH';

export interface Settings {
  range: Range;
  market: MarketFilter;
  scale: Scale;
  volume: VolumeMode;
  window: LeaderboardWindow;
  sort: LeaderboardSortKey;
  page: number;
}

export const DEFAULTS: Settings = { range: '24h', market: 'all', scale: 'linear', volume: 'total', window: '24h', sort: 'totalWindowedPnl', page: 0 };
export const LB_SORTS: Array<{ key: LeaderboardSortKey; label: string }> = [
  { key: 'totalWindowedPnl', label: 'Windowed PnL' },
  { key: 'realizedPnl', label: 'Realized PnL' },
  { key: 'totalVolume', label: 'Volume' },
  { key: 'currentOpenNotional', label: 'Open notional' },
  { key: 'paperTotal', label: 'PAPER' },
];

const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);

export function readSettings(search: string): Settings {
  const q = new URLSearchParams(search);
  const page = Number(q.get('page'));
  return {
    range: oneOf(q.get('range'), Object.keys(RANGE_MS) as Range[], DEFAULTS.range),
    market: oneOf(q.get('market'), ['all', 'BTC', 'ETH'] as const, DEFAULTS.market),
    scale: oneOf(q.get('scale'), ['linear', 'log'] as const, DEFAULTS.scale),
    volume: oneOf(q.get('volume'), ['total', 'split', 'cumulative'] as const, DEFAULTS.volume),
    window: oneOf(q.get('window'), ['24h', '7d', '30d', 'all'] as const, DEFAULTS.window),
    sort: oneOf(q.get('sort'), LB_SORTS.map((s) => s.key), DEFAULTS.sort),
    page: Number.isInteger(page) && page >= 0 && page < 1000 ? page : 0,
  };
}

/** Query string for non-default settings only, so shared links stay short. `embed=1` is carried over so a framed view stays framed. */
export function settingsSearch(s: Settings, current: string): string {
  const q = new URLSearchParams();
  if (new URLSearchParams(current).get('embed') === '1') q.set('embed', '1');
  (Object.keys(DEFAULTS) as Array<keyof Settings>).forEach((key) => {
    if (s[key] !== DEFAULTS[key]) q.set(key, String(s[key]));
  });
  return q.size ? `?${q}` : '';
}

