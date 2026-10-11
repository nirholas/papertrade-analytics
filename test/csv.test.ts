import { describe, expect, it } from 'vitest';
import { seriesToCsv, toCsv } from '../src/csv.js';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines (RFC 4180)', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', 1]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",1\r\n');
  });

  it('prefixes spreadsheet formulas from untrusted text with a quote', () => {
    expect(toCsv(['name'], [['=HYPERLINK("x")'], ['+1'], ['-1'], ['@SUM(A1)']])).toBe('name\r\n"\'=HYPERLINK(""x"")"\r\n\'+1\r\n\'-1\r\n\'@SUM(A1)\r\n');
  });

  it('writes numbers raw, leaving negatives untouched, and empty cells for null and NaN', () => {
    expect(toCsv(['n'], [[-5.5], [null], [Number.NaN]])).toBe('n\r\n-5.5\r\n\r\n\r\n');
  });
});

describe('seriesToCsv', () => {
  it('adds ISO and unix-ms time columns and leaves gaps empty', () => {
    expect(seriesToCsv([0, 1000], { tvl: [1, null] })).toBe('time_utc,time_unix_ms,tvl\r\n1970-01-01T00:00:00.000Z,0,1\r\n1970-01-01T00:00:01.000Z,1000,\r\n');
  });
});
