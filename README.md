# sportstreamy.cz

Přehled živých sportovních přenosů a programu (konkurent ziveprenosyzdarma.cz), cíl = proklik na affiliate Tipsport/Chance.

- **Stack:** Astro 7 SSR na Cloudflare Workers (`@astrojs/cloudflare`), vlastní entry `src/worker.ts` (fetch → Astro, `scheduled` → refresh).
- **Data:** cron `*/3` živé zápasy, `*/15` týdenní program + kurzy → KV `DATA` (klíče `live`, `pre`). **KV i D1 `sportstreamy-results` čte i ziveprenosy.sk (`apps/ziveprenosy-sk`, jen čtení) — změna tvaru dat rozbije i slovenský web.** Zdroj: partner API Tipsport (`partners.tipsport.cz`) a Chance (stejná platforma, stejná ID). `src/lib/tipsport.ts`, `src/lib/refresh.ts`.
- **Výsledky (živě od 21. 10.):** 12 fotbalových soutěží (competitions.ts), Tipsport live feed + api-football jako doplněk → D1 `sportstreamy-results` (`src/lib/results/`), stránky `/vysledky/`, archiv detailů `/zapas/…`. Testy `pnpm test`. Provoz a nasazení: `docs/vysledky-provoz.md`, audit: `docs/vysledky-audit.md`.
- **Klik:** `/go/<tipsport|chance|sazka|registrace>/?m=<id zápasu>&p=<umístění>` → 302 na affiliate (deeplink = `matchUrl` + tracking `pid/sid/bid/tid` z `TIPSPORT_URL`/`CHANCE_URL`), bod do Analytics Engine `sportstreamy_clicks`.
- **Secrets** (`wrangler secret put`, lokálně `.dev.vars`, nikdy do gitu): `TIPSPORT_CLIENT_ID/SECRET`, `CHANCE_API_USER/PASS`, `APISPORTS_KEY`. Zdroj hodnot: `~/ai/credentials/.sportstreamy-credentials.env`.
- **Lokálně:** `pnpm build && pnpm exec wrangler dev --local --test-scheduled`, naplnění KV: `curl 'localhost:8787/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*'`.
- **Assety:** `node scripts/assets.mjs` (OG + ikony), `scripts/shot.mjs` (screenshoty přes systémový Chromium).
- Před změnou `wrangler.jsonc`: `pnpm types`.

Sporty/idSuperSport: `src/lib/sports.ts`. Zápas „live" = Tipsport flag **a** start <= now (Tipsport hlásí live i hodiny předem).

## Statický web + live job (Cloudflare Workers Free, připraveno 23. 11. 2026)
- **Architektura:** SSR Astro se už nenasazuje — `.github/workflows/live.yml` (veřejné repo, à 10 min) ho spustí lokálně (`wrangler dev`, lokální KV + SQLite kopie D1), osvěží data Tipsport/Chance (stejný `scheduled` handler) + api-football (`scripts/af-sync.ts`, `RESULTS_SQLITE`), stránky obou webů (sportstreamy.cz **i** ziveprenosy.sk z `HuyKenny/ziveprenosy-sk`) uloží `scripts/static/snapshot.py` a `scripts/static/deploy.mjs` nahraje jen změněné soubory + malý `src/edge.ts` (`/go/`, `/logo/`, `?den=`, staré URL, 404/410). Bez CF cronů, KV a D1.
- **Stav mezi běhy:** šifrovaný release asset `state` (`scripts/static/state.sh`, klíč `STATE_KEY` v GitHub secrets + `credentials/.sportstreamy-credentials.env`), denní kopie `state-YYYY-MM-DD.enc` (7 dní).
- **Přepnutí (cutover):** 1) Kenny: `! python3 scripts/sportstreamy/setup-actions.py` (GitHub secrets + scoped CF token) 2) zastavit staré zapisovatele: CF crony Workeru `sportstreamy`, cron `bin/sportstreamy-af.sh` 3) `pnpm build && scripts/static/seed.sh <prázdná složka>` (D1 → stav) 4) `gh workflow run live -f mode=full` 5) ověřit oba weby, smazat KV `sportstreamy-data`. Skripty Maliny (`nahledy.py`, `pobocky.py`, `bin/ziveprenosy-logos.sh`, `bin/sportstreamy-af.sh`) se přepnou samy, jakmile web servíruje `/_data/nahledy.json`.
- **Po přepnutí nikdy `pnpm deploy`/`wrangler deploy`** — vrátí SSR Worker s crony (= rollback). Opravy kódu: push na `main` spustí live job (nový build = plný render).
- **Lokální test:** `NO_DEPLOY=1 RUNNER_TEMP=<dir> SNAP_MODE=full scripts/static/run.sh <stav> ../ziveprenosy-sk` (s proměnnými z credentials; bez `APISPORTS_KEY` se api-football přeskočí).
