import { beforeEach, describe, expect, it } from 'vitest';
import { decodeTradingState } from 'papertrade-sdk';
import { DEFAULT_PROTOCOL, handleMcp, resetRateLimits, validateArgs, type McpConfig } from '../site/functions/_lib/mcp.js';
import { INSTRUCTIONS, SERVER_INFO, describeServer } from '../site/functions/_lib/server.js';
import { TOOLS, cleanName, type DataSource, type ToolContext } from '../site/functions/_lib/tools.js';
import { buildMetrics } from '../src/metrics.js';
import { fixture, history1d, history1h, house, leaderboard, positions, recordedInputs } from './helpers.js';

async function dataSource(): Promise<DataSource> {
  const inputs = await recordedInputs();
  const metrics = buildMetrics(inputs);
  return {
    metrics: async () => metrics,
    history: async (interval) => (interval === '1h' ? history1h() : history1d()),
    house: async () => house(),
    trading: async () => decodeTradingState(fixture('trading')),
    leaderboard: async () => leaderboard('lbacc-24h'),
    positions: async () => positions(),
  };
}

async function config(): Promise<McpConfig<ToolContext>> {
  const data = await dataSource();
  return { serverInfo: SERVER_INFO, instructions: INSTRUCTIONS, tools: TOOLS, context: () => ({ data }), describe: describeServer };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asJson = async (res: Response): Promise<any> => res.json();

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x.test/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function rpc(cfg: McpConfig<ToolContext>, body: unknown, headers?: Record<string, string>) {
  const res = await handleMcp(post(body, headers), cfg);
  return { res, json: res.status === 202 ? null : await asJson(res) };
}

beforeEach(() => resetRateLimits());

describe('transport', () => {
  it('initialize echoes a supported protocol version and advertises tools', async () => {
    const { res, json } = await rpc(await config(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(json.result.protocolVersion).toBe('2025-03-26');
    expect(json.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(json.result.serverInfo.name).toBe('papertrade-analytics');
    expect(json.result.instructions).toContain('Unofficial');
  });

  it('falls back to the default protocol version for an unknown one', async () => {
    const { json } = await rpc(await config(), { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    expect(json.result.protocolVersion).toBe(DEFAULT_PROTOCOL);
  });

  it('answers notifications with 202 and no body', async () => {
    const res = await handleMcp(post({ jsonrpc: '2.0', method: 'notifications/initialized' }), await config());
    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('handles ping, empty resources and prompts', async () => {
    const cfg = await config();
    expect((await rpc(cfg, { jsonrpc: '2.0', id: 'a', method: 'ping' })).json).toEqual({ jsonrpc: '2.0', id: 'a', result: {} });
    expect((await rpc(cfg, { jsonrpc: '2.0', id: 2, method: 'resources/list' })).json.result).toEqual({ resources: [] });
    expect((await rpc(cfg, { jsonrpc: '2.0', id: 3, method: 'prompts/list' })).json.result).toEqual({ prompts: [] });
  });

  it('accepts a batch and drops notifications from the reply', async () => {
    const { json } = await rpc(await config(), [
      { jsonrpc: '2.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]);
    expect(Array.isArray(json)).toBe(true);
    expect(json.map((r: { id: number }) => r.id)).toEqual([1, 2]);
  });

  it('uses proper JSON-RPC error codes', async () => {
    const cfg = await config();
    const parse = await handleMcp(post('{not json'), cfg);
    expect(parse.status).toBe(400);
    expect((await asJson(parse)).error.code).toBe(-32700);
    expect((await rpc(cfg, { jsonrpc: '1.0', id: 1, method: 'ping' })).json.error.code).toBe(-32600);
    expect((await rpc(cfg, { jsonrpc: '2.0', id: 1, method: 'nope' })).json.error.code).toBe(-32601);
    expect((await rpc(cfg, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'nope' } })).json.error.code).toBe(-32602);
    expect((await rpc(cfg, [])).json.error.code).toBe(-32600);
  });

  it('responds as one SSE message when only text/event-stream is accepted', async () => {
    const res = await handleMcp(post({ jsonrpc: '2.0', id: 9, method: 'ping' }, { accept: 'text/event-stream' }), await config());
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text.startsWith('event: message\ndata: ')).toBe(true);
    expect(JSON.parse(text.split('data: ')[1])).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
  });

  it('GET, DELETE and OPTIONS follow the spec', async () => {
    const cfg = await config();
    const sse = await handleMcp(new Request('https://x.test/mcp', { headers: { accept: 'text/event-stream' } }), cfg);
    expect(sse.status).toBe(405);
    expect(sse.headers.get('allow')).toContain('POST');
    const info = await handleMcp(new Request('https://x.test/mcp'), cfg);
    expect(info.status).toBe(200);
    expect((await asJson(info)).tools.length).toBe(TOOLS.length);
    expect((await handleMcp(new Request('https://x.test/mcp', { method: 'DELETE' }), cfg)).status).toBe(405);
    const pre = await handleMcp(new Request('https://x.test/mcp', { method: 'OPTIONS' }), cfg);
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-headers')).toContain('Mcp-Session-Id');
    expect(pre.headers.get('access-control-allow-headers')).toContain('Authorization');
  });

  it('rate limits per client and sends Retry-After', async () => {
    const cfg = { ...(await config()), rateLimit: { limit: 2, windowMs: 60_000 } };
    const send = () => handleMcp(post({ jsonrpc: '2.0', id: 1, method: 'ping' }, { 'cf-connecting-ip': '203.0.113.9' }), cfg);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('rejects oversized bodies', async () => {
    const cfg = { ...(await config()), maxBodyBytes: 100 };
    const res = await handleMcp(post({ jsonrpc: '2.0', id: 1, method: 'ping', params: { pad: 'x'.repeat(200) } }), cfg);
    expect(res.status).toBe(413);
  });
});

describe('tool registry', () => {
  it('every tool is complete and read-only', () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(4);
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema.type).toBe('object');
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.annotations.destructiveHint).toBe(false);
    }
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
  });

  it('exposes no tool that could move money', () => {
    for (const t of TOOLS) expect(t.name).not.toMatch(/sign|send|transfer|swap|bridge|mint|pay|open_position|close_position|place|withdraw|deposit/);
  });

  it('validateArgs enforces enums, ranges, required and unknown keys', () => {
    const schema = TOOLS.find((t) => t.name === 'get_history')!.inputSchema;
    expect(validateArgs(schema, { metric: 'tvl' })).toEqual([]);
    expect(validateArgs(schema, {})).toContain('arguments.metric is required');
    expect(validateArgs(schema, { metric: 'tvl', limit: 9999 }).join()).toContain('at most 500');
    expect(validateArgs(schema, { metric: 'tvl', bogus: 1 }).join()).toContain('not a known argument');
    expect(validateArgs(schema, { metric: 'tvl', limit: 2.5 }).join()).toContain('must be integer');
  });

  it('cleanName strips control and bidi characters', () => {
    expect(cleanName('ab‮cd\u0007ef')).toBe('abcdef');
    expect(cleanName('​')).toBeNull();
    expect(cleanName('x'.repeat(100))?.length).toBe(40);
  });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const { json } = await rpc(await config(), { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return json.result;
}

describe('tools against recorded protocol responses', () => {
  it('get_protocol_snapshot returns structured and text content', async () => {
    const r = await call('get_protocol_snapshot');
    expect(r.isError).toBeUndefined();
    expect(r.content[0].type).toBe('text');
    expect(r.structuredContent.protocol.tvlUsd).toBeGreaterThan(0);
    expect(r.structuredContent.deltas).toBeDefined();
    expect(JSON.parse(r.content[0].text.slice(r.content[0].text.indexOf('{'))).protocol.tvlUsd).toBe(r.structuredContent.protocol.tvlUsd);
  });

  it('get_history returns newest-last points and honours limit and per_bucket', async () => {
    const r = await call('get_history', { metric: 'tvl', interval: '1d', limit: 5 });
    const pts = r.structuredContent.points;
    expect(pts.length).toBeLessThanOrEqual(5);
    expect(pts.map((p: { timeMs: number }) => p.timeMs)).toEqual([...pts.map((p: { timeMs: number }) => p.timeMs)].sort((a, b) => a - b));
    const v = await call('get_history', { metric: 'volume', interval: '1h', mode: 'per_bucket', limit: 24 });
    expect(v.structuredContent.mode).toBe('per_bucket');
    expect(v.structuredContent.points.every((p: { value: number }) => p.value >= 0)).toBe(true);
  });

  it('get_history refuses per_bucket on a level metric with a tool error', async () => {
    const r = await call('get_history', { metric: 'tvl', mode: 'per_bucket' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('per_bucket');
  });

  it('invalid arguments come back as a tool error, not a crash', async () => {
    const r = await call('get_history', { metric: 'nope' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('one of');
  });

  it('get_open_interest totals add up and history is paired', async () => {
    const r = (await call('get_open_interest', { history: true, resolution: '1h', limit: 10 })).structuredContent;
    expect(r.totals.openNotionalUsd).toBeCloseTo(r.markets.reduce((s: number, m: { openLongUsd: number; openShortUsd: number }) => s + m.openLongUsd + m.openShortUsd, 0));
    expect(Object.keys(r.history).sort()).toEqual(['BTC', 'ETH']);
    const only = (await call('get_open_interest', { market: 'BTC' })).structuredContent;
    expect(only.markets.map((m: { symbol: string }) => m.symbol)).toEqual(['BTC']);
  });

  it('get_paper_economics reports the curve phase', async () => {
    const r = (await call('get_paper_economics')).structuredContent;
    expect(['flat', 'decay']).toContain(r.paper.phase);
    expect(r.paper.supply).toBeGreaterThan(0);
    expect(r.staking.accRewardPerShareRaw).toMatch(/^\d+$/);
  });

  it('get_market_stats filters by symbol and drops sparklines by default', async () => {
    const r = (await call('get_market_stats', { symbol: 'ETH' })).structuredContent;
    expect(r.markets).toHaveLength(1);
    expect(r.markets[0].sparkline).toBeUndefined();
    const withLine = (await call('get_market_stats', { symbol: 'BTC', include_sparkline: true })).structuredContent;
    expect(Array.isArray(withLine.markets[0].sparkline)).toBe(true);
  });

  it('get_top_traders honours limit and adds explorer links', async () => {
    const r = (await call('get_top_traders', { limit: 3 })).structuredContent;
    expect(r.traders.length).toBeLessThanOrEqual(3);
    expect(r.traders[0].explorerUrl).toContain('papertrade-explorer');
    expect(r.traders[0].address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it('get_position_insights buckets leverage', async () => {
    const r = (await call('get_position_insights', { window: '24h' })).structuredContent;
    expect(r.count).toBeGreaterThan(0);
    expect(r.leverage.reduce((s: number, b: { count: number }) => s + b.count, 0)).toBe(r.count);
  });

  it('quote_position_outcome is a labelled simulation with a bust price', async () => {
    const r = (await call('quote_position_outcome', { symbol: 'BTC', side: 'long', marginUsd: 100, leverage: 500, priceMovePct: 0.1 })).structuredContent;
    expect(r.simulation).toBe(true);
    expect(r.notice).toContain('No order was placed');
    expect(r.netPnlUsd).toBeGreaterThan(0);
    expect(r.netPnlUsd).toBeLessThan(r.rawPnlUsd);
    expect(r.bustPriceUsd).toBeLessThan(r.entryPriceUsd);
    const loss = (await call('quote_position_outcome', { symbol: 'BTC', side: 'long', marginUsd: 100, leverage: 500, priceMovePct: -5 })).structuredContent;
    expect(loss.liquidated).toBe(true);
    const short = (await call('quote_position_outcome', { symbol: 'ETH', side: 'short', marginUsd: 50, leverage: 100, priceMovePct: -1, entryPriceUsd: 3000 })).structuredContent;
    expect(short.netPnlUsd).toBeGreaterThan(0);
    expect(short.bustPriceUsd).toBeGreaterThan(short.entryPriceUsd);
  });

  it('quote_position_outcome explains how to proceed when no mark price exists', async () => {
    const noPrice = await call('quote_position_outcome', { symbol: 'ETH', side: 'long', marginUsd: 10, leverage: 10, priceMovePct: 1 });
    expect(noPrice.isError).toBe(true);
    expect(noPrice.content[0].text).toContain('entryPriceUsd');
  });
});
