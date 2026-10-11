# papertrade-analytics

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

## Related

[papertrade-sdk](https://github.com/nirholas/papertrade-sdk), [papertrade-ai](https://github.com/nirholas/papertrade-ai), [papertrade-terminal](https://github.com/nirholas/papertrade-terminal), [papertrade-explorer](https://github.com/nirholas/papertrade-explorer), [papertrade-x402](https://github.com/nirholas/papertrade-x402), [papertrade-liquidations](https://github.com/nirholas/papertrade-liquidations), [papertrade-yield](https://github.com/nirholas/papertrade-yield), [papertrade-alerts](https://github.com/nirholas/papertrade-alerts), [papertrade-copytrade](https://github.com/nirholas/papertrade-copytrade).

## License

MIT. Unofficial, not affiliated with Papertrade, high leverage can lose your whole margin.
