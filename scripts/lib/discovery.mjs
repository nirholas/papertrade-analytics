/** Agent discovery documents, all derived from the live tool registry and the rendered docs pages. */
import { pagePath, pageUrl } from './docs.mjs';

const MCP_PROTOCOL = '2025-06-18';
const REPO = 'https://github.com/nirholas/papertrade-analytics';
const DESCRIPTION = 'Unofficial live analytics for Papertrade, the 1000x synthetic perps exchange on HyperEVM: TVL, volume, open interest, market skew, PAPER economics and leaderboard insights. Read-only.';

export function serverCard({ registry, siteUrl }) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
    version: '1.0',
    protocolVersion: MCP_PROTOCOL,
    serverInfo: { name: registry.serverInfo.name, title: registry.serverInfo.title, version: registry.version },
    description: DESCRIPTION,
    documentationUrl: `${siteUrl}/docs/mcp`,
    repository: { url: REPO, source: 'github' },
    license: 'Apache-2.0',
    transport: { type: 'streamable-http', endpoint: `${siteUrl}/mcp` },
    capabilities: { tools: { listChanged: false } },
    authentication: { required: false, schemes: [] },
    instructions: registry.instructions,
    tools: registry.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, outputSchema: t.outputSchema, annotations: t.annotations })),
  };
}

const TAGS = {
  get_protocol_snapshot: ['tvl', 'volume', 'open-interest', 'kpi'],
  get_history: ['time-series', 'tvl', 'volume', 'history'],
  get_open_interest: ['open-interest', 'skew', 'risk'],
  get_paper_economics: ['paper', 'staking', 'tokenomics'],
  get_market_stats: ['markets', 'btc', 'eth', 'prices'],
  get_top_traders: ['leaderboard', 'traders', 'pnl'],
  get_position_insights: ['positions', 'leverage', 'distribution'],
  quote_position_outcome: ['simulation', 'settlement', 'leverage'],
};

export function agentCard({ registry, siteUrl }) {
  return {
    protocolVersion: '0.3.0',
    name: registry.serverInfo.title,
    description: `${DESCRIPTION} Skills are invoked through the MCP server at ${siteUrl}/mcp (Streamable HTTP, no authentication); the same data is available over REST at ${siteUrl}/api/metrics.`,
    url: siteUrl,
    version: registry.version,
    documentationUrl: `${siteUrl}/docs/`,
    provider: { organization: 'nirholas', url: 'https://github.com/nirholas' },
    iconUrl: `${siteUrl}/favicon.svg`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
      extensions: [{ uri: 'https://modelcontextprotocol.io/specification/2025-06-18', description: `Skills map one to one onto the MCP tools served at ${siteUrl}/mcp.`, required: false }],
    },
    securitySchemes: {},
    security: [],
    defaultInputModes: ['application/json', 'text/plain'],
    defaultOutputModes: ['application/json', 'text/plain'],
    skills: registry.tools.map((t) => ({
      id: t.name,
      name: t.title,
      description: t.description,
      tags: ['papertrade', 'hyperevm', 'read-only', ...(TAGS[t.name] ?? [])],
      inputModes: ['application/json'],
      outputModes: ['application/json'],
    })),
    supportsAuthenticatedExtendedCard: false,
  };
}

export function apiCatalog({ siteUrl }) {
  const mcpUrl = `${siteUrl}/mcp`;
  return {
    linkset: [
      {
        anchor: `${siteUrl}/api/metrics`,
        'service-desc': [{ href: `${siteUrl}/openapi.json`, type: 'application/json' }],
        'service-doc': [{ href: `${siteUrl}/docs/api`, type: 'text/html' }],
        'service-meta': [{ href: `${siteUrl}/llms.txt`, type: 'text/plain' }],
      },
      {
        anchor: mcpUrl,
        'service-desc': [{ href: `${siteUrl}/.well-known/mcp/server-card.json`, type: 'application/json' }],
        'service-doc': [{ href: `${siteUrl}/docs/mcp`, type: 'text/html' }],
        'service-meta': [{ href: `${siteUrl}/llms.txt`, type: 'text/plain' }],
      },
    ],
  };
}

export function serverJson({ registry, siteUrl }) {
  return {
    $schema: 'https://static.modelcontextprotocol.io/schemas/2025-09-29/server.schema.json',
    name: 'io.github.nirholas/papertrade-analytics',
    description: 'Read-only live Papertrade analytics: TVL, volume, open interest, PAPER economics, leaderboard.',
    status: 'active',
    repository: { url: REPO, source: 'github' },
    version: registry.version,
    websiteUrl: `${siteUrl}/docs/`,
    remotes: [{ type: 'streamable-http', url: `${siteUrl}/mcp` }],
  };
}

export function llmsTxt({ pages, registry, siteUrl }) {
  const docs = pages.map((p) => `- [${p.title}](${siteUrl}/docs/${p.slug}.md): ${p.description}`).join('\n');
  const tools = registry.tools.map((t) => `- \`${t.name}\`: ${t.description.split('. ')[0].replace(/\.$/, '')}.`).join('\n');
  return `# Papertrade Analytics

> ${DESCRIPTION} Free JSON API and a keyless MCP server. Unofficial, not affiliated with Papertrade.

Use the MCP server for tool calling, the REST API for plain HTTP. Nothing here signs, sends or trades. High leverage can lose your whole margin; this is data, not financial advice.

## Connect

- MCP endpoint (Streamable HTTP, no auth): ${siteUrl}/mcp
- [Connect your AI](${siteUrl}/docs/connect.md): setup for Claude, Codex, ChatGPT, Gemini, Cursor, VS Code, Windsurf, Zed, Cline, Goose, Continue
- [OpenAPI 3.1](${siteUrl}/openapi.json)
- [MCP server card](${siteUrl}/.well-known/mcp/server-card.json)
- [A2A agent card](${siteUrl}/.well-known/agent-card.json)
- [API catalog](${siteUrl}/.well-known/api-catalog)

## REST API (no key, CORS open, 30s edge cache)

- GET ${siteUrl}/api/metrics : JSON. \`protocol\` (tvlUsd, marginUsd, lpUsd, reserveUsd, queueUsd, allTimeVolumeUsd, volume24hUsd, openPositions, traders, trades), \`deltas\` (24h and 7d changes, \`partial\` when history is shorter than the window), \`markets[]\` (BTC and ETH: priceUsd, change24hPct, change7dPct, volume24hUsd, openLongUsd, openShortUsd, longShare, cap utilization, maxLeverage, flags, impact parameters, keepsExample), \`paper\` (supply, mintRate, phase, stakedShare, curve), \`staking\`. All USD values are plain numbers.
- GET ${siteUrl}/api/snapshots : recorded house-book samples (empty unless a KV namespace is bound).

## Notes

- \`source.onchain=false\` means the HyperEVM RPC was rate-limited and PAPER supply came from the indexer.
- Volume, PnL, trades and users in protocol history are cumulative; deltas are computed from them.

## MCP tools

${tools}

## Docs

${docs}

## Optional

- [Full documentation in one file](${siteUrl}/llms-full.txt)
- [Dashboard](${siteUrl}/)
- [Source code](${REPO})
`;
}

export function llmsFullTxt({ pages, siteUrl }) {
  const header = `# Papertrade Analytics: full documentation\n\n> ${DESCRIPTION}\n\nSource: ${siteUrl}/docs/ . Index: ${siteUrl}/llms.txt\n`;
  return `${header}\n${pages.map((p) => `---\n\nPage: ${pageUrl(siteUrl, p.slug)}\n\n${p.twin.trim()}\n`).join('\n')}`;
}

export function robotsTxt({ siteUrl }) {
  const allowed = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'Google-Extended', 'PerplexityBot', 'Perplexity-User'];
  const blocks = allowed.map((ua) => `User-agent: ${ua}\nAllow: /`).join('\n\n');
  return `# Papertrade Analytics is open data and open source. Agents are welcome.
# Machine-readable entry points: /llms.txt, /openapi.json, /.well-known/mcp/server-card.json

User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=no
Allow: /
Disallow: /api/papertrade/

${blocks}

Sitemap: ${siteUrl}/sitemap.xml
`;
}

export function sitemapXml({ pages, siteUrl, date }) {
  const urls = [
    `${siteUrl}/`,
    ...pages.map((p) => pageUrl(siteUrl, p.slug)),
    `${siteUrl}/openapi.json`,
    `${siteUrl}/llms.txt`,
    `${siteUrl}/llms-full.txt`,
    `${siteUrl}/.well-known/mcp/server-card.json`,
    `${siteUrl}/.well-known/agent-card.json`,
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${date}</lastmod></url>`).join('\n')}\n</urlset>\n`;
}

export { pagePath };

const RPC_ERROR = { type: 'object', properties: { jsonrpc: { const: '2.0' }, id: { type: ['string', 'integer', 'null'] }, error: { type: 'object', properties: { code: { type: 'integer' }, message: { type: 'string' } }, required: ['code', 'message'] } }, required: ['jsonrpc', 'error'] };

/** Adds the MCP and discovery endpoints to the hand-written OpenAPI document. Idempotent. */
export function openApiWithMcp(spec, { registry, siteUrl }) {
  const toolList = registry.tools.map((t) => `${t.name} (${t.title})`).join(', ');
  const next = structuredClone(spec);
  next.info.version = registry.version;
  next.servers = [{ url: siteUrl }];
  next.externalDocs = { description: 'Documentation', url: `${siteUrl}/docs/` };
  next.paths['/mcp'] = {
    post: {
      operationId: 'mcp',
      summary: 'Model Context Protocol server (Streamable HTTP, stateless, read-only)',
      description: `JSON-RPC 2.0 over HTTP. Supports initialize, notifications/initialized, ping, tools/list, tools/call, resources/list and prompts/list, as single messages or batches of up to 10. Tools: ${toolList}. No authentication. 60 requests per minute per client. Nothing here signs, sends or trades.`,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object', properties: { jsonrpc: { const: '2.0' }, id: { type: ['string', 'integer'] }, method: { type: 'string', examples: ['tools/list', 'tools/call'] }, params: { type: 'object' } }, required: ['jsonrpc', 'method'] },
            examples: { listTools: { value: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }, snapshot: { value: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_protocol_snapshot', arguments: {} } } } },
          },
        },
      },
      responses: {
        200: { description: 'JSON-RPC response, or a single SSE message event when the client accepts only text/event-stream.', content: { 'application/json': { schema: { type: 'object' } }, 'text/event-stream': { schema: { type: 'string' } } } },
        202: { description: 'Notification accepted. No body.' },
        400: { description: 'Parse error or invalid request.', content: { 'application/json': { schema: RPC_ERROR } } },
        413: { description: 'Request body over 64 KB.' },
        429: { description: 'Rate limit exceeded. Retry-After says when.' },
      },
    },
    get: {
      operationId: 'mcpInfo',
      summary: 'Describe the MCP server',
      description: 'Returns JSON with the server identity, tools and links to the docs. A GET that accepts only text/event-stream returns 405 (there is no server-initiated stream).',
      responses: { 200: { description: 'Server description.', content: { 'application/json': { schema: { type: 'object' } } } }, 405: { description: 'No SSE stream. Use POST.' } },
    },
  };
  next.paths['/.well-known/mcp/server-card.json'] = {
    get: { operationId: 'getMcpServerCard', summary: 'MCP server card', responses: { 200: { description: 'Server card with the full tool list.', content: { 'application/json': { schema: { type: 'object' } } } } } },
  };
  next.paths['/.well-known/agent-card.json'] = {
    get: { operationId: 'getAgentCard', summary: 'A2A agent card', responses: { 200: { description: 'Agent card with one skill per MCP tool.', content: { 'application/json': { schema: { type: 'object' } } } } } },
  };
  next.paths['/llms.txt'] = {
    get: { operationId: 'getLlmsTxt', summary: 'Index for language models', responses: { 200: { description: 'Plain text.', content: { 'text/plain': { schema: { type: 'string' } } } } } },
  };
  return next;
}
