/** Writes the agent discovery files (server card, agent card, API catalog, llms*.txt, robots, sitemap, server.json). */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildDocs } from './build-docs.mjs';
import { agentCard, apiCatalog, llmsFullTxt, llmsTxt, openApiWithMcp, robotsTxt, serverCard, serverJson, sitemapXml } from './lib/discovery.mjs';
import { repoRoot } from './lib/registry.mjs';

const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

export async function buildDiscovery() {
  const { pages, registry, site } = await buildDocs();
  const pub = join(repoRoot, 'site/public');
  const wk = join(pub, '.well-known');
  await mkdir(join(wk, 'mcp'), { recursive: true });
  const ctx = { pages, registry, siteUrl: site };
  const card = json(serverCard(ctx));
  const agent = json(agentCard(ctx));
  const llms = llmsTxt(ctx);
  const openapi = JSON.parse(await readFile(join(pub, 'openapi.json'), 'utf8'));
  const date = new Date().toISOString().slice(0, 10);
  const files = {
    [join(wk, 'mcp/server-card.json')]: card,
    [join(wk, 'mcp.json')]: card,
    [join(wk, 'agent-card.json')]: agent,
    [join(wk, 'agent.json')]: agent,
    [join(wk, 'api-catalog')]: json(apiCatalog(ctx)),
    [join(pub, 'llms.txt')]: llms,
    [join(repoRoot, 'llms.txt')]: llms,
    [join(pub, 'llms-full.txt')]: llmsFullTxt(ctx),
    [join(pub, 'openapi.json')]: json(openApiWithMcp(openapi, ctx)),
    [join(pub, 'robots.txt')]: robotsTxt(ctx),
    [join(pub, 'sitemap.xml')]: sitemapXml({ ...ctx, date }),
    [join(repoRoot, 'server.json')]: json(serverJson(ctx)),
  };
  for (const [path, body] of Object.entries(files)) await writeFile(path, body);
  return { pages: pages.length, files: Object.keys(files).length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await buildDiscovery();
  console.log(`discovery: ${r.files} files written, ${r.pages} docs pages`);
}
