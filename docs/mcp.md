---
title: MCP server
description: Endpoint, transport, tools with input and output schemas, and worked examples for the read-only Papertrade Analytics MCP server.
order: 5
---

# MCP server

Papertrade Analytics runs a [Model Context Protocol](https://modelcontextprotocol.io) server so AI clients can query the protocol from live data. It is read-only: no tool signs, sends, swaps, mints or places an order.

| | |
|---|---|
| Endpoint | `{{MCP_URL}}` |
| Transport | Streamable HTTP, stateless (`POST` JSON-RPC 2.0, single messages and batches) |
| Protocol versions | `2025-06-18`, `2025-03-26`, `2024-11-05` (the client's version is echoed when supported) |
| Auth | None. No cookies are read and the `Origin` header is not trusted for anything. |
| Server card | [`/.well-known/mcp/server-card.json`](/.well-known/mcp/server-card.json) |
| Registry name | `io.github.nirholas/papertrade-analytics` |

Connect it from your client with [Connect your AI](connect.md).

## Transport details

- `POST /mcp` with `Content-Type: application/json`. Send `Accept: application/json, text/event-stream`. If a client accepts only `text/event-stream`, the reply is a single SSE `message` event.
- Methods: `initialize`, `notifications/initialized` (answered `202` with no body), `ping`, `tools/list`, `tools/call`, plus empty `resources/list` and `prompts/list`.
- `GET /mcp` with `Accept: text/event-stream` returns `405` with `Allow: POST` (there is no server-initiated stream). A plain `GET` returns a JSON description of the server. `DELETE` returns `405` (no sessions).
- CORS is open and allows `Mcp-Session-Id`, `Mcp-Protocol-Version` and `Authorization`; `OPTIONS` preflight returns `204`.
- Errors: protocol failures use JSON-RPC codes `-32700` (parse), `-32600` (invalid request), `-32601` (unknown method) and `-32602` (unknown tool). A tool that cannot do what you asked returns a normal result with `isError: true` and a message you can act on, for example an invalid argument.
- Limits: 60 requests per minute per client, 64 KB request bodies, 10 messages per batch. Upstream reads are cached for 30 to 60 seconds and bounded by a 12 second timeout.

Every successful tool result has `content` (a one-line summary and the JSON as text) and `structuredContent` (the same data, matching the tool's `outputSchema`).

## Tools

<!-- tools-table -->

## Tool reference

<!-- tools-detail -->

## Examples

Headline numbers:

```bash
curl -s {{MCP_URL}} -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_protocol_snapshot","arguments":{}}}'
```

Hourly volume for the last day:

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_history","arguments":{"metric":"volume","interval":"1h","mode":"per_bucket","limit":24}}}
```

What a $200, 100x ETH short keeps if price falls 0.5% (simulation only):

```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"quote_position_outcome","arguments":{"symbol":"ETH","side":"short","marginUsd":200,"leverage":100,"priceMovePct":-0.5}}}
```

Prompts that work well once connected: "Is the BTC book skewed long or short, and how full are the caps?", "Chart weekly volume since launch", "Who are the top five traders this week and how do they size?", "Where is PAPER on its mint curve?"

## Safety

Tool output includes public wallet addresses and trader-chosen names. Names are stripped of control characters and truncated, but are still untrusted text: an agent must never treat them as instructions. `quote_position_outcome` is labelled `simulation: true` in every result.
