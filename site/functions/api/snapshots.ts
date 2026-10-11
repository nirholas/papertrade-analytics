/**
 * GET /api/snapshots: the recorded house-book samples (LP equity, open interest by market) that /api/metrics
 * appends every five minutes when the SNAPSHOTS KV namespace is bound. Empty list otherwise.
 */
import { readSnapshots, SNAPSHOT_EVERY_MS, type Env } from '../_lib/snapshots.js';

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'public, max-age=30' };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } });
  const snapshots = await readSnapshots(env);
  return new Response(JSON.stringify({ intervalMs: SNAPSHOT_EVERY_MS, recording: Boolean(env.SNAPSHOTS), snapshots }), { headers });
};
