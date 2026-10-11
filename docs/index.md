---
title: Overview
description: Papertrade Analytics is an unofficial live dashboard, JSON API and read-only MCP server for the Papertrade perps exchange on HyperEVM.
order: 1
---

# Papertrade Analytics

Papertrade Analytics measures [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perpetuals exchange on Hyperliquid's HyperEVM (chain 999). It reads the public Papertrade API, Hyperliquid candles and the chain, and serves the result three ways:

- **A dashboard** at [{{SITE}}]({{SITE}}): TVL, volume, LP equity, open interest, market skew, the PAPER mint curve, staking and leaderboard insights, with charts that export to CSV.
- **A keyless JSON API**: [`/api/metrics`](api.md) returns every headline number in one document, cached for 30 seconds at the edge. The spec is at [`/openapi.json`](/openapi.json).
- **A read-only MCP server** at `{{MCP_URL}}`: {{TOOL_COUNT}} tools that let Claude, ChatGPT, Codex, Gemini, Cursor and any other MCP client answer questions about the protocol from live data. See [MCP](mcp.md) and [Connect your AI](connect.md).

> Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin. Nothing here is financial advice.

## What it is not

It does not trade. Nothing in this project signs a transaction, holds a key, sends funds or places an order. The MCP server cannot do those things either: its one tool that talks about positions, `quote_position_outcome`, is a pure simulation. Trading happens in your own wallet through the [Papertrade terminal](https://papertrade-terminal.pages.dev) or Papertrade itself.

## Where the numbers come from

| Data | Source |
|---|---|
| TVL, balances, volume, open positions, fees, history | Papertrade public API (`/query/protocol/summary`, `/query/protocol/history`) |
| Open long and short notional per market | `/state/house/current` (the house book) |
| Instrument limits, impact parameters, open interest caps | `/state/trading` |
| Mark prices and 24h and 7d change | Hyperliquid 1h candles |
| PAPER supply, staked total, reward accumulator | HyperEVM reads (indexer values when every RPC refuses) |
| Leaderboard | `/state/leaderboard/accounts` and `/state/leaderboard/positions` |

All protocol math (`estimateClose`, `liquidationPriceRaw`, `paperMintRate`, the impact scale) comes from [papertrade-sdk](https://github.com/nirholas/papertrade-sdk), which is checked against settled positions on mainnet.

## Next steps

- [Quickstart](quickstart.md): fetch data, call a tool, run it locally.
- [Concepts](concepts.md): the Papertrade rules that change how you read the numbers.
- [Connect your AI](connect.md): copy-paste setup for every major client.
