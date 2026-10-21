# Výsledky: provoz (pilot fotbal: Chance Liga + Premier League)

Stav k 21. 10. 2026:
- **Živě od 21. 10. 2026 8:27.** Kenny schválil, Tipsport souhlasí za podmínky, že dodržíme jejich volání API.
- Kód je v `main`. D1 `sportstreamy-results` (id `8cfeb3e9-5390-4b8d-9331-083ec169eadf`) má migrace 0001 a 0002.

## Architektura a zdroje
```
cron */3  → Tipsport live feed (beze změny proti dřívějšku) ─┐
cron */15 → Tipsport prematch (beze změny) ──────────────────┼→ normalizace → D1 → SSR stránky + /api/vysledky.json
cron */15 → api-football (jen když je co doplnit) ───────────┘
```
| Zdroj | Co dodává |
|---|---|
| **Tipsport** (stejná volání jako dřív, nic navíc) | program, čas výkopu, průběžné skóre a stav, `ended` |
| **api-football** (doplněk tam, kde Tipsport nestačí) | potvrzení konečného výsledku (Tipsport drží `ended` ve feedu jen 0–242 s, medián 60 s, změřeno na 217 zápasech), poločas, prodloužení, penalty, odložení, góly a karty, statistiky, sestavy, vzájemné zápasy |

**Párování api-football ↔ Tipsport:**
- Vždy musí sedět soutěž (liga 345 = Chance Liga, 39 = Premier League) a výkop v okně ±15 min.
- K tomu buď už ověřené ID týmů (`team_link`), nebo shoda obou jmen. Jedno jméno stačí jen tehdy, když je ve slotu jediný zápas na obou stranách.
- Nejednoznačné párování se nespáruje. Odporuje-li uložená vazba, nespáruje se taky.
- Rozdílné konečné skóre se označí `mismatch` a zůstane skóre Tipsportu.

### Moduly
| Soubor | Úloha |
|---|---|
| `src/lib/results/normalize.ts` | Tipsport / api-football → jednotné pozorování, stavy, týmy |
| `src/lib/results/store.ts` | upserty, dotazy, provozní přehled |
| `src/lib/results/sync.ts` | úlohy se zámkem a logem, párování |
| `src/lib/results/afstore.ts`, `afdata.ts` | api-football: dny k načtení, párování, převzetí výsledku, detaily, H2H |
| `src/lib/results/budget.ts` | rezervace kvóty, zámky, `runJob` |
| `src/lib/results/apifootball.ts` | klient api-football |
| `src/lib/results/page.ts`, `view.ts`, `time.ts`, `status.ts` | stránky, pražský den, popisky stavů |
| `src/components/MatchFacts.astro` | góly, statistiky, sestavy, H2H na detailu |

### Pravidla
- **Bez volání poskytovatele z návštěvy.** Návštěva, filtr ani bot poskytovatele nevolají (ověřeno).
- **Pojistky zápisu:**
  - Starší odpověď nepřepíše novější.
  - Konečný výsledek se nevrátí na „živě“.
  - Chybějící skóre nepřepíše poslední známé.
  - Prázdný feed se bere jako výpadek.
  - Odložení mění jen `start_utc`, URL zůstává.
- **Stavy:**
  - „Konec“ jen při `ended` od Tipsportu nebo FT/AET/PEN od api-football.
  - Zápas, který z feedu zmizí bez konce, je „Výsledek nepotvrzen“ s posledním známým skóre, dokud ho nepotvrdí api-football.
  - Neznámý text stavu se zobrazí slovy zdroje.
- **Týmy:** ženy, mládež, rezervy a týmy bez ID jdou do `review`. Patří sem i WSL pod „1. anglická liga“.
- **Čas:** v DB UTC, zobrazení Europe/Prague (testy změny času).

## Nastavení (`wrangler.jsonc` → `vars`, secrets přes `wrangler secret put`)
| Proměnná | Produkce teď | Význam |
|---|---|---|
| `RESULTS_ENABLED` | `on` | stránky `/vysledky/`, bloky na homepage a v soutěžích, archiv detailů, sitemap, položka v menu |
| `RESULTS_SYNC` | `on` | zápisy z cronu do D1 |
| `RESULTS_COMPETITIONS` | `chance-liga,premier-league` | slugy z `competitions.ts` |
| `RESULTS_APIFOOTBALL` | `on` | api-football jako doplněk (jen s `APISPORTS_KEY`) |
| `RESULTS_API_CAP` | `80` | náš denní strop na sdílené kvótě api-football |
| `RESULTS_API_RESERVE` | `20` | pod tolik zbývajících dotazů u poskytovatele nejdeme (klíč může používat i jiný projekt) |
| `RESULTS_STALE_MIN` | `10` | po kolika minutách bez potvrzení se u probíhajícího zápasu ukáže varování |
| `RESULTS_STATS` | `on` | nepovinná data z api-football: detaily ukončených zápasů a H2H |
| secret `RESULTS_ADMIN_TOKEN` | nastaven (hodnota v `credentials/.sportstreamy-credentials.env`) | Bearer pro `/api/vysledky/stav/` a `POST /api/vysledky/sync/`; bez něj oba vrací 404 |
| secret `APISPORTS_KEY` | nastaven | api-football, jen na serveru |

Lokálně: `.dev.vars` (vzor `.dev.vars.example`, bez skutečných hodnot). Hodnoty jsou v `~/ai/credentials/.sportstreamy-credentials.env`.

## Soutěže a sezóny
| Soutěž | Tipsport (ověřeno 21. 10.) | api-football (ověřeno 21. 10.) |
|---|---|---|
| Chance Liga | „Česká Chance Liga“, ročník `266198` | liga 345 „Czech Liga“, aktuální sezóna 2026 |
| Premier League | „1. anglická liga“, ročník `265573` (+ WSL v review) | liga 39 „Premier League“, aktuální sezóna 2026 |

**Plán Free u api-football (ověřeno dotazy):**
- `/fixtures?date=` vrací aktuální zápasy, ale **jen pro UTC včera až zítra**.
- `/fixtures?id=` vrátí góly, karty, statistiky, sestavy i hráče.
- `/fixtures/headtohead` funguje.
- **Nefunguje:** `/fixtures?ids=` a sezónní dotazy (`season=2026`, tabulky a střelci jdou jen pro 2022–2024).
- **Tabulky proto web nezobrazuje.**

## Spotřeba a frekvence
**Tipsport:** přesně jako před výsledky. Live feed `*/3` = 480 dotazů za den, prematch `*/15` = 96 za den. Výsledky jen čtou tytéž odpovědi.

**api-football:** běží v `*/15`, strop 80 za den, a nikdy nejde pod 20 zbývajících dotazů hlášených poskytovatelem. Kvóta se resetuje ve 00:00 UTC.

| Úloha | Kdy | Dotazy |
|---|---|---|
| seznam zápasů dne (`/fixtures?date=`) | spárování: den s nespárovaným pilotním zápasem, max. 1× za 6 h; výsledky: zápas 100+ min po výkopu bez konečného stavu u api-football, max. 1× za 10 min (v praxi 15) | 1 dotaz pokryje celý den |
| detail ukončeného zápasu (`/fixtures?id=`) | 1× po skončení, nejvýš 6 za běh, jen při rezervě ≥ 15 | 1 na zápas |
| vzájemné zápasy (`/fixtures/headtohead`) | 1× pro spárovaný zápas od 3 h před do 36 h po aktuálním čase, nejvýš 6 za běh, jen při rezervě ≥ 15 | 1 na zápas |

- **Den bez pilotního zápasu:** 0 dotazů.
- **Běžné kolo:** pátek až pondělí ~18 zápasů, takže 18 detailů a 18 H2H za týden plus ~2–4 seznamy na hrací den.
- **Nejvytíženější den** (sobota, ~13 zápasů v 5 časových blocích): 2 spárování (dnes a zítra) + ~10 kontrol výsledků + 13 detailů + ~8 H2H nedělních zápasů ≈ **35**. Strop 80 nebude třeba.
- Při ubývající kvótě jdou nepovinná data (detaily, H2H) pryč první, výsledky zůstanou.
- **Skutečná frekvence:**
  - Živé skóre co 3 min (Tipsport).
  - Potvrzení konce do ~15 min od posledního hvizdu, nejpozději v běhu 100+ min po výkopu.
  - Stránka dnešních výsledků si data znovu načte každých 60 s ve viditelné záložce.
  - HTML cache: přehled 60 s, živý detail 30 s, ukončený detail 3 600 s.

## Omezení bezplatného režimu
- Tabulky a forma týmů nejsou (Free plán bez sezónních dotazů).
- Detaily a H2H jen u spárovaných zápasů. Nespárovaný zápas (neobvyklé jméno ve sdíleném časovém slotu) zůstane bez nich.
- api-football vrací zápasy jen v okně včera až zítra. Zápas starší než ~1 den, který se nepodařilo potvrdit, zůstane „Výsledek nepotvrzen“.
- „Vzájemné zápasy“ jsou podle api-football, s anglickými názvy týmů.
- Měření: prokliky přes existující Analytics Engine (`detail-final*`), zobrazení stránek web neměří.

## Nasazení (provedeno 21. 10. 2026)
1. `wrangler d1 create sportstreamy-results` → id v `wrangler.jsonc`.
2. `wrangler d1 migrations apply sportstreamy-results --remote` (0001, 0002, obě aditivní).
3. `wrangler secret put RESULTS_ADMIN_TOKEN` (hodnota v credentials).
4. Přepínače `on`, `pnpm build && wrangler deploy`, CF purge everything, IndexNow `/vysledky/`.
5. Nová migrace: `pnpm exec wrangler d1 migrations apply sportstreamy-results --remote` před deployem kódu, který ji potřebuje.

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

## Podmínky zveřejnění dat
1. **Tipsport:** souhlas Kennymu dán (21. 10.) za podmínky, že dodržíme jejich volání API. Proto se počet dotazů na Tipsport nezvýšil, minutový běh se zrušil.
2. **api-football:** podmínky nedávají licenci ke zveřejnění dat („must be requested by the user from the competent authorities“). Kenny rozhodl, že ho použijeme jako doplněk. Uvádíme zdroj „API-Football“, loga ani fotky z API nepoužíváme.
3. **Práva lig:** na faktické výsledky se obecně nevztahují. Systematický archiv s detailními statistikami ale může podléhat právům organizátorů. Riziko zůstává na straně provozovatele.
4. **Strukturovaná data:** `SportsEvent` jen s ověřenými vlastnostmi. Speciální zobrazení v Googlu neslibujeme.
