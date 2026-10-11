/** Renders docs/*.md to static HTML, raw markdown twins and a search index under site/public/docs/. */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSearchIndex, loadPages, pageHtml, renderPages } from './lib/docs.mjs';
import { loadRegistry, repoRoot } from './lib/registry.mjs';

export async function buildDocs({ siteUrl, outDir = join(repoRoot, 'site/public/docs') } = {}) {
  const registry = await loadRegistry();
  const site = (siteUrl ?? process.env.SITE_URL ?? registry.siteUrl).replace(/\/$/, '');
  const loaded = await loadPages({ docsDir: join(repoRoot, 'docs'), changelogPath: join(repoRoot, 'CHANGELOG.md'), registry, siteUrl: site });
  const pages = renderPages(loaded, site);
  await mkdir(outDir, { recursive: true });
  for (const f of await readdir(outDir)) {
    if (f.endsWith('.html') || f.endsWith('.md') || f === 'search-index.json') await rm(join(outDir, f));
  }
  for (const page of pages) {
    await writeFile(join(outDir, `${page.slug}.html`), pageHtml(page, pages, site));
    await writeFile(join(outDir, `${page.slug}.md`), page.twin);
  }
  await writeFile(join(outDir, 'search-index.json'), JSON.stringify(buildSearchIndex(loaded)));
  return { pages, registry, site };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pages } = await buildDocs();
  console.log(`docs: ${pages.length} pages rendered`);
}
