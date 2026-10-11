# Changelog

## 0.2.0 - 2026-10-11

- Read-only MCP server at `/mcp` (Streamable HTTP, stateless) with eight tools: `get_protocol_snapshot`, `get_history`, `get_open_interest`, `get_paper_economics`, `get_market_stats`, `get_top_traders`, `get_position_insights` and the simulation-only `quote_position_outcome`.
- Docs site at `/docs/` with search, per-page markdown twins, a Connect your AI guide for Claude, Codex, ChatGPT, Gemini, Cursor, VS Code, Windsurf, Zed, Cline, Goose and Continue, and a generated `llms-full.txt`.
- Agent discovery: MCP server card, A2A agent card, RFC 9727 API catalog, richer `robots.txt`, `Link` headers, `server.json` for the MCP registry.
- `?embed=1` mode, an "Open in Papertrade OS" link, and framing allowed for Papertrade OS.
- `/api/metrics` and the MCP tools share one 30 second cache.

## 0.1.0 - 2026-10-10

First release.

- Headline KPIs with 24h and 7d changes, PAPER supply read on-chain with indexer fallback.
- Time series charts for TVL, volume, LP, open interest, activity and trader PnL with range, market and scale controls and per-chart CSV export.
- Markets panel with Hyperliquid prices, skew, cap utilization, flags, impact explainer and a live win-keeps calculator built on the SDK.
- PAPER economics with the mint-rate curve and today's position.
- Leaderboard table and position distributions, wallets linked to the explorer.
- JSON API: `/api/metrics` (30s edge cache), `/api/snapshots`, `/openapi.json`.
- Shareable URL state, auto-refresh, strict CSP, light and dark themes.
