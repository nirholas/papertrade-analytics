import type { Snapshot } from '../../../src/types.js';

export interface Env {
  PAPERTRADE_API_URL?: string;
  SNAPSHOTS?: KVNamespace;
}

export const SNAPSHOT_KEY = 'house-book';
/** Minimum gap between recorded samples, and how many are kept (10 days at 5 minutes). */
export const SNAPSHOT_EVERY_MS = 300_000;
export const SNAPSHOT_MAX = 2880;

export async function readSnapshots(env: Env): Promise<Snapshot[]> {
  if (!env.SNAPSHOTS) return [];
  try {
    const stored = await env.SNAPSHOTS.get<Snapshot[]>(SNAPSHOT_KEY, 'json');
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

/** Append a sample unless the newest one is younger than SNAPSHOT_EVERY_MS. Returns the list as stored. */
export async function recordSnapshot(env: Env, existing: readonly Snapshot[], next: Snapshot): Promise<Snapshot[]> {
  const last = existing[existing.length - 1];
  if (!env.SNAPSHOTS || (last && next.t - last.t < SNAPSHOT_EVERY_MS)) return [...existing];
  const list = [...existing, next].slice(-SNAPSHOT_MAX);
  try {
    await env.SNAPSHOTS.put(SNAPSHOT_KEY, JSON.stringify(list));
  } catch {
    return [...existing];
  }
  return list;
}
