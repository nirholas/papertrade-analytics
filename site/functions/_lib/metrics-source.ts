/**
 * The one place the KPI document is computed and cached, shared by GET /api/metrics and the MCP tools so both
 * return the same numbers from the same 30 second cache entry.
 */
import { MAINNET } from 'papertrade-sdk';
import { computeMetrics, readOnchain, snapshotFrom } from '../../../src/sources.js';
import type { OnchainReads } from '../../../src/metrics.js';
import type { Metrics } from '../../../src/types.js';
import { readSnapshots, recordSnapshot, type Env } from './snapshots.js';

export const METRICS_TTL_SECONDS = 30;
const STALE_ONCHAIN_MS = 10 * 60_000;

/** Last on-chain read that succeeded, kept per isolate so a rate-limited RPC does not blank the PAPER numbers. */
let lastOnchain: { at: number; reads: OnchainReads } | null = null;

async function onchain(): Promise<OnchainReads | null> {
  const fresh = await readOnchain([MAINNET.network.rpcUrl, ...MAINNET.network.fallbackRpcUrls]);
  if (fresh) {
    lastOnchain = { at: Date.now(), reads: fresh };
    return fresh;
  }
  return lastOnchain && Date.now() - lastOnchain.at < STALE_ONCHAIN_MS ? lastOnchain.reads : null;
}

export function workerCache(): Cache | null {
  const c = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  return c ?? null;
}

export const jsonText = (body: unknown): string => JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));

/** Run `fn` unless a fresh copy is in the Workers Cache. Always returns parsed JSON. */
export async function cachedJson<T>(key: string, ttlSeconds: number, waitUntil: (p: Promise<unknown>) => void, fn: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
  const cache = workerCache();
  const cacheKey = new Request(`https://cache.papertrade-analytics.internal/${key}`, { method: 'GET' });
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) return { value: (await hit.json()) as T, hit: true };
  }
  const value = await fn();
  if (cache) {
    waitUntil(cache.put(cacheKey, new Response(jsonText(value), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttlSeconds}` } })));
  }
  return { value, hit: false };
}

export async function getMetrics(env: Env, waitUntil: (p: Promise<unknown>) => void): Promise<{ metrics: Metrics; hit: boolean }> {
  const { value, hit } = await cachedJson<Metrics>('metrics', METRICS_TTL_SECONDS, waitUntil, async () => {
    const existing = await readSnapshots(env);
    const { metrics, inputs } = await computeMetrics({
      http: { baseUrl: env.PAPERTRADE_API_URL, retries: 1, timeoutMs: 15_000 },
      snapshots: existing,
      onchain,
    });
    waitUntil(recordSnapshot(env, existing, snapshotFrom(inputs)).then(() => undefined));
    return metrics;
  });
  return { metrics: value, hit };
}
