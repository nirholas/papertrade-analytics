# AGENTS.md

Guidance for AI coding agents working in `papertrade-analytics`, an unofficial analytics dashboard and JSON API for Papertrade (HyperEVM chain 999).

## Commands

- `npm test`: unit tests over recorded real responses in `test/fixtures/`.
- `npm run test:live`: the same pipeline against production (`PAPERTRADE_LIVE=1`).
- `npm run typecheck`: root and `site/functions`. `npm run build:site`: render docs, regenerate discovery files, bundle the browser app.
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
- **MCP tools stay read-only.** Every tool in `site/functions/_lib/tools.ts` is annotated read-only and a test enforces it. Never add a tool that signs, sends or places an order; a tool that would move money returns a labelled simulation only. Trader names in tool output go through `cleanName`.
- **Docs and discovery files are generated.** Edit `docs/*.md`, `CHANGELOG.md` or the generators in `scripts/lib/`, then run `npm run build:site`. Never hand-edit `site/public/docs/*.html`, `*.md`, `llms*.txt`, `.well-known/*` or `server.json`. Tool tables come from the registry, so a new tool needs only its definition.
- **`_headers` rules stack, they do not override.** A header set on `/*` and again on a narrower route is sent twice, so the CSP lives only on the specific routes.
- No em or en dashes anywhere.

## Layout

| Path | Contents |
|---|---|
| `src/transforms.ts`, `house.ts`, `insights.ts`, `csv.ts`, `format.ts` | Pure, tested data shaping |
| `src/metrics.ts`, `sources.ts`, `types.ts` | Metrics document builder and live collection |
| `site/functions/mcp.ts`, `_lib/mcp.ts`, `_lib/tools.ts`, `_lib/server.ts` | The MCP server, its plumbing, tool registry and identity |
| `docs/`, `scripts/` | Docs sources, `build-docs.mjs`, `build-discovery.mjs`, shared generators in `scripts/lib/` |
| `site/functions/api/` | `metrics`, `snapshots`, and the CORS proxy `papertrade/[[path]]` |
| `site/functions/_lib/snapshots.ts` | Optional KV snapshot store |
| `site/app.ts`, `site/app/` | Browser app: store, charts, KPIs, markets, PAPER, traders |
| `site/public/` | Static output: `index.html`, `styles.css`, `openapi.json`, `llms.txt`, `_headers`, SEO files |
| `test/` | Vitest suites and recorded fixtures |
