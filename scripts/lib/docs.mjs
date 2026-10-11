/**
 * Docs rendering: front matter, token expansion, tool tables generated from the live registry, markdown to HTML,
 * search index and raw-markdown twins. Pure functions: nothing here touches the disk except loadPages.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Marked } from 'marked';

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function slugify(text) {
  return String(text).toLowerCase().replace(/<[^>]+>/g, '').replace(/`/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
}

export function parseFrontMatter(source) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!m) return { data: {}, body: source };
  const data = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, body: source.slice(m[0].length) };
}

const typeOf = (p) => (p.enum ? p.enum.map((v) => `\`${v}\``).join(' or ') : Array.isArray(p.type) ? p.type.join(' or ') : p.type || 'any');
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function toolsTable(tools) {
  const rows = tools.map((t) => `| [\`${t.name}\`](#${slugify(t.name)}) | ${cell(t.title)} | ${cell(t.description.split('. ')[0].replace(/\.$/, ''))}. |`);
  return ['| Tool | Title | What it does |', '|---|---|---|', ...rows].join('\n');
}

function paramTable(schema) {
  const props = schema.properties ?? {};
  const names = Object.keys(props);
  if (!names.length) return 'No arguments.';
  const required = new Set(schema.required ?? []);
  const rows = names.map((n) => {
    const p = props[n];
    const bits = [];
    if (p.default !== undefined) bits.push(`default \`${JSON.stringify(p.default)}\``);
    if (p.minimum !== undefined || p.maximum !== undefined) bits.push(`range ${p.minimum ?? ''} to ${p.maximum ?? ''}`);
    return `| \`${n}\` | ${typeOf(p)} | ${required.has(n) ? 'yes' : 'no'} | ${cell(p.description ?? '')}${bits.length ? ` (${bits.join(', ')})` : ''} |`;
  });
  return ['| Argument | Type | Required | Description |', '|---|---|---|---|', ...rows].join('\n');
}

export function toolsDetail(tools) {
  return tools
    .map((t) => {
      const outputs = Object.keys(t.outputSchema?.properties ?? {}).map((k) => `\`${k}\``).join(', ');
      return [
        `### ${t.name}`,
        '',
        t.description,
        '',
        paramTable(t.inputSchema),
        '',
        `Returns: ${outputs}. Annotations: read-only, non-destructive, idempotent.`,
      ].join('\n');
    })
    .join('\n\n');
}

export function expand(markdown, ctx) {
  const mcpUrl = `${ctx.siteUrl}/mcp`;
  return markdown
    .replaceAll('{{SITE}}', ctx.siteUrl)
    .replaceAll('{{MCP_URL}}', mcpUrl)
    .replaceAll('{{TOOL_COUNT}}', String(ctx.registry.tools.length))
    .replaceAll('<!-- tools-table -->', toolsTable(ctx.registry.tools))
    .replaceAll('<!-- tools-detail -->', toolsDetail(ctx.registry.tools))
    .replaceAll('<!-- changelog -->', ctx.changelog ?? '');
}

export async function loadPages({ docsDir, changelogPath, registry, siteUrl }) {
  const files = (await readdir(docsDir)).filter((f) => f.endsWith('.md')).sort();
  const changelogRaw = await readFile(changelogPath, 'utf8');
  const changelog = changelogRaw.replace(/^# .*\n+/, '').replace(/^## (.*)$/gm, '## $1');
  const pages = [];
  for (const file of files) {
    const { data, body } = parseFrontMatter(await readFile(join(docsDir, file), 'utf8'));
    const slug = file.replace(/\.md$/, '');
    if (!data.title || !data.description) throw new Error(`docs/${file} needs title and description front matter`);
    pages.push({ slug, file, title: data.title, description: data.description, order: Number(data.order ?? 99), markdown: expand(body.trim() + '\n', { siteUrl, registry, changelog }) });
  }
  pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return pages;
}

export const pageUrl = (siteUrl, slug) => (slug === 'index' ? `${siteUrl}/docs/` : `${siteUrl}/docs/${slug}`);
export const pagePath = (slug) => (slug === 'index' ? '/docs/' : `/docs/${slug}`);

function rewriteHref(href) {
  const m = /^([a-z0-9-]+)\.md(#.*)?$/.exec(href);
  return m ? `${pagePath(m[1])}${m[2] ?? ''}` : href;
}

/** Markdown for agents: relative links made absolute so a lone .md file still resolves. */
export function twinMarkdown(page, siteUrl) {
  const body = page.markdown
    .replace(/\]\(([a-z0-9-]+)\.md(#[^)]*)?\)/g, (_m, slug, hash) => `](${siteUrl}/docs/${slug}.md${hash ?? ''})`)
    .replace(/\]\(\/(?!\/)/g, `](${siteUrl}/`);
  return `${body.trimEnd()}\n`;
}

function createRenderer() {
  const marked = new Marked({ gfm: true });
  let toc = [];
  const used = new Set();
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const inner = this.parser.parseInline(tokens);
        let id = slugify(text);
        for (let n = 2; used.has(id); n++) id = `${slugify(text)}-${n}`;
        used.add(id);
        if (depth === 2 || depth === 3) toc.push({ id, depth, text: text.replace(/`/g, '') });
        const anchor = depth > 1 ? `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a>` : '';
        return `<h${depth} id="${id}">${inner}${anchor}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang ?? '').split(/\s/)[0];
        return `<div class="code-block"><button type="button" class="copy" aria-label="Copy code">Copy</button><pre tabindex="0"><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(text)}</code></pre></div>\n`;
      },
      link({ href, title, tokens }) {
        const target = rewriteHref(href);
        const external = /^https?:\/\//.test(target) && !target.startsWith('https://papertrade-analytics.pages.dev');
        const attrs = `${title ? ` title="${escapeHtml(title)}"` : ''}${external ? ' rel="noopener"' : ''}`;
        return `<a href="${escapeHtml(target)}"${attrs}>${this.parser.parseInline(tokens)}</a>`;
      },
      table({ header, rows }) {
        const head = header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('');
        const body = rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>\n`;
      },
    },
  });
  return {
    render(markdown) {
      toc = [];
      used.clear();
      const html = marked.parse(markdown);
      return { html, toc };
    },
  };
}

const plain = (md) =>
  md
    .replace(/```[a-z]*\n?/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_>|#]/g, ' ')
    .replace(/^-{3,}$/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function searchEntries(page) {
  const lines = page.markdown.split('\n');
  const sections = [];
  let current = { heading: page.title, id: '', text: [] };
  let inFence = false;
  const used = new Set();
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const h = !inFence && /^(#{2,3}) (.*)$/.exec(line);
    if (h) {
      sections.push(current);
      let id = slugify(h[2]);
      for (let n = 2; used.has(id); n++) id = `${slugify(h[2])}-${n}`;
      used.add(id);
      current = { heading: h[2].replace(/`/g, ''), id, text: [] };
    } else if (!/^# /.test(line)) current.text.push(line);
  }
  sections.push(current);
  return sections
    .map((s) => ({ p: page.slug, t: page.title, h: s.heading, a: s.id, x: plain(s.text.join('\n')).slice(0, 1400) }))
    .filter((s) => s.x.length > 0);
}

export function buildSearchIndex(pages) {
  return pages.flatMap(searchEntries);
}

export function renderPages(pages, siteUrl) {
  const renderer = createRenderer();
  return pages.map((page, i) => {
    const { html, toc } = renderer.render(page.markdown);
    return { ...page, html, toc, prev: pages[i - 1] ?? null, next: pages[i + 1] ?? null, twin: twinMarkdown(page, siteUrl) };
  });
}

const THEME_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a9 9 0 1 0 9 9c0-.5 0-.9-.1-1.3A5.5 5.5 0 0 1 13.3 3.1 9 9 0 0 0 12 3z"/></svg>';

export function pageHtml(page, pages, siteUrl) {
  const canonical = pageUrl(siteUrl, page.slug);
  const nav = pages
    .map((p) => `<li><a href="${pagePath(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${escapeHtml(p.title)}</a></li>`)
    .join('');
  const toc = page.toc.length
    ? `<nav class="toc" aria-label="On this page"><h2>On this page</h2><ul>${page.toc.map((t) => `<li class="d${t.depth}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`).join('')}</ul></nav>`
    : '';
  const pn = (p, dir) => (p ? `<a class="${dir}" href="${pagePath(p.slug)}"><span>${dir === 'prev' ? 'Previous' : 'Next'}</span>${escapeHtml(p.title)}</a>` : '<span></span>');
  const title = page.slug === 'index' ? 'Papertrade Analytics documentation' : `${page.title} | Papertrade Analytics docs`;
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'TechArticle', headline: page.title, description: page.description, url: canonical, inLanguage: 'en', license: 'https://www.apache.org/licenses/LICENSE-2.0', isPartOf: { '@type': 'WebSite', name: 'Papertrade Analytics', url: siteUrl } });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="${siteUrl}/docs/${page.slug}.md">
<link rel="alternate" type="text/plain" href="${siteUrl}/llms.txt" title="llms.txt">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23c2410c'/%3E%3Cpath d='M7 24V15m6 9V9m6 15v-7m6 7V12' stroke='%23fff7ec' stroke-width='3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="/docs/docs.css">
<script src="/docs/docs.js" defer></script>
<script type="application/ld+json">${ld.replace(/</g, '\\u003c')}</script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="bar">
  <button type="button" class="icon menu" id="menu" aria-label="Open navigation" aria-expanded="false" aria-controls="side"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
  <a class="brand" href="/docs/" aria-label="Papertrade Analytics docs, home"><svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><rect width="32" height="32" rx="6"/><path d="M7 24V15m6 9V9m6 15v-7m6 7V12"/></svg><span>Papertrade <b>Analytics</b> <em>docs</em></span></a>
  <button type="button" class="search-open" id="search-open" aria-label="Search the docs" aria-keyshortcuts="/"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>/</kbd></button>
  <nav class="links" aria-label="Site"><a href="/">Dashboard</a><a href="https://github.com/nirholas/papertrade-analytics">GitHub</a><a href="/llms.txt">llms.txt</a><a href="/mcp">MCP</a></nav>
  <button type="button" class="icon" id="theme" aria-label="Toggle dark and light theme">${THEME_ICON}</button>
</header>
<div class="shell">
  <aside class="side" id="side" aria-label="Documentation"><nav><ul>${nav}</ul></nav><p class="side-note"><a href="/docs/${page.slug}.md">View as markdown</a></p></aside>
  <main id="content" class="doc">
    <article>
${page.html}
    </article>
    <nav class="pager" aria-label="Pages">${pn(page.prev, 'prev')}${pn(page.next, 'next')}</nav>
    <footer class="doc-foot"><p>Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin. Not financial advice. <a href="https://github.com/nirholas/papertrade-analytics/edit/main/docs/${page.file}">Edit this page</a>.</p></footer>
  </main>
  ${toc}
</div>
<div class="search" id="search" role="dialog" aria-modal="true" aria-label="Search the docs" hidden>
  <div class="search-box">
    <input id="search-input" type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false" aria-label="Search query" aria-controls="search-results">
    <ul id="search-results" role="listbox" aria-label="Results"></ul>
    <p class="search-hint" id="search-hint">Type to search. Enter opens the first result, Esc closes.</p>
  </div>
</div>
</body>
</html>
`;
}
