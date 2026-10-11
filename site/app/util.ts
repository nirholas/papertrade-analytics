/** Escaping and rendering helpers. Every dynamic string goes through `html`, which escapes by default. */

export class Safe {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** Mark a string as already-safe markup (built by `html`). */
export const raw = (markup: string): Safe => new Safe(markup);

function part(value: unknown): string {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(part).join('');
  if (value === null || value === undefined || value === false) return '';
  return esc(value);
}

/** Tagged template: interpolated values are HTML-escaped unless they are Safe or arrays of Safe. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): Safe {
  let out = strings[0];
  values.forEach((v, i) => {
    out += part(v) + strings[i + 1];
  });
  return new Safe(out);
}

/** Bars and meters carry `data-w="42"`; widths are set through the CSSOM so the strict CSP needs no inline styles. */
export function applyBars(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
    const w = Number(el.dataset.w);
    el.style.setProperty('--w', `${Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : 0}%`);
  });
}

export function render(target: Element, content: Safe): void {
  target.innerHTML = content.value;
  applyBars(target);
}

export function $<T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el;
}

export function download(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Request failed.';
}

export const skeleton = (cls = ''): Safe => new Safe(`<span class="skeleton ${esc(cls)}" aria-hidden="true"></span>`);

export function errorState(title: string, message: string, retryAttr: string): Safe {
  return html`<div class="state" role="alert"><div class="state-title">${title}</div><p>${message}</p><button type="button" class="btn" data-retry="${retryAttr}">Retry</button></div>`;
}

export function emptyState(title: string, message: string): Safe {
  return html`<div class="state"><div class="state-title">${title}</div><p>${message}</p></div>`;
}
