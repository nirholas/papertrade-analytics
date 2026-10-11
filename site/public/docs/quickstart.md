# Quickstart

## 1. Read the numbers

No key, no signup, CORS open.

```bash
curl -s https://papertrade-analytics.pages.dev/api/metrics | jq '.protocol | {tvlUsd, volume24hUsd, openPositions, openNotionalUsd}'
```

The response carries an `X-Cache` header (`HIT` or `MISS`). Data is at most 30 seconds old.

## 2. Ask the MCP server

`/mcp` is a stateless Streamable HTTP endpoint. Any JSON-RPC 2.0 client works, including curl:

```bash
curl -s https://papertrade-analytics.pages.dev/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_protocol_snapshot","arguments":{}}}' \
  | jq '.result.structuredContent.protocol'
```

List the tools with `{"method":"tools/list"}`. To use it from an AI client instead, add the URL as a remote MCP server: see [Connect your AI](https://papertrade-analytics.pages.dev/docs/connect.md). The shortest path in Claude Code:

```bash
claude mcp add --transport http papertrade-analytics https://papertrade-analytics.pages.dev/mcp
```

Then ask: "What is Papertrade's TVL and how has daily volume trended over the last two weeks?"

## 3. Run it locally

```bash
git clone https://github.com/nirholas/papertrade-analytics && cd papertrade-analytics
npm install ../papertrade-sdk-0.1.0.tgz viem   # the SDK is not on npm yet
npm install
npm run dev:site        # builds the app and docs, serves http://localhost:8791 with a local KV
```

`npm run build:site` bundles the browser app and renders these docs, the discovery files and `llms-full.txt` into `site/public/`. `npm test` runs the unit tests on recorded live responses; `npm run test:live` runs the same pipeline against production.

## 4. Embed it

Append `?embed=1` to the dashboard URL to hide the marketing chrome and show just the product. The site allows framing by `papertrade-os.pages.dev` and other `*.pages.dev` hosts, so it also opens as a window in [Papertrade OS](https://papertrade-os.pages.dev/?open=analytics).
