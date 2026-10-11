/**
 * Loads the live MCP tool registry and server identity for build scripts by bundling the Pages Function modules
 * with esbuild, so docs, cards and server.json are generated from the exact code that serves /mcp.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..', '..');

export async function loadRegistry() {
  const dir = await mkdtemp(join(tmpdir(), 'analytics-registry-'));
  const outfile = join(dir, 'registry.mjs');
  try {
    await build({
      stdin: {
        contents: "export { TOOLS } from './site/functions/_lib/tools.ts'; export { SERVER_INFO, SERVER_VERSION, SITE_URL, INSTRUCTIONS } from './site/functions/_lib/server.ts';",
        resolveDir: root,
        sourcefile: 'registry-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      outfile,
      logLevel: 'silent',
    });
    const mod = await import(pathToFileURL(outfile).href);
    return {
      tools: mod.TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema, annotations: t.annotations })),
      serverInfo: mod.SERVER_INFO,
      version: mod.SERVER_VERSION,
      siteUrl: mod.SITE_URL,
      instructions: mod.INSTRUCTIONS,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const repoRoot = root;
