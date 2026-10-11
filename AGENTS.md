# AGENTS.md

Guidance for AI coding agents working in `papertrade-analytics`, an unofficial analytics dashboard and JSON API for Papertrade (HyperEVM chain 999).

## Commands

- `npm test`: unit tests over recorded real responses in `test/fixtures/`.
- `npm run test:live`: the same pipeline against production (`PAPERTRADE_LIVE=1`).
- `npm run typecheck`: root and `site/functions`. `npm run build:site`: bundle the browser app.
- `npm run dev:site`: serve on port 8791 with local KV. Kill it by PID, never with a pattern.

## Rules

- **Use `papertrade-sdk` for every protocol read, formula and unit.** Do not reimplement `estimateClose`, `liquidationPriceRaw`, `paperMintRate` or `impactScale`. If the SDK is wrong, report it, do not patch around it silently.
- **Units:** wad is 1e18, `accRewardPerShare` is 1e27. The protocol history is columnar, close-stamped and already scaled; volume, trader PnL, liquidations, trades and users are cumulative, staker revenue is per bucket. Leading zeros mean no data.
- **Instrument tuple fields 19-22 are cap-tracked open interest**, not book notional. Book long and short come from `/state/house/current` (`bl`, `bs`, `el`, `es`).
- **Query strings must be canonical** (sorted, unique): go through the SDK client.
- **No fake data.** Fixtures are recorded from the live API. Empty and error states are real states, not sample arrays.
- **Strict CSP.** No inline `style=""` or scripts. Bars take widths from `data-w` through `applyBars()`. `lightweight-charts` needs its injected `<style>` hash in `site/public/_headers`.
- **Escape everything dynamic** through the `html` tagged template (`site/app/util.ts`). Trader names are untrusted.
- **Read-only.** Never sign or send a transaction, never handle a key. This app has no wallet code.
- No em or en dashes anywhere.

## Layout

| Path | Contents |
|---|---|
| `src/transforms.ts`, `house.ts`, `insights.ts`, `csv.ts`, `format.ts` | Pure, tested data shaping |
| `src/metrics.ts`, `sources.ts`, `types.ts` | Metrics document builder and live collection |
| `site/functions/api/` | `metrics`, `snapshots`, and the CORS proxy `papertrade/[[path]]` |
| `site/functions/_lib/snapshots.ts` | Optional KV snapshot store |
| `site/app.ts`, `site/app/` | Browser app: store, charts, KPIs, markets, PAPER, traders |
| `site/public/` | Static output: `index.html`, `styles.css`, `openapi.json`, `llms.txt`, `_headers`, SEO files |
| `test/` | Vitest suites and recorded fixtures |
