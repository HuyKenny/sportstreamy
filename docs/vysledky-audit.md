# Výsledky: audit projektu a zvolený postup (21. 10. 2026)

## Co projekt skutečně používá
- **Stack:** Astro 7 SSR na Cloudflare Workers (`@astrojs/cloudflare`), vlastní entry `src/worker.ts`.
  - `fetch` → Astro se SWR cache v Cache API;
  - `scheduled` → refresh.
- **Data:** žádná databáze, jen KV `DATA` se dvěma snímky:
  - `live` (cron `*/3`) a `pre` (cron `*/15`, 7 dní dopředu);
  - zdroj je partner API Tipsportu, kurzy Chance se párují podle stejného ID (`src/lib/tipsport.ts`, `src/lib/refresh.ts`).
- **API-Sports / api-football:**
  - Secret `APISPORTS_KEY` existuje, ale **žádný kód ho nepoužívá**. Kvótu tedy zatím nic nespotřebovává.
  - Klíč byl 21. 10. vyměněn, je to plán Free.
- **Párování:** soutěže se párují regexem názvu Tipsportu na kurátorovaný seznam (`src/lib/competitions.ts`). Týmy se nepárují, zápas má ID Tipsportu. Jiný zdroj zápasů není.
- **Testy:** projekt neměl žádné. Kontrola byla jen `astro check`.

## Stránky zápasů a jejich životní cyklus (před změnou)
- **Detail:** `/zapas/{tipsportId}-{slug}/`.
  - Je to **konkrétní utkání**, ne stránka dvojice týmů. Stejná dvojice při dalším zápase dostane nové ID a novou URL, nic se nepřepisuje.
  - Slug se počítal z aktuálních názvů. Při přejmenování týmu šel 301 na nový slug.
- **Po skončení:** zápas zmizí z view 3 h po začátku a URL vrací **410** (`noindex`). Výsledek se nikde neukládal.
- **Sitemap:** `sitemap-matches.xml` obsahovala jen živé a nadcházející zápasy.
- **`/zivy-prenos/…`:** jen legacy redirect ze staré WP verze, není to druhý detail.
- **Title a H1:** vždy „… živě online – kde sledovat“, i u odehraného zápasu (stav „Záznam“).

## Dostupnost dat (ověřeno proti skutečným API 21. 10.)
- **Tipsport live feed** (`/rest/external/offer/v2/live/matches`, ~1 100 zápasů) obsahuje:
  - `ended`, skóre `home`/`away`;
  - stav a poločasy ve `statusOffer` (`"2.pol. - 48.min (1:1, 0:1)"`, `"(3:1, 0:1)"`), minutu `time`;
  - ID účastníků `homeParticipantId`/`visitingParticipantId` a ID ročníku `competitionAnnualId`;
  - kód `toMatch()` ukončené zápasy zahazoval.
- **Tipsport nemá endpoint s výsledky.** Zkoušel jsem 4 cesty, všechny vrátily 404.
- **Ukončený zápas drží feed jen krátce.** Měřil jsem každých 60 s: 26 ukončených zápasů, setrvání 0–240 s, medián 60 s. Cron `*/3` by konec často minul.
- **Prematch feed** obsahuje ID ročníku a ID týmů, ale **ne skóre**.
  - Pilotní soutěže v něm jsou: Chance Liga (ročník `266198`) a Premier League (`265573`).
  - Pod „1. anglická liga“ Tipsport vede i ženskou WSL (týmy „(ž)“).
- **api-football:**
  - `/status`: plán **Free**, platnost do 20. 10. 2027, 100 dotazů za den, 10 za minutu (hlavičky `x-ratelimit-*`).
  - `/status` se do kvóty nepočítá (po volání `current: 0`).
  - Aktuální sezóna: chyba uvnitř HTTP 200 „Free plans do not have access to this season, try from 2022 to 2024.“
  - **Aktuální data z api-football tedy nejsou dostupná.**
- **Podmínky api-football** (stránka /terms):
  - „We do not provide a "license" for the use and publication of the data … Any license or permission to publish the data must be requested by the user from the competent authorities.“
  - Loga a obrázky jsou jen pro identifikaci.
  - Zákaz přeprodeje a zákaz více účtů kvůli limitu Free.
- **Stránky /pricing a /documentation-v3** vracejí 403 (WebFetch i Apify). Limity proto beru z odpovědí API.

## Zvolený postup
1. **Zdroj výsledků pilotu je Tipsport live feed, který už stahujeme.**
   - Žádný nový poskytovatel ani druhý import. Sync se napojil do existujících `refreshLive` a `refreshUpcoming`, nad stejnými odpověďmi.
   - Přibyl běh každou minutu, ale jen v okně pilotních zápasů (kvůli krátkému setrvání `ended`, viz výše). Mimo okno udělá jen 1 čtení z D1.
2. **Nová D1 `sportstreamy-results`** (aditivní migrace `migrations/0001_results.sql`):
   - identita `(provider, sport, ext_id)`;
   - slug se uloží při prvním zápisu a už se nemění;
   - mapa týmů podle ID poskytovatele (muži, ženy, mládež, rezervy);
   - evidence kvóty, zámky a log běhů.
3. **Detail zůstává `/zapas/{id}-{slug}/`, jedna URL na zápas.**
   - Zápas pilotu po skončení vrací 200 s výsledkem místo 410.
   - Ostatní soutěže beze změny (410).
   - Žádný druhý detail pod `/vysledky/`.
4. **Přehledy a další stránky:**
   - Nové přehledy jsou `/vysledky/` a `/vysledky/fotbal/`. S routováním nekolidují, statická cesta má přednost před `[sport]`.
   - Výsledky soutěže se ukazují na existující stránce `/fotbal-online/<soutez>/`.
5. **api-football je integrované, ale vypnuté** (`RESULTS_APIFOOTBALL=off`):
   - klient s rozpočtem, zámkem, timeoutem, retry a kontrolou `errors`;
   - produkční synchronizaci blokuje plán Free.
6. **Sekce je za přepínači** `RESULTS_ENABLED` a `RESULTS_SYNC`. V produkci jsou `off`, takže dokud se nezapnou, web se chová jako dřív.

Provoz, nastavení a výpočet spotřeby jsou v [vysledky-provoz.md](vysledky-provoz.md).
