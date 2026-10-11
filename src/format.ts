const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** $1.23B, $456.7M, $12.3K, $12.34. Negative values keep their sign in front of the dollar sign. */
export function usd(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  const sign = value < 0 ? '-' : '';
  const v = Math.abs(value);
  if (v >= 1000) return `${sign}$${compact.format(v)}`;
  return `${sign}$${v.toFixed(v >= 100 ? 0 : digits)}`;
}

/** Full dollars with thousands separators, for tooltips and tables where precision matters. */
export function usdFull(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `${value < 0 ? '-' : ''}$${grouped.format(Math.abs(value))}`;
}

export function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function compactNum(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return compact.format(value);
}

/** Fraction to percent text: 0.1234 -> "12.3%". */
export function pct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return 'n/a';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function signedPct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return 'n/a';
  const text = (fraction * 100).toFixed(digits);
  return `${fraction > 0 ? '+' : ''}${text}%`;
}

export function price(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'n/a';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: value < 10 ? 4 : 2 })}`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

/** 90s -> "1m", 4000s -> "1h 6m", 200000s -> "2d 7h". */
export function span(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? ` ${h % 24}h` : ''}`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 5 ? 'just now' : `${span(ms)} ago`;
}
