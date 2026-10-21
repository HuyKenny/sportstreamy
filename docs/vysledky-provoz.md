# Výsledky: provoz (fotbal, 12 sledovaných soutěží)

Stav k 21. 10. 2026:
- **Živě od 21. 10. 2026 8:27.** Kenny schválil, Tipsport souhlasí za podmínky, že dodržíme jejich volání API.
- **Od 21. 10. 10:02** všech 12 kurátorovaných fotbalových soutěží: Chance Liga, Chance Národní liga, Liga mistrů, Evropská liga, Konferenční liga, Premier League, Championship, La Liga, Bundesliga, Serie A, Ligue 1 a Niké liga.
- **Licence api-football:** Kenny potvrdil, že Free plán smíme využívat v plném rozsahu. Klíč používá jen sportstreamy, takže strop je 95 dotazů za den.
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
Ligy api-football jsem ověřil přes `/leagues?id=` 21. 10., všechny mají aktuální sezónu 2026:

| Soutěž (slug) | Tipsport | api-football | Priorita |
|---|---|---|---|
| chance-liga | Česká Chance Liga | 345 Czech Liga | ano |
| premier-league | 1. anglická liga (+ WSL v review) | 39 | ano |
| liga-mistru | Liga mistrů | 2 | ano |
| evropska-liga | Evropská liga | 3 | ano |
| konferencni-liga | Konferenční liga | 848 | ano |
| chance-narodni-liga | Česká Chance Národní Liga | 346 FNL | |
| nike-liga | 1. slovenská liga | 332 Super Liga | |
| la-liga, bundesliga, serie-a, ligue-1, championship | 1. španělská / německá / italská / francouzská, 2. anglická | 140 / 78 / 135 / 61 / 40 | |

**Plán Free u api-football (ověřeno dotazy):**
- Funguje: `/fixtures?date=` (aktuální data, jen UTC včera až zítra), `/fixtures?id=` (góly, karty, statistiky, sestavy, hráči) a `/fixtures/headtohead`.
- Nefunguje: `ids=`, `season=2026` a tabulky.
- Loga týmů jsou na CDN `media.api-sports.io` a nepočítají se do kvóty.

## Spotřeba a frekvence
**Tipsport:** přesně jako před výsledky (live `*/3` = 480 dotazů za den, prematch `*/15` = 96 za den). Výsledky jen čtou tytéž odpovědi.

**api-football** v `*/15`:
- `RESULTS_API_CAP=95` za UTC den, `RESULTS_API_RESERVE=3` (pod tolik hlášených zbývajících nejdeme).
- `RESULTS_API_KEEP=25` dotazů zůstává pro kontrolu výsledků, nepovinná data se nad touto hranicí zastaví.

| Úloha | Kdy | Dotazy |
|---|---|---|
| seznam zápasů dne (`?date=`) | spárování: den s nespárovaným zápasem, max. 1× za 8 h; výsledky: zápas 100+ min po výkopu, který u nás není konečný, max. 1× za 30 min | 1 na den, pokryje všechny ligy |
| detail (`?id=`) | ukončený spárovaný zápas 2–72 h po výkopu, nejvýš 8 za běh; priority první | 1 na zápas, zároveň potvrdí výsledek |
| H2H | zápas od −3 h do +7 dní, když jsou oba týmy spárované (stačí ID týmů, dá se tedy rozložit do klidných dnů), nejvýš 8 za běh; priority první | 1 na zápas |

- **Objem:** ~130 zápasů týdně (týden 21.–27. 10.: st 10, čt 36, pá 11, so 42, ne 28, po 1, út 3), tedy ~130 detailů a ~130 H2H týdně plus seznamy dnů.
- **Nejvytíženější den** (sobota, 42 zápasů):
  - ~3 spárování a ~15–20 kontrol výsledků;
  - zbytek do 95 − 25 = 70 dostanou detaily a H2H, priority první;
  - co se nestihne, dorovná pondělí a úterý (detaily do 72 h, H2H 7 dní dopředu).
- **Den bez zápasu:** jen dohánění detailů a H2H, pokud zbývají.
- **Frekvence:**
  - Živé skóre co 3 min (Tipsport).
  - Potvrzení konce do ~15–30 min (api-football), detaily do několika hodin, u nepriorit podle rozpočtu i další den.

## Omezení bezplatného režimu
- Tabulky a forma týmů nejsou (Free plán bez sezónních dotazů).
- Detaily a H2H nepriorit se o víkendu můžou opozdit, kvóta 100 za den nestačí na 42 zápasů najednou.
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
2. **api-football:** Kenny potvrdil (21. 10.) povolení využívat Free plán v plném rozsahu. Uvádíme zdroj „API-Football“. Loga týmů na detailu jsou z jejich CDN (podle podmínek „pro identifikaci“), fotky hráčů nepoužíváme.
3. **Práva lig:** na faktické výsledky se obecně nevztahují. Systematický archiv s detailními statistikami ale může podléhat právům organizátorů. Riziko zůstává na straně provozovatele.
4. **Strukturovaná data:** `SportsEvent` jen s ověřenými vlastnostmi. Speciální zobrazení v Googlu neslibujeme.
