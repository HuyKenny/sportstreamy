# Výsledky: provoz (pilot fotbal: Chance Liga + Premier League)

Stav k 21. 10. 2026:
- Implementace je na větvi `vysledky`.
- **Nenasazeno.** Produkční přepínače jsou `off` a remote D1 ještě neexistuje.

## Architektura
```
cron Workeru (*/3, */15, každou minutu v okně zápasů)
  → partner API Tipsportu (stejné odpovědi jako pro program a živé skóre)
  → normalizace + validace (src/lib/results/normalize.ts)
  → D1 sportstreamy-results (src/lib/results/store.ts, idempotentní upsert s pojistkami)
  → SSR stránky s cache (SWR v src/worker.ts) + read-only /api/vysledky.json
```

### Moduly
| Soubor | Úloha |
|---|---|
| `src/lib/results/normalize.ts` | Tipsport / api-football → jednotné pozorování, stavy, týmy |
| `src/lib/results/store.ts` | upserty, dotazy, provozní přehled |
| `src/lib/results/sync.ts` | úlohy se zámkem a logem |
| `src/lib/results/budget.ts` | rezervace kvóty, zámky, `runJob` |
| `src/lib/results/apifootball.ts` | klient api-football (vypnutý) |
| `src/lib/results/page.ts`, `view.ts`, `time.ts`, `status.ts` | stránky, pražský den, popisky stavů |

### Pravidla
- **Bez volání poskytovatele z návštěvy.** Návštěva, filtr ani bot poskytovatele nevolají. Ověřeno lokálně: 35 načtení stránek a API nepřidalo žádný běh ani spotřebu.
- **Pojistky zápisu:**
  - Starší odpověď nepřepíše novější (`src_at`).
  - Konečný výsledek se nevrátí na „živě“.
  - Chybějící skóre nepřepíše poslední známé.
  - Prázdný feed se bere jako výpadek: nic se nezapíše ani nesmaže.
  - Odložení mění jen `start_utc`, ID ani slug ne.
- **Stavy:**
  - „Konec“ se ukáže jen při `ended: true` od Tipsportu.
  - Zápas, který z feedu zmizí bez `ended` (20 min bez potvrzení), nebo naplánovaný zápas, který 4 h po výkopu nikdy nebyl vidět živě, dostane **„Výsledek nepotvrzen“** s posledním známým skóre.
  - Neznámý text stavu se zobrazí slovy Tipsportu, nikdy jako konec.
- **Týmy:** ženy, mládež, rezervy a týmy bez ID poskytovatele dostanou `review = 1` a nejsou veřejné. Patří sem i ženská WSL, kterou Tipsport vede pod „1. anglická liga“. Stejně se pozdrží ID, které změní druh týmu.
- **Čas:** v DB UTC (ms), zobrazení Europe/Prague. Den se počítá jako pražský kalendářní den, změna času má 23 nebo 25 h (testy).

## Nastavení (`wrangler.jsonc` → `vars`, secrets přes `wrangler secret put`)
| Proměnná | Produkce teď | Význam |
|---|---|---|
| `RESULTS_ENABLED` | `off` | stránky `/vysledky/`, bloky na homepage a v soutěžích, archiv detailů, sitemap, položka v menu |
| `RESULTS_SYNC` | `off` | zápisy z cronu do D1 |
| `RESULTS_COMPETITIONS` | `chance-liga,premier-league` | slugy z `competitions.ts` |
| `RESULTS_APIFOOTBALL` | `off` | api-football sync (jen s `APISPORTS_KEY`) |
| `RESULTS_API_CAP` | `80` | náš denní strop na sdílené kvótě api-football |
| `RESULTS_API_RESERVE` | `20` | pod tolik zbývajících dotazů u poskytovatele nejdeme (klíč může používat i jiný projekt) |
| `RESULTS_STALE_MIN` | `10` | po kolika minutách bez potvrzení se u probíhajícího zápasu ukáže varování |
| `RESULTS_STATS` | `off` | nepovinné statistiky (zatím bez zdroje) |
| secret `RESULTS_ADMIN_TOKEN` | nenastaven | Bearer pro `/api/vysledky/stav/` a `POST /api/vysledky/sync/`; bez něj oba vrací 404 |
| secret `APISPORTS_KEY` | nastaven | api-football, jen na serveru |

Lokálně: `.dev.vars` (vzor `.dev.vars.example`, bez skutečných hodnot). Hodnoty jsou v `~/ai/credentials/.sportstreamy-credentials.env`.

## Soutěže a sezóny
| Soutěž | Tipsport (ověřeno 21. 10.) | api-football |
|---|---|---|
| Chance Liga | „Česká Chance Liga“, ročník `266198`, 8 zápasů v příštích 7 dnech | liga 345: aktuální sezóna na Free **nedostupná** |
| Premier League | „1. anglická liga“, ročník `265573`, 10 zápasů mužů a 7 zápasů žen (WSL, drženy v review) | liga 39: aktuální sezóna na Free **nedostupná** |

Sezónu bereme od poskytovatele: Tipsport `competitionAnnualId`, api-football `/leagues?current=true`. Z kalendáře se neodvozuje.

## Spotřeba a frekvence
**Tipsport** (partner API, bez denní kvóty; neveřejné limity viz Nevyřešené):

| | Dnes | S výsledky |
|---|---|---|
| live feed | 480/den (`*/3`) | beze změny, jen se navíc zapíše do D1 |
| prematch | 96/den (`*/15`) | beze změny |
| minutový běh | – | jen v okně „10 min před výkopem až 3 h po“ a jen v minutách, které `*/3` nepokrývá: login + live feed = 2 dotazy |

- **Běžný den bez pilotního zápasu:** 0 dotazů navíc. Minutový běh jen přečte D1.
- **Nejvytíženější den** (sobota s oběma ligami, okno ~13:20–20:45): ~445 min × 2/3 × 2 ≈ **600 dotazů navíc**, tedy zhruba +100 % proti dnešnímu live pollingu v té době.
- **Skutečná frekvence:**
  - V okně zápasu se živé skóre zapisuje každou minutu, mimo okno co 3 min (`*/3`).
  - Stránka dnešních výsledků si data znovu načte každých 60 s, jen ve viditelné záložce.
  - HTML se cachuje: přehled dnes 60 s, jiný den 600 s, živý detail 30 s, ukončený 3 600 s.
  - Na webu to proto popisujeme jako „Průběžně aktualizované výsledky“, ne jako livescore.

**api-football** (vypnuté; výpočet pro případ, že ho zapneš na plánu s aktuální sezónou):
- Implementováno je jen `syncApiFootball`: na každou ligu `/leagues?current` + `/fixtures?date` = **4 dotazy na běh**. Spustí se jen ručně přes `POST /api/vysledky/sync/`, do cronu zapojený není.
- Návrh plného provozu:
  - **běžný den:** 4 ráno + 2 standings + 2 kontroly ukončených + živé `fixtures?live=` jen v oknech (10 min krok, PL kolo ~4 bloky × 2 h = 48) ≈ **56**;
  - **nejvytíženější den** (6 bloků): 4 + 72 + 2 + 2 = **80** = strop. Statistiky pak nejdou.
- Každý pokus včetně retry se rezervuje předem (`api_usage`). Při `used ≥ cap` nebo hlášené zbývající kvótě ≤ 20 se nevolá nic.
- Kvóta se resetuje ve 00:00 UTC, ne o české půlnoci (počítáme `day` v UTC).

## Omezení bezplatného režimu
- api-football Free nevrací aktuální sezónu. Tabulky, sestavy, statistiky, události a forma týmů tedy **nejsou** a stránky je nezobrazují (žádné prázdné záložky).
- Konečný stav od Tipsportu může chybět: když se `ended` mezi dvěma běhy objeví a zase zmizí, zápas skončí jako „Výsledek nepotvrzen“ s posledním známým skóre.
  - Minutový běh to výrazně snižuje, ale neodstraňuje (naměřené setrvání 0–240 s).
  - Prodloužení a penalty rozpoznáváme z textu stavu. Přesný formát Tipsportu u fotbalových pohárů jsme zatím neviděli, neznámý text se proto ukáže slovy zdroje.
- „Dostupné vzájemné zápasy“ jsou jen z našeho archivu od spuštění, nejde o kompletní historii.
- Měření: prokliky na Tipsport z výsledků se měří přes existující Analytics Engine (placementy `detail-final`, `detail-final-same`, `detail-final-aside`). Zobrazení stránek web neměří, protože nemá pageview analytiku. Žádnou novou službu jsme nepřidali.

## Nasazení (po schválení)
1. `pnpm exec wrangler d1 create sportstreamy-results` a vrácené `database_id` zapsat do `wrangler.jsonc`.
   - **Bez toho deploy této větve selže**, je tam nulový placeholder.
2. `pnpm exec wrangler d1 migrations apply sportstreamy-results --remote` (jen `CREATE … IF NOT EXISTS`).
3. `pnpm exec wrangler secret put RESULTS_ADMIN_TOKEN` (náhodných 32+ znaků, uložit do credentials).
4. Fáze sběru: `RESULTS_SYNC=on`, `RESULTS_ENABLED=off`, deploy.
   - Po 1–2 kolech zkontrolovat `scripts/vysledky-stav.sh` (podíl `unconfirmed`, `review`) a pár zápasů ručně.
5. Zveřejnění: `RESULTS_ENABLED=on`, deploy, CF purge (homepage, `/fotbal-online/*`, `/zapas/*`, sitemapy), IndexNow pro `/vysledky/`.

## Vypnutí a návrat
- **Rychle:** `RESULTS_ENABLED=off` (a případně `RESULTS_SYNC=off`) + deploy.
  - Web se chová jako dřív: detaily ukončených zápasů znovu 410, menu bez „Výsledky“.
  - D1 a data zůstanou.
- **Úplně:** revert merge větve `vysledky`. Tabulky v D1 nikomu nevadí, smazání (`wrangler d1 delete`) jen na výslovný pokyn.
- **Záloha:**
  - `pnpm exec wrangler d1 export sportstreamy-results --remote --output backups/vysledky-YYYY-MM-DD.sql`;
  - D1 má navíc Time Travel (obnova k bodu v čase za posledních 30 dní).

## Provozní kontrola
- `scripts/vysledky-stav.sh [--local|--remote]`: poslední úspěšný běh každé úlohy, poslední chyby, spotřeba a hlášená zbývající kvóta, počty zápasů, `review`, zastaralé živé zápasy a `unconfirmed`, seznam zápasů ke kontrole.
- `GET /api/vysledky/stav/` s `Authorization: Bearer $RESULTS_ADMIN_TOKEN`: totéž jako JSON.
- `POST /api/vysledky/sync/`: ruční sync se stejnými zámky a rozpočtem. GET neexistuje.

## Nevyřešené podmínky (překážky veřejného nasazení)
1. **Tipsport partner API:** nemáme ověřené, že smluvní podmínky dovolují zobrazovat a archivovat výsledky a skóre na našem webu. Dnes zobrazujeme jen živé skóre, archiv je nové použití.
   - Neznáme ani limity frekvence. Minutový běh v oknech zápasů zvýší počet dotazů (viz výpočet).
   - **Potřeba potvrdit u Tipsportu (affiliate manažer).**
2. **api-football:** podmínky výslovně nedávají licenci ke zveřejnění dat („must be requested by the user from the competent authorities“). Před veřejným použitím je potřeba vyřešit práva u lig. Loga a fotky z API nepoužíváme.
3. **Práva lig:** data Chance Ligy a Premier League mohou podléhat právům organizátorů (LFA, Premier League). Faktický výsledek se obecně volně uvádí, ale systematický archiv s průběžným skóre posuďte.
4. **Strukturovaná data:** `SportsEvent` jen s ověřenými vlastnostmi. Výsledek jde do `description`, ne do vymyšlené vlastnosti. Speciální zobrazení v Googlu neslibujeme.
