# Self-hosting on Cloudflare

The whole project is one Cloudflare Pages site: static files from `site/public/`, Pages Functions from `site/functions/`. No database, no secrets.

```bash
git clone https://github.com/nirholas/papertrade-analytics && cd papertrade-analytics
npm install
npm run typecheck && npm test
npm run build:site          # bundles the app, renders docs, generates discovery files and llms-full.txt
cd site
npx wrangler pages deploy --project-name <your-project> --branch main
```

Authenticate wrangler with `npx wrangler login`, or export `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`. Run wrangler from `site/`.

## Configuration

| Name | Where | Purpose |
|---|---|---|
| `PAPERTRADE_API_URL` | `site/wrangler.toml` `[vars]` | Upstream API origin. Default `https://exchange.papertrade.xyz`. |
| `SNAPSHOTS` | KV binding | Optional. Records the house book every five minutes so LP and open-interest charts grow past what the protocol keeps. |
| `SITE_URL` | environment at build time | Optional. Public origin written into the docs, cards and sitemap. Default `https://papertrade-analytics.pages.dev`. |

For snapshots: `npx wrangler kv namespace create SNAPSHOTS`, then bind it as `SNAPSHOTS` in the Pages project settings.

## Custom domain

Set `SITE_URL=https://your.domain npm run build:site` before deploying so canonical URLs, the server card, `server.json` links and the sitemap point at your domain. Add the domain in the Pages dashboard.

## Local development

`npm run dev:site` serves everything, including `/mcp`, on `http://localhost:8791` with a local KV. Point `npx @modelcontextprotocol/inspector --cli http://localhost:8791/mcp --transport http --method tools/list` at it. Kill the dev server by PID.

## Embedding

`_headers` allows framing only by `https://papertrade-os.pages.dev` and other `https://*.pages.dev` hosts. To embed from your own origin, edit the `frame-ancestors` directive on the `/` route in `site/public/_headers`.
