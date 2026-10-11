export type Cell = string | number | boolean | null | undefined;

/** Neutralise spreadsheet formula injection: untrusted text that starts with = + - @ is prefixed with a quote. */
function safeText(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function cell(value: Cell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = safeText(String(value));
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV. Numbers are written raw so spreadsheets keep full precision. */
export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly Cell[]>): string {
  const lines = [header.map(cell).join(',')];
  for (const row of rows) lines.push(row.map(cell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Aligned series to CSV with an ISO timestamp column. */
export function seriesToCsv(times: readonly number[], columns: Record<string, ReadonlyArray<number | null>>): string {
  const names = Object.keys(columns);
  return toCsv(
    ['time_utc', 'time_unix_ms', ...names],
    times.map((t, i) => [new Date(t).toISOString(), t, ...names.map((n) => columns[n][i] ?? null)]),
  );
}
