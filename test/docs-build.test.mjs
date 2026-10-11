import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { agentCard, apiCatalog, llmsFullTxt, llmsTxt, openApiWithMcp, robotsTxt, serverCard, serverJson, sitemapXml } from '../scripts/lib/discovery.mjs';
import { buildSearchIndex, loadPages, pageHtml, parseFrontMatter, renderPages, slugify } from '../scripts/lib/docs.mjs';
import { loadRegistry, repoRoot } from '../scripts/lib/registry.mjs';
import openapi from '../site/public/openapi.json' with { type: 'json' };

const SITE = 'https://example.test';
let registry;
let loaded;
let pages;

beforeAll(async () => {
  registry = await loadRegistry();
  loaded = await loadPages({ docsDir: join(repoRoot, 'docs'), changelogPath: join(repoRoot, 'CHANGELOG.md'), registry, siteUrl: SITE });
  pages = renderPages(loaded, SITE);
}, 30_000);

describe('front matter and slugs', () => {
  it('parses simple front matter', () => {
    expect(parseFrontMatter('---\ntitle: A\norder: 2\n---\n# Body').data).toEqual({ title: 'A', order: '2' });
  });
  it('slugifies like the heading anchors', () => {
    expect(slugify('OpenAI Codex CLI and IDE extension')).toBe('openai-codex-cli-and-ide-extension');
    expect(slugify('VS Code (GitHub Copilot agent mode)')).toBe('vs-code-github-copilot-agent-mode');
  });
});

describe('docs pages', () => {
  it('has every required page', () => {
    const slugs = loaded.map((p) => p.slug);
    for (const s of ['index', 'quickstart', 'concepts', 'api', 'mcp', 'connect', 'discovery', 'self-hosting', 'security', 'faq', 'changelog']) expect(slugs).toContain(s);
  });

  it('expands every token and generated block', () => {
    for (const p of loaded) {
      expect(p.markdown, p.slug).not.toMatch(/\{\{[A-Z_]+\}\}/);
      expect(p.markdown, p.slug).not.toContain('<!-- tools-');
      expect(p.markdown, p.slug).not.toContain('<!-- changelog -->');
    }
  });

  it('documents every registered tool with its arguments', () => {
    const mcp = loaded.find((p) => p.slug === 'mcp').markdown;
    for (const t of registry.tools) {
      expect(mcp).toContain(`### ${t.name}`);
      for (const arg of Object.keys(t.inputSchema.properties ?? {})) expect(mcp).toContain(`\`${arg}\``);
    }
  });

  it('uses no em or en dash anywhere in the docs sources or output', () => {
    for (const p of pages) expect(p.markdown + p.html, p.slug).not.toMatch(/[–—]/);
  });

  it('only links to pages and anchors that exist', () => {
    const ids = new Map(pages.map((p) => [p.slug, new Set([...p.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))]));
    for (const p of pages) {
      for (const m of p.html.matchAll(/href="\/docs\/([a-z-]*)(?:#([^"]+))?"/g)) {
        const slug = m[1] === '' ? 'index' : m[1];
        expect(ids.has(slug), `${p.slug} links to missing page ${slug}`).toBe(true);
        if (m[2]) expect(ids.get(slug).has(m[2]), `${p.slug} links to missing anchor ${slug}#${m[2]}`).toBe(true);
      }
    }
  });

  it('keeps the landing page client links pointed at real connect anchors', async () => {
    const { readFile } = await import('node:fs/promises');
    const landing = await readFile(join(repoRoot, 'site/public/index.html'), 'utf8');
    const connect = pages.find((p) => p.slug === 'connect');
    const ids = new Set([...connect.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
    for (const m of landing.matchAll(/href="\/docs\/connect#([^"]+)"/g)) expect(ids.has(m[1]), m[1]).toBe(true);
  });

  it('renders copy buttons, canonical URL, prev/next and no inline script or style', () => {
    const mcp = pages.find((p) => p.slug === 'mcp');
    const out = pageHtml(mcp, pages, SITE);
    expect(out).toContain('class="copy"');
    expect(out).toContain(`<link rel="canonical" href="${SITE}/docs/mcp">`);
    expect(out).toContain('class="prev"');
    expect(out).toContain('class="next"');
    expect(out).not.toMatch(/<script(?![^>]*\bsrc=)(?![^>]*ld\+json)[^>]*>/);
    expect(out).not.toMatch(/\sstyle="/);
  });

  it('makes the markdown twin self-contained with absolute links', () => {
    const connect = pages.find((p) => p.slug === 'connect');
    expect(connect.twin).toContain(`${SITE}/mcp`);
    expect(connect.twin).not.toMatch(/\]\([a-z-]+\.md/);
    expect(connect.twin).not.toMatch(/\]\(\/[a-z.]/);
  });

  it('builds a search index with heading anchors that exist', () => {
    const index = buildSearchIndex(loaded);
    expect(index.length).toBeGreaterThan(30);
    const ids = new Map(pages.map((p) => [p.slug, new Set([...p.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))]));
    for (const e of index) if (e.a) expect(ids.get(e.p).has(e.a), `${e.p}#${e.a}`).toBe(true);
    expect(index.some((e) => /quote_position_outcome/.test(e.x + e.h))).toBe(true);
  });
});

describe('discovery documents', () => {
  it('server card lists every tool and the streamable-http endpoint', () => {
    const card = serverCard({ registry, siteUrl: SITE });
    expect(card.transport).toEqual({ type: 'streamable-http', endpoint: `${SITE}/mcp` });
    expect(card.tools.map((t) => t.name)).toEqual(registry.tools.map((t) => t.name));
    expect(card.serverInfo.version).toBe(registry.version);
  });

  it('agent card maps one skill per tool', () => {
    const card = agentCard({ registry, siteUrl: SITE });
    expect(card.skills.map((s) => s.id)).toEqual(registry.tools.map((t) => t.name));
    expect(card.url).toBe(SITE);
    expect(card.defaultOutputModes.length).toBeGreaterThan(0);
  });

  it('api catalog is an RFC 9727 linkset covering openapi and mcp', () => {
    const { linkset } = apiCatalog({ siteUrl: SITE });
    expect(linkset.map((l) => l.anchor)).toEqual([`${SITE}/api/metrics`, `${SITE}/mcp`]);
    expect(linkset[0]['service-desc'][0].href).toBe(`${SITE}/openapi.json`);
  });

  it('server.json fits the registry rules', () => {
    const s = serverJson({ registry, siteUrl: SITE });
    expect(s.name).toBe('io.github.nirholas/papertrade-analytics');
    expect(s.description.length).toBeLessThanOrEqual(100);
    expect(s.remotes).toEqual([{ type: 'streamable-http', url: `${SITE}/mcp` }]);
  });

  it('llms.txt links every docs page as markdown and llms-full inlines them all', () => {
    const txt = llmsTxt({ pages: loaded, registry, siteUrl: SITE });
    const full = llmsFullTxt({ pages, siteUrl: SITE });
    for (const p of loaded) expect(txt).toContain(`(${SITE}/docs/${p.slug}.md)`);
    for (const t of registry.tools) expect(txt).toContain(`\`${t.name}\``);
    expect(full.length).toBeGreaterThan(20_000);
    for (const p of pages) expect(full).toContain(`Page: ${SITE}/docs/${p.slug === 'index' ? '' : p.slug}`);
  });

  it('robots.txt carries Content-Signal and explicit allows for the AI crawlers', () => {
    const txt = robotsTxt({ siteUrl: SITE });
    expect(txt).toMatch(/Content-Signal: .*search=yes/);
    for (const bot of ['GPTBot', 'ClaudeBot', 'Claude-User', 'OAI-SearchBot', 'Google-Extended', 'PerplexityBot']) expect(txt).toMatch(new RegExp(`User-agent: ${bot}\\nAllow: /`));
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });

  it('sitemap includes every docs page', () => {
    const xml = sitemapXml({ pages, siteUrl: SITE, date: '2026-10-11' });
    expect(xml).toContain(`<loc>${SITE}/docs/</loc>`);
    for (const p of pages.filter((x) => x.slug !== 'index')) expect(xml).toContain(`<loc>${SITE}/docs/${p.slug}</loc>`);
  });

  it('openapi gains the mcp endpoint and stays 3.1 with the same version as the server', () => {
    const spec = openApiWithMcp(openapi, { registry, siteUrl: SITE });
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.version).toBe(registry.version);
    expect(Object.keys(spec.paths['/mcp'])).toEqual(['post', 'get']);
    expect(spec.paths['/api/metrics']).toBeTruthy();
    expect(JSON.stringify(spec)).not.toMatch(/[–—]/);
  });
});
