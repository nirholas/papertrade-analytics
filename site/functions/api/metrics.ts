/**
 * GET /api/metrics: the headline protocol KPIs, market metrics and PAPER economics as one JSON document.
 * Cached for 30 seconds in the Workers Cache API (X-Cache: HIT or MISS). Documented in /openapi.json.
 */
import { METRICS_TTL_SECONDS, getMetrics, jsonText } from '../_lib/metrics-source.js';
import type { Env } from '../_lib/snapshots.js';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' };

function jsonResponse(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(jsonText(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS, ...extra },
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'GET' && request.method !== 'HEAD') return jsonResponse({ code: 'method_not_allowed', message: 'Use GET.' }, 405, { allow: 'GET, HEAD, OPTIONS' });

  try {
    const { metrics, hit } = await getMetrics(env, waitUntil);
    return jsonResponse(metrics, 200, { 'cache-control': `public, max-age=${METRICS_TTL_SECONDS}`, 'x-cache': hit ? 'HIT' : 'MISS' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream request failed.';
    return jsonResponse({ code: 'upstream_unavailable', message: `Papertrade data is unavailable right now: ${message}` }, 502, { 'cache-control': 'no-store' });
  }
};
