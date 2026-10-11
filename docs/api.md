---
title: API reference
description: The keyless JSON API behind the dashboard, its response fields, caching and errors.
order: 4
---

# API reference

Base URL: `{{SITE}}`. No key. CORS is open (`Access-Control-Allow-Origin: *`). The OpenAPI 3.1 document is at [`/openapi.json`](/openapi.json); the MCP server has its own [reference](mcp.md).

## GET /api/metrics

One JSON document with everything on the dashboard. Cached 30 seconds in the Workers Cache; `X-Cache` is `HIT` or `MISS`. USD values are plain numbers.

```bash
curl -s {{SITE}}/api/metrics | jq '.markets[] | {symbol, priceUsd, longShare, volume24hUsd}'
```

| Field | Contents |
|---|---|
| `generatedAt`, `source` | When it was built and provenance: `protocolBlock`, `protocolAt`, `historyAsOf`, `onchain`, `snapshots`. |
| `protocol` | `tvlUsd`, `marginUsd`, `lpUsd`, `reserveUsd`, `queueUsd`, `allTimeVolumeUsd`, `volume24hUsd`, `openPositions`, `traders`, `trades`, `liquidatedVolumeUsd`, `traderPnlUsd`, `lifetimeFeesUsd`, `pendingFeesUsd`, `openNotionalUsd`, `houseOpenPnlUsd`. |
| `deltas` | `tvl`, `lp`, `traders`, `openPositions` as `{h24, d7}`, plus `volume24h` (last 24h against the 24h before) and `trades24h`. Each delta is `{abs, pct, fromMs, toMs, spanMs, partial}`. |
| `markets[]` | BTC and ETH: `priceUsd`, `change24hPct`, `change7dPct`, `sparkline`, `volume24hUsd`, open long and short, `longShare`, cap open interest, caps and utilization, `maxLeverage`, `maxPositionUsd`, status flags, `impact`, `keepsExample`. |
| `paper` | `supply`, `staked`, `stakedShare`, `mintRate`, `phase`, `curve`, `tailProgressToRate25Usd`, `reservePaper`. |
| `staking` | `totalStaked`, `accRewardPerShareUsd`, `accRewardPerShareRaw`, `pendingRewardsUsd`, `rewardCapUsd`, `overflowAboveCapUsd`, `rewardsDistributedUsd`. |

Errors: `502` with `{"code":"upstream_unavailable","message":"..."}` when the Papertrade API cannot be reached, and `405` for methods other than GET, HEAD and OPTIONS.

## GET /api/snapshots

House-book samples recorded every five minutes while a `SNAPSHOTS` KV namespace is bound. Returns `{intervalMs, recording, snapshots[]}`; the list is empty when nothing is bound. Each snapshot has `t`, `tvl`, `margin`, `lp`, `pnl`, `open` and long and short notional for each market.

## /api/papertrade/*

A same-origin proxy to the Papertrade API, which sends no CORS headers. It forwards only the public surface: GET reads under `/state/`, `/query/`, `/queue-rank/` and `/relayer/health`, the wallet live stream, and the POST routes that carry already-signed intents. It holds no keys and signs nothing. Point the SDK at it with `new PapertradeClient({ baseUrl: '/api/papertrade' })`. Other paths return `404 not_proxied`.

## Using the building blocks as a library

The pure functions behind the dashboard live in `src/` and are unit-tested on recorded responses: `buildMetrics` (the document above), `historyPoints`, `deltaOver`, `windowOverWindow` and `diffSeries` (time-series transforms), `houseSeries` (house book history), `traderRows`, `positionInsights` and `concentration` (leaderboard analysis), and `seriesToCsv`. They take plain inputs and return plain data, with no DOM or network access.
