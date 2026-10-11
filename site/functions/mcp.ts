/** /mcp: the Papertrade Analytics MCP server (Streamable HTTP, stateless, read-only). See _lib/mcp.ts and _lib/tools.ts. */
import { handleMcp } from './_lib/mcp.js';
import { mcpConfig } from './_lib/server.js';
import type { Env } from './_lib/snapshots.js';

export const onRequest: PagesFunction<Env> = ({ request, env, waitUntil }) => handleMcp(request, mcpConfig(env, waitUntil));
