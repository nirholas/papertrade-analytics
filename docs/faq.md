---
title: FAQ
description: Common questions about Papertrade Analytics data, the MCP server and the dashboard.
order: 10
---

# FAQ

**Is this official?** No. It is an independent open-source project (Apache-2.0) that reads Papertrade's public data. It is not affiliated with or endorsed by Papertrade.

**Can the MCP server trade for me?** No. It has no keys, no wallet and no signing, and no tool places orders. `quote_position_outcome` only simulates settlement math.

**Do I need an API key?** No. The API and MCP server are keyless and CORS-open.

**How fresh is the data?** `/api/metrics` and the tools built on it are at most 30 seconds old; history and leaderboard reads at most 60 seconds. The `generatedAt` and `source` fields tell you exactly.

**Why does `change7d` say `partial`?** The protocol's hourly history is short and the protocol is young, so a 7 day window may not exist yet. The change is then measured from the earliest point and flagged, rather than invented.

**Why is volume a cumulative number?** The protocol history stores cumulative counters. Use `get_history` with `mode: "per_bucket"` for volume per hour or day.

**Why do open interest numbers differ?** Book notional (`openLongUsd`, from the house book) and cap-tracked open interest (`capOiLongUsd`, a base-asset quantity priced at the mark) are different measures. See [Concepts](concepts.md).

**`source.onchain` is false. Is something broken?** HyperEVM RPCs rate-limit. PAPER supply then comes from the last good read or the indexer. Values are still correct to indexer precision.

**ETH shows no price.** Prices come from Hyperliquid candles. If that call fails, `priceUsd` is `null` rather than a guess; pass `entryPriceUsd` to `quote_position_outcome` to proceed.

**My client says no tools were found.** Use the Streamable HTTP transport (not SSE) and the exact URL `{{MCP_URL}}`. Per client syntax is in [Connect your AI](connect.md).

**Can I embed the dashboard?** Yes: `?embed=1` shows only the product, and framing is allowed from `*.pages.dev` hosts including [Papertrade OS](https://papertrade-os.pages.dev/?open=analytics).

**How do I get longer LP and open-interest history?** Self-host with a `SNAPSHOTS` KV namespace: it records the house book every five minutes.
