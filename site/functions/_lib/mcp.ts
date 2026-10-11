/**
 * Minimal, stateless MCP server over Streamable HTTP, written against the Fetch API so it runs in a Pages Function
 * and in vitest with real Request and Response objects. It speaks JSON-RPC 2.0 (single messages and batches) and
 * implements initialize, ping, tools/list, tools/call and empty resources and prompts lists. Nothing here holds
 * state between requests, signs anything, or reads cookies.
 */

export const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;
export const DEFAULT_PROTOCOL = '2025-06-18';

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: readonly (string | number | boolean | null)[];
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  [key: string]: unknown;
}

export interface ToolAnnotations {
  title?: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface ToolDef<Ctx> {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  annotations: ToolAnnotations;
  /** Returns the structured result. Throw `ToolError` for an expected failure the model can act on. */
  handler: (args: Record<string, unknown>, ctx: Ctx) => Promise<unknown> | unknown;
  /** Optional one-line human summary placed in the text content ahead of the JSON. */
  summarize?: (result: unknown) => string;
}

/** An expected, user-actionable failure. Becomes a tool result with `isError: true`, not a protocol error. */
export class ToolError extends Error {}

export interface McpConfig<Ctx> {
  serverInfo: { name: string; version: string; title: string };
  instructions: string;
  tools: ToolDef<Ctx>[];
  /** Built once per HTTP request and handed to every tool handler. */
  context: (request: Request) => Ctx;
  /** What a plain `GET /mcp` returns. */
  describe: () => Record<string, unknown>;
  rateLimit?: { limit: number; windowMs: number };
  maxBodyBytes?: number;
  maxBatch?: number;
}

export const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'access-control-expose-headers': 'Mcp-Session-Id, Mcp-Protocol-Version, Retry-After',
  'access-control-max-age': '86400',
};

export const RPC = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
  rateLimited: -32000,
} as const;

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

type RpcResponse = { jsonrpc: '2.0'; id: string | number | null; result: unknown } | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string; data?: unknown } };

const rpcError = (id: string | number | null, code: number, message: string, data?: unknown): RpcResponse => ({
  jsonrpc: '2.0',
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

/** Validate tool arguments against the small subset of JSON Schema the tools use. Returns messages, empty when valid. */
export function validateArgs(schema: JsonSchema, args: unknown, path = 'arguments'): string[] {
  const errors: string[] = [];
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const kind = args === null ? 'null' : Array.isArray(args) ? 'array' : typeof args === 'number' && Number.isInteger(args) ? 'integer' : typeof args;
  if (types.length && !types.some((t) => t === kind || (t === 'number' && kind === 'integer'))) {
    return [`${path} must be ${types.join(' or ')}, got ${kind}`];
  }
  if (schema.enum && !schema.enum.includes(args as never)) errors.push(`${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
  if (typeof args === 'number') {
    if (schema.minimum !== undefined && args < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
    if (schema.maximum !== undefined && args > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
  }
  if (typeof args === 'string') {
    if (schema.minLength !== undefined && args.length < schema.minLength) errors.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && args.length > schema.maxLength) errors.push(`${path} must be at most ${schema.maxLength} characters`);
  }
  if (kind === 'object' && schema.properties) {
    const obj = args as Record<string, unknown>;
    for (const key of schema.required ?? []) if (obj[key] === undefined) errors.push(`${path}.${key} is required`);
    for (const [key, value] of Object.entries(obj)) {
      const sub = schema.properties[key];
      if (!sub) {
        if (schema.additionalProperties === false) errors.push(`${path}.${key} is not a known argument`);
        continue;
      }
      if (value !== undefined) errors.push(...validateArgs(sub, value, `${path}.${key}`));
    }
  }
  return errors;
}

/** Fill in schema defaults for absent properties. */
export function withDefaults(schema: JsonSchema, args: Record<string, unknown>): Record<string, unknown> {
  const out = { ...args };
  for (const [key, sub] of Object.entries(schema.properties ?? {})) {
    if (out[key] === undefined && sub.default !== undefined) out[key] = sub.default;
  }
  return out;
}

const buckets = new Map<string, { start: number; count: number }>();

/** Fixed-window limiter, per isolate. Cheap protection for the upstream API, not an accounting system. */
export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start >= windowMs) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || now - b.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  return { ok: b.count <= limit, retryAfterSec: Math.max(1, Math.ceil((b.start + windowMs - now) / 1000)) };
}

export function resetRateLimits(): void {
  buckets.clear();
}

function toolListing<Ctx>(tool: ToolDef<Ctx>) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: { title: tool.title, ...tool.annotations },
  };
}

export function publicToolList<Ctx>(tools: readonly ToolDef<Ctx>[]) {
  return tools.map(toolListing);
}

const safeJson = (value: unknown): string => JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

async function callTool<Ctx>(config: McpConfig<Ctx>, ctx: Ctx, params: unknown): Promise<{ result?: unknown; error?: RpcResponse }> {
  const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
  if (typeof p.name !== 'string') return { error: rpcError(null, RPC.invalidParams, 'tools/call requires a string "name".') };
  const tool = config.tools.find((t) => t.name === p.name);
  if (!tool) return { error: rpcError(null, RPC.invalidParams, `Unknown tool: ${p.name}`) };
  const rawArgs = p.arguments === undefined ? {} : p.arguments;
  if (rawArgs === null || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    return { result: toolFailure('Tool arguments must be a JSON object.') };
  }
  const args = withDefaults(tool.inputSchema, rawArgs as Record<string, unknown>);
  const problems = validateArgs(tool.inputSchema, args);
  if (problems.length) return { result: toolFailure(`Invalid arguments: ${problems.join('; ')}.`) };
  try {
    const structured = await tool.handler(args, ctx);
    const head = tool.summarize ? `${tool.summarize(structured)}\n\n` : '';
    return { result: { content: [{ type: 'text', text: `${head}${JSON.stringify(structured, bigintReplacer, 2)}` }], structuredContent: JSON.parse(safeJson(structured)) } };
  } catch (err) {
    if (err instanceof ToolError) return { result: toolFailure(err.message) };
    const detail = err instanceof Error ? err.message : 'unknown error';
    return { result: toolFailure(`The data source failed: ${detail}. This is usually transient, retry in a few seconds.`) };
  }
}

const bigintReplacer = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

function toolFailure(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

async function handleOne<Ctx>(config: McpConfig<Ctx>, ctx: Ctx, msg: unknown): Promise<RpcResponse | null> {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) return rpcError(null, RPC.invalidRequest, 'Each message must be a JSON-RPC 2.0 object.');
  const m = msg as Partial<RpcRequest>;
  const hasId = m.id !== undefined;
  const id = hasId ? (m.id as string | number | null) : null;
  if (m.jsonrpc !== '2.0' || typeof m.method !== 'string') return rpcError(id, RPC.invalidRequest, 'Expected {"jsonrpc":"2.0","method":string}.');
  if (hasId && m.id !== null && typeof m.id !== 'string' && typeof m.id !== 'number') return rpcError(null, RPC.invalidRequest, 'id must be a string, number or null.');

  if (!hasId) return null;

  switch (m.method) {
    case 'initialize': {
      const asked = (m.params as { protocolVersion?: unknown } | undefined)?.protocolVersion;
      const version = (SUPPORTED_PROTOCOLS as readonly unknown[]).includes(asked) ? (asked as string) : DEFAULT_PROTOCOL;
      return {
        jsonrpc: '2.0',
        id,
        result: { protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: config.serverInfo, instructions: config.instructions },
      };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: publicToolList(config.tools) } };
    case 'tools/call': {
      const out = await callTool(config, ctx, m.params);
      if (out.error) return { ...out.error, id } as RpcResponse;
      return { jsonrpc: '2.0', id, result: out.result };
    }
    case 'resources/list':
      return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'resources/templates/list':
      return { jsonrpc: '2.0', id, result: { resourceTemplates: [] } };
    case 'prompts/list':
      return { jsonrpc: '2.0', id, result: { prompts: [] } };
    case 'logging/setLevel':
      return { jsonrpc: '2.0', id, result: {} };
    default:
      return rpcError(id, RPC.methodNotFound, `Method not found: ${m.method}`);
  }
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(safeJson(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS, ...extra } });
}

function wantsSseOnly(accept: string): boolean {
  const a = accept.toLowerCase();
  return a.includes('text/event-stream') && !a.includes('application/json') && !a.includes('*/*');
}

/** Handle one HTTP request to the MCP endpoint. */
export async function handleMcp<Ctx>(request: Request, config: McpConfig<Ctx>): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

  if (method === 'GET' || method === 'HEAD') {
    const accept = request.headers.get('accept') ?? '';
    if (accept.toLowerCase().includes('text/event-stream') && !accept.includes('application/json')) {
      return json({ error: 'This server is stateless and has no server-initiated stream. POST JSON-RPC to this URL.' }, 405, { allow: 'POST, OPTIONS' });
    }
    return json(config.describe(), 200, { 'cache-control': 'public, max-age=300' });
  }
  if (method === 'DELETE') return json({ error: 'This server has no sessions to terminate.' }, 405, { allow: 'POST, OPTIONS' });
  if (method !== 'POST') return json({ error: `Method ${method} is not allowed.` }, 405, { allow: 'GET, POST, OPTIONS' });

  const limit = config.rateLimit ?? { limit: 60, windowMs: 60_000 };
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
  const rl = checkRateLimit(ip, limit.limit, limit.windowMs);
  if (!rl.ok) return json(rpcError(null, RPC.rateLimited, `Rate limit of ${limit.limit} requests per ${limit.windowMs / 1000}s exceeded. Retry in ${rl.retryAfterSec}s.`), 429, { 'retry-after': String(rl.retryAfterSec) });

  const maxBytes = config.maxBodyBytes ?? 64 * 1024;
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) return json(rpcError(null, RPC.invalidRequest, `Request body exceeds ${maxBytes} bytes.`), 413);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return json(rpcError(null, RPC.parse, 'Parse error: the body is not valid JSON.'), 400);
  }

  const ctx = config.context(request);
  const isBatch = Array.isArray(payload);
  const messages: unknown[] = isBatch ? (payload as unknown[]) : [payload];
  if (isBatch && messages.length === 0) return json(rpcError(null, RPC.invalidRequest, 'An empty batch is not a valid request.'), 400);
  const maxBatch = config.maxBatch ?? 10;
  if (messages.length > maxBatch) return json(rpcError(null, RPC.invalidRequest, `Batches are limited to ${maxBatch} messages.`), 400);

  const responses = (await Promise.all(messages.map((m) => handleOne(config, ctx, m).catch((e): RpcResponse => rpcError(null, RPC.internal, e instanceof Error ? e.message : 'Internal error'))))).filter(
    (r): r is RpcResponse => r !== null,
  );

  if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });

  const single = !isBatch;
  const body = single ? responses[0] : responses;
  const status = single && 'error' in responses[0] && responses[0].id === null ? 400 : 200;
  const accept = request.headers.get('accept') ?? '';
  if (wantsSseOnly(accept)) {
    return new Response(`event: message\ndata: ${safeJson(body)}\n\n`, {
      status,
      headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS },
    });
  }
  return json(body, status);
}
