/**
 * GET /api/metrics: the headline protocol KPIs, market metrics and PAPER economics as one JSON document.
 * Cached for 30 seconds in the Workers Cache API (X-Cache: HIT or MISS). Documented in /openapi.json.
 */
import { MAINNET } from 'papertrade-sdk';
import { computeMetrics, readOnchain, snapshotFrom } from '../../../src/sources.js';
import type { OnchainReads } from '../../../src/metrics.js';
import { readSnapshots, recordSnapshot, type Env } from '../_lib/snapshots.js';

const TTL_SECONDS = 30;

/** Last on-chain read that succeeded, kept per isolate so a rate-limited RPC does not blank the PAPER numbers. */
let lastOnchain: { at: number; reads: OnchainReads } | null = null;
const STALE_ONCHAIN_MS = 10 * 60_000;

async function onchain(): Promise<OnchainReads | null> {
  const fresh = await readOnchain([MAINNET.network.rpcUrl, ...MAINNET.network.fallbackRpcUrls]);
  if (fresh) {
    lastOnchain = { at: Date.now(), reads: fresh };
    return fresh;
  }
  return lastOnchain && Date.now() - lastOnchain.at < STALE_ONCHAIN_MS ? lastOnchain.reads : null;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };

function jsonResponse(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonResponse({ code: 'method_not_allowed', message: 'Use GET.' }, 405, { allow: 'GET, HEAD, OPTIONS' });

  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(new URL('/api/metrics', request.url).toString(), { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-cache', 'HIT');
    return res;
  }

  try {
    const existing = await readSnapshots(env);
    const { metrics, inputs } = await computeMetrics({
      http: { baseUrl: env.PAPERTRADE_API_URL, retries: 1, timeoutMs: 15_000 },
      snapshots: existing,
      onchain,
    });
    waitUntil(recordSnapshot(env, existing, snapshotFrom(inputs)).then(() => undefined));
    const res = jsonResponse(metrics, 200, { 'cache-control': `public, max-age=${TTL_SECONDS}`, 'x-cache': 'MISS' });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed.';
    return jsonResponse({ code: 'upstream_unavailable', message: `Papertrade data is unavailable right now: ${message}` }, 502, { 'cache-control': 'no-store' });
  }
};
