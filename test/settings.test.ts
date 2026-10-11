import { describe, expect, it } from 'vitest';
import { DEFAULTS, settingsSearch } from '../site/app/settings.js';

describe('settingsSearch', () => {
  it('is empty for defaults', () => {
    expect(settingsSearch(DEFAULTS, '')).toBe('');
  });

  it('writes only non-default settings', () => {
    expect(settingsSearch({ ...DEFAULTS, range: '7d', market: 'ETH' }, '')).toBe('?range=7d&market=ETH');
  });

  it('keeps a framed view framed when settings change', () => {
    expect(settingsSearch({ ...DEFAULTS, range: '7d' }, '?embed=1&range=24h')).toBe('?embed=1&range=7d');
    expect(settingsSearch(DEFAULTS, '?embed=1')).toBe('?embed=1');
  });

  it('does not invent embed mode', () => {
    expect(settingsSearch(DEFAULTS, '?embed=0')).toBe('');
  });
});
