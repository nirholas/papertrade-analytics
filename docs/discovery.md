---
title: Agent discovery
description: The well-known files, cards and text indexes that let agents find the MCP server, the API and these docs without a human.
order: 7
---

# Agent discovery

Everything an agent needs to find and use this project is served as real files at stable paths. They are generated at build time from the same tool registry the server runs, so they cannot drift from the code.

| Path | Content-Type | Purpose |
|---|---|---|
| [`/.well-known/mcp/server-card.json`](/.well-known/mcp/server-card.json) | `application/json` | MCP server card: server info, the streamable-http endpoint, capabilities and the full tool list. |
| [`/.well-known/mcp.json`](/.well-known/mcp.json) | `application/json` | Alias of the server card. |
| [`/.well-known/agent-card.json`](/.well-known/agent-card.json) | `application/json` | A2A agent card: name, description, skills mapped from the MCP tools, input and output modes, provider. |
| [`/.well-known/agent.json`](/.well-known/agent.json) | `application/json` | Alias of the agent card. |
| [`/.well-known/api-catalog`](/.well-known/api-catalog) | `application/linkset+json` | RFC 9727 API catalog linking the OpenAPI document, the MCP endpoint, the docs and `llms.txt`. |
| [`/openapi.json`](/openapi.json) | `application/json` | OpenAPI 3.1 for `/api/metrics`, `/api/snapshots` and `/mcp`. |
| [`/llms.txt`](/llms.txt) | `text/plain` | Short index for language models, with links to every docs page as raw markdown. |
| [`/llms-full.txt`](/llms-full.txt) | `text/plain` | Every docs page inlined in one file. |
| [`/robots.txt`](/robots.txt) | `text/plain` | Content-Signal and explicit allow for GPTBot, ClaudeBot, Claude-User, OAI-SearchBot, Google-Extended and PerplexityBot. |
| [`/sitemap.xml`](/sitemap.xml) | `application/xml` | Every page, including each docs page. |

Every docs page also exists as raw markdown at the same path plus `.md`, for example `{{SITE}}/docs/mcp.md`.

The home page sends `Link` response headers with `rel="service-desc"` (OpenAPI), `rel="api-catalog"` and `rel="mcp"` (the server card), so a client that only does a `HEAD /` can find the rest.

## Registry listing

`server.json` at the repository root describes the server for the official MCP registry under `io.github.nirholas/papertrade-analytics` with a streamable-http remote at the live `/mcp`. `glama.json` supports Glama. Publishing to the registry is a manual step by the maintainer.
