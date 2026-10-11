# papertrade-analytics

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-0a8f5b?style=flat-square)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://github.com/nirholas/papertrade-analytics)
[![HyperEVM](https://img.shields.io/badge/HyperEVM-chain_999-0a8f5b?style=flat-square)](https://papertrade.xyz)
[![GitHub stars](https://img.shields.io/github/stars/nirholas/papertrade-analytics?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-analytics/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/nirholas/papertrade-analytics?style=flat-square&color=0a8f5b)](https://github.com/nirholas/papertrade-analytics/commits/main)
[![Unofficial](https://img.shields.io/badge/community-unofficial-lightgrey?style=flat-square)](#the-papertrade-toolkit)

[Live site](https://papertrade-analytics.pages.dev) · [Issues](https://github.com/nirholas/papertrade-analytics/issues) · [Discussions](https://github.com/nirholas/papertrade-analytics/discussions) · [Papertrade](https://papertrade.xyz) · [Toolkit](#the-papertrade-toolkit)

Unofficial live protocol analytics for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x synthetic perps exchange on Hyperliquid's HyperEVM (chain 999). A DefiLlama and Dune style dashboard plus a keyless JSON API, built as a Cloudflare Pages app on the verified [papertrade-sdk](https://github.com/nirholas/papertrade-sdk).

> Unofficial, not affiliated with Papertrade. High leverage can lose your whole margin. Nothing here is financial advice.

Live site: https://papertrade-analytics.pages.dev (after you deploy it, see below).

## What you get

- **Headline numbers.** TVL, trader margin, LP equity, reserve, withdrawal queue, all-time and 24h volume (split BTC and ETH), open positions, traders, PAPER supply (read on-chain), PAPER mint rate and staking totals. Each carries 24h and 7d changes where the history reaches back that far. When it does not, the chip says so ("+3% in 7h") instead of inventing a window.
- **Charts** (`lightweight-charts`): TVL, volume (total, BTC/ETH stacked, cumulative), LP equity, open interest long vs short, traders and trades, trader PnL and staker revenue. Range switcher (1h, 6h, 24h, 7d, all), market filter, linear/log scale, crosshair tooltips, and a CSV export per chart.
- **Markets.** Mid price from Hyperliquid candles, 24h and 7d change, sparkline, long vs short open interest with a skew bar, open interest cap utilization, max leverage, max position, paused and close-only flags, the impact parameters in plain language, and a calculator ("what does a $100, 500x, +0.1% win keep?") that runs the SDK's `estimateClose` against the live instrument.
- **PAPER economics.** Supply, staked share, current mint rate and phase, distance to 25 PAPER per $1, the reward accumulator, and the mint-rate curve with today's point marked.
- **Leaderboard insights.** Top traders by PnL for 24h, 7d, 30d and all time (sortable, paged, linked to the [explorer](https://papertrade-explorer.pages.dev)), leverage and position-size distributions, long vs short ratio, and how concentrated open interest is.
- **Operations.** Shareable URL state (`?range=7d&market=BTC&scale=log`), auto-refresh every 30s with a visible last-updated time, pause control, refresh pauses on a hidden tab and catches up when it returns, designed loading, empty and error states with retries, light and dark themes, reduced-motion support.

## JSON API

No key, CORS open, cached 30 seconds at the edge. Spec: [`/openapi.json`](site/public/openapi.json).

```bash
curl https://papertrade-analytics.pages.dev/api/metrics
curl https://papertrade-analytics.pages.dev/api/snapshots
```

| Route | Returns |
|---|---|
| `GET /api/metrics` | Protocol totals, deltas, per-market stats, PAPER economics and staking. Responses carry `X-Cache: HIT` or `MISS`. A 502 JSON error is returned when the upstream is down. |
| `GET /api/snapshots` | House-book snapshots recorded every 5 minutes (needs the optional KV binding, otherwise an empty list). |
| `GET /openapi.json` | OpenAPI 3.1 document. |
| `/api/papertrade/*` | Same-origin proxy to `exchange.papertrade.xyz` (Papertrade sends no CORS headers), used by the browser app. |

## Quick start

```bash
git clone https://github.com/nirholas/papertrade-analytics && cd papertrade-analytics
npm install ../papertrade-sdk-0.1.0.tgz viem   # the SDK is not on npm yet
npm install
npm run dev:site        # builds and serves http://localhost:8791 with a local KV
```

Scripts: `npm run typecheck` (root and `site/functions`), `npm test` (recorded fixtures), `npm run test:live` (production), `npm run build:site`.

## Architecture

- `src/`: pure, unit-tested transforms (`transforms`, `house`, `insights`, `metrics`, `csv`, `format`) plus `sources.ts`, which collects live inputs through the SDK. Shared by the browser and the Functions.
- `site/functions/api/metrics.ts`: builds the metrics document (SDK reads, Hyperliquid candles, HyperEVM reads for PAPER supply), caches it 30s with the Cache API. If every HyperEVM RPC rate-limits, it uses a recent last-good read and then the indexer values, and reports it in `source.onchain`.
- `site/app.ts` and `site/app/`: the browser app, bundled by esbuild into `site/public/app.js`. All protocol math comes from `papertrade-sdk` (`estimateClose`, `liquidationPriceRaw`, `paperMintRate`, `impactScale`).
- Strict CSP (`site/public/_headers`): no inline scripts, no external origins. `lightweight-charts` injects one `<style>` element, allowed by its SHA-256 hash. Update the hash if you bump the library (the browser console prints the new one).
- All API and on-chain strings (trader names) are HTML-escaped before rendering.

Data semantics worth knowing: the protocol history is columnar and close-stamped, volume, trader PnL, liquidations, trades and users are cumulative while staker revenue is per bucket, and the history has no LP or open-interest column. Those two charts come from `/state/house/current` (a short rolling window) and, when KV is bound, from recorded snapshots.

## Environment

| Name | Where | Purpose |
|---|---|---|
| `PAPERTRADE_API_URL` | `site/wrangler.toml` `[vars]`, `.dev.vars` | Upstream API (default `https://exchange.papertrade.xyz`). Optional. |
| `SNAPSHOTS` | KV binding | Optional. Enables snapshot recording for longer LP and open-interest history. |

No secrets are required. See `.dev.vars.example`.

## Deploy

```bash
npm run build:site && cd site && npx wrangler pages deploy
```

Optional history: `npx wrangler kv namespace create SNAPSHOTS`, then bind it as `SNAPSHOTS` in the Pages project (dashboard or `wrangler.toml`).

## The Papertrade toolkit

Nine open-source building blocks for [Papertrade](https://papertrade.xyz), the fully on-chain 1000x perps exchange on Hyperliquid HyperEVM. Use them together or on their own.

| Project | What it does |
|---|---|
| [papertrade-ai](https://github.com/nirholas/papertrade-ai) | MCP server and CLI: trade Papertrade from Claude, ChatGPT, Cursor and any MCP client |
| [papertrade-sdk](https://github.com/nirholas/papertrade-sdk) | Typed API client, live account stream, EIP-712 signing and verified settlement math. |
| [papertrade-terminal](https://github.com/nirholas/papertrade-terminal) | Non-custodial web trading terminal with charts, order ticket, funding and swaps. |
| **papertrade-analytics** (this repo) | DefiLlama-style dashboard and JSON API: TVL, volume, OI, PAPER economics. |
| [papertrade-explorer](https://github.com/nirholas/papertrade-explorer) | Linkable wallet pages, decoded transactions and a live leaderboard. |
| [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations) | Liquidation map and closest-to-bust feed, recomputed with the verified formula. |
| [papertrade-yield](https://github.com/nirholas/papertrade-yield) | PAPER staking dashboard with realized USDC yield and wallet-signed actions. |
| [papertrade-alerts](https://github.com/nirholas/papertrade-alerts) | Know before the liquidation: Telegram, Discord and webhook alerts. |
| [papertrade-copytrade](https://github.com/nirholas/papertrade-copytrade) | Guard-railed copy-trading CLI. Dry run by default. |
| [papertrade-x402](https://github.com/nirholas/papertrade-x402) | Pay-per-call intelligence API for AI agents, paid in USDC on Solana or Base. |

## Contributing and support

- Found a bug or want a feature? [Open an issue](https://github.com/nirholas/papertrade-analytics/issues/new/choose).
- Questions and show-and-tell: [Discussions](https://github.com/nirholas/papertrade-analytics/discussions).
- Pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). Security reports go through [SECURITY.md](SECURITY.md).
- If this saved you time, a star helps other Papertrade traders and builders find it.

Built by [three.ws](https://three.ws).

## License

Apache-2.0. Unofficial, not affiliated with Papertrade, high leverage can lose your whole margin.
