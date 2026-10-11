/** Connect-your-AI tabs and copy buttons on the landing page. Snippets are static markup; only the origin is localised. */

const PROD_ORIGIN = 'https://papertrade-analytics.pages.dev';

function localise(): void {
  if (location.origin === PROD_ORIGIN || !location.origin.startsWith('http')) return;
  document.querySelectorAll<HTMLElement>('#connect code, #api code').forEach((el) => {
    if (el.textContent?.includes(PROD_ORIGIN)) el.textContent = el.textContent.replaceAll(PROD_ORIGIN, location.origin);
  });
}

function select(tab: HTMLElement, focus: boolean): void {
  const list = tab.closest('[role="tablist"]');
  if (!list) return;
  list.querySelectorAll<HTMLElement>('[role="tab"]').forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
    if (panel) panel.hidden = !on;
  });
  if (focus) tab.focus();
}

async function copy(button: HTMLElement): Promise<void> {
  const code = button.parentElement?.querySelector('code');
  if (!code) return;
  const text = code.textContent ?? '';
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    button.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => {
    button.textContent = 'Copy';
  }, 1600);
}

export function initConnect(): void {
  localise();
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>('[role="tab"][data-tab]');
    if (tab) return select(tab, false);
    const button = target?.closest<HTMLElement>('[data-copy]');
    if (button) void copy(button);
  });
  document.addEventListener('keydown', (event) => {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="tab"][data-tab]') : null;
    if (!tab || !['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...(tab.closest('[role="tablist"]')?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    const i = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    select(tabs[next], true);
  });
}
