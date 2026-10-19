# sportstreamy.cz

Přehled živých sportovních přenosů a programu (konkurent ziveprenosyzdarma.cz), cíl = proklik na affiliate Tipsport/Chance.

- **Stack:** Astro 7 SSR na Cloudflare Workers (`@astrojs/cloudflare`), vlastní entry `src/worker.ts` (fetch → Astro, `scheduled` → refresh).
- **Data:** cron `*/3` živé zápasy, `*/15` týdenní program + kurzy → KV `DATA` (klíče `live`, `pre`). Zdroj: partner API Tipsport (`partners.tipsport.cz`) a Chance (stejná platforma, stejná ID). `src/lib/tipsport.ts`, `src/lib/refresh.ts`.
- **Klik:** `/go/<tipsport|chance|sazka|registrace>/?m=<id zápasu>&p=<umístění>` → 302 na affiliate (deeplink = `matchUrl` + tracking `pid/sid/bid/tid` z `TIPSPORT_URL`/`CHANCE_URL`), bod do Analytics Engine `sportstreamy_clicks`.
- **Secrets** (`wrangler secret put`, lokálně `.dev.vars`, nikdy do gitu): `TIPSPORT_CLIENT_ID/SECRET`, `CHANCE_API_USER/PASS`, `APISPORTS_KEY`. Zdroj hodnot: `~/ai/credentials/.sportstreamy-credentials.env`.
- **Lokálně:** `pnpm build && pnpm exec wrangler dev --local --test-scheduled`, naplnění KV: `curl 'localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*'`.
- **Assety:** `node scripts/assets.mjs` (OG + ikony), `scripts/shot.mjs` (screenshoty přes systémový Chromium).
- Před změnou `wrangler.jsonc`: `pnpm types`.

Sporty/idSuperSport: `src/lib/sports.ts`. Zápas „live" = Tipsport flag **a** start <= now (Tipsport hlásí live i hodiny předem).
