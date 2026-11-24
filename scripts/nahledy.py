#!/usr/bin/env python3
"""Previews of big matches → src/content/nahledy/<slug>.md, then build + deploy + IndexNow + commit.

    python3 scripts/nahledy.py              # pick matches 10–60 h ahead, write up to MAX previews, deploy
    python3 scripts/nahledy.py --dry-run    # only list the candidates
    python3 scripts/nahledy.py --no-deploy  # write files, skip build/deploy/commit
    python3 scripts/nahledy.py --id 123     # force one Tipsport match id (still validated)
    NAHLEDY_WRITE_MODEL=… NAHLEDY_OPENAI_MODEL=… NAHLEDY_CHECK_MODEL=…   # switch models

Which matches (score ≥ 60, best MAX per run): Czech clubs in Europe, national teams, every Slavia/Sparta/Plzeň/Baník
league game, big games of the top five leagues, Tipsport extraliga top games, Czech tennis players on the main tour;
plus a +35 boost when Google Trends (CZ "trending now" RSS) or its headlines name a team or player — that is how NHL,
basketball, darts or a smaller Chance Liga game get in.
Pipeline (OpenAI Responses API, key in credentials/.openai-credentials.env; ~$0.1–0.2 per preview, switched from
claude -p on 20. 10. 2026 to cut cost):
  1. TV: parsed from telly.cz competition pages (no model) — match line, else the competition's channels, else "not verified".
  2. research (gpt-5-mini + web search): facts about form/table/absences, each with source URL and a verbatim quote.
  3. fact check (gpt-5-mini + web search): reopens every source, fixes or drops facts.
  4. writing (gpt-5.4-mini, no web): text only from our data, the TV line and the checked facts.
Why split: one model with web search wrote Spanish broadcasters as "TV", invented Tipsport audio streams and misread
goal sequences. The validator rejects the text otherwise (length, team names, unverified or foreign TV, banned phrases,
missing match link); a rejected match is retried next run.
Cron: bin/sportstreamy-nahledy.sh (daily 8:20).
"""
import json, os, re, subprocess, sys, time, unicodedata, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

APP = Path(__file__).resolve().parent.parent
OUT = APP / 'src' / 'content' / 'nahledy'
KV_ID = 'ad0a4a01c23a4ed7b01a4690449014f1'
TZ = ZoneInfo('Europe/Prague')
MAX = int(os.environ.get('NAHLEDY_MAX', '3'))  # ~$0.30 each → about $1/day at most
MODEL = os.environ.get('NAHLEDY_OPENAI_MODEL', 'gpt-5-mini')  # research (web search)
CHECK_MODEL = os.environ.get('NAHLEDY_CHECK_MODEL', MODEL)  # fact check (web search)
WRITE_MODEL = os.environ.get('NAHLEDY_WRITE_MODEL', 'gpt-5.4-mini')  # writing, no web — better Czech than gpt-5-mini
# USD per 1M tokens (input, cached input, output) and per web search call — for the cost line in the log
PRICES = {'gpt-5-mini': (0.25, 0.025, 2.0), 'gpt-5-nano': (0.05, 0.005, 0.40), 'gpt-5.4-mini': (0.75, 0.075, 4.5), 'gpt-5.4-nano': (0.20, 0.02, 1.25)}
SEARCH_CALL = 0.01
FOOTBALL, HOCKEY, TENNIS, BASKET, DARTS = 16, 23, 43, 7, 42

CZ_CLUBS = re.compile(r'\b(Slavia Praha|Sparta Praha|Plzeň|Viktoria Plzeň|Baník Ostrava|Jablonec|Mladá Boleslav|Sigma Olomouc|Olomouc|Slovan Liberec|Liberec|'
                      r'Teplice|Hradec Králové|Pardubice|Bohemians|Slovácko|Zlín|Karviná|Dukla Praha|Brno|Zbrojovka)\b')
TOP_CZ = re.compile(r'^(Slavia Praha|Sparta Praha|Plzeň|Viktoria Plzeň|Baník Ostrava)$')
BIG = re.compile(r'^(Real Madrid|FC Barcelona|Barcelona|Atlético Madrid|Bayern München|B Dortmund|Dortmund|Paris SG|Manchester City|Manchester United|'
                 r'Liverpool|Arsenal|Chelsea|Tottenham|Juventus Torino|Inter Milano|AC Milán|AC Milan|Napoli|AS Roma|Bayer Leverkusen|Leverkusen|Benfica|FC Porto)$')
EURO = {'Liga mistrů', 'Evropská liga', 'Konferenční liga'}
TOP_LEAGUES = {'1. anglická liga': 'premier-league', '1. španělská liga': 'la-liga', '1. německá liga': 'bundesliga', '1. italská liga': 'serie-a', '1. francouzská liga': 'ligue-1'}
BIG6 = re.compile(r'^(Manchester City|Manchester United|Liverpool|Arsenal|Chelsea|Tottenham|Newcastle|Aston Villa)$')
CZ_HOCKEY_TOP = re.compile(r'^(Sparta Praha|Pardubice|Třinec|Oceláři Třinec|Kometa Brno|Brno|Vítkovice|Plzeň|Liberec|Karlovy Vary|Mladá Boleslav|Litvínov|Hradec Králové|Olomouc|Kladno|České Budějovice|Zlín|Kladno)$')
# Czech tennis players as Tipsport writes them ("Lehečka Jiří"); main tour only (ITF/UTR/Challenger are excluded below).
CZ_TENNIS = re.compile(r'\b(Lehečka|Menšík|Macháč|Bělík|Kopřiva|Muchová|Krejčíková|Vondroušová|Nosková|Bouzková|Siniaková|Kvitová|Fruhvirtová|Valentová|Bejlek|Plíšková|Pliskova)\b')
LOW_TOUR = re.compile(r'ITF|UTR|Challenger|Setka|Exhibice|kvalifikace', re.I)
GRAND_SLAM = re.compile(r'Australian Open|Roland|French Open|Wimbledon|US Open')
COMP_PATH = {'Liga mistrů': '/fotbal-online/liga-mistru/', 'Evropská liga': '/fotbal-online/evropska-liga/', 'Konferenční liga': '/fotbal-online/konferencni-liga/',
             'Česká Chance Liga': '/fotbal-online/chance-liga/', 'NHL': '/hokej-online/nhl/', 'Česká Tipsport extraliga': '/hokej-online/tipsport-extraliga/',
             **{k: f'/fotbal-online/{v}/' for k, v in TOP_LEAGUES.items()}}
SPORT_SLUGS = {FOOTBALL: 'fotbal', HOCKEY: 'hokej', TENNIS: 'tenis', BASKET: 'basketbal', DARTS: 'sipky'}
TV_NAMES = re.compile(r'\b(Nova Sport \d?|Nova Action|Voyo|O2 TV Sport|O2 TV|Oneplay|ČT ?sport|ČT ?Sport|Sport ?1|Sport ?2|Canal\+|Premier Sport|Eurosport|Max|Skylink|DAZN|Prima)\b')
BANNED = re.compile(r'jistá výhra|tutovka|garantovan|sázka jistoty|100\s*% jist|nelze prohrát|zaručen|našich dat|interních dat|naše data|\(Pozn|\(Nap|Vykop|audio', re.I)


def slugify(s):
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def kv(key):
    r = subprocess.run(['pnpm', 'exec', 'wrangler', 'kv', 'key', 'get', key, '--namespace-id', KV_ID, '--remote'], cwd=APP, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)['items']


def live_items():
    """Matches from -3 h to +72 h as the live job (GitHub Actions, since 23. 11. 2026) last deployed them, or None while the
    site is still the SSR Worker (then KV is the source and this script deploys itself)."""
    try:
        req = urllib.request.Request('https://sportstreamy.cz/_data/nahledy.json', headers={'User-Agent': 'sportstreamy-nahledy/1.0'})
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())['items']
    except Exception:
        return None


def score(m):
    """Base interest of a match for Czech searchers (0 = not a preview on its own; trends can still lift it)."""
    h, a, lg, sp = m['h'], m.get('a') or '', m['lg'], m['sp']
    if not a or re.search(r'U\d\d|žen|\(ž\)|IPH|para|sledge|inline|futsal|beach|plážov', lg + h + a, re.I):
        return 0  # youth, women's, para and variant tournaments are not the "big match" searchers mean
    if sp == FOOTBALL:
        if lg in EURO and (CZ_CLUBS.search(h) or CZ_CLUBS.search(a)):
            return 100
        if 'Česko' in (h, a):
            return 95
        if lg == 'Česká Chance Liga' and TOP_CZ.match(h) and TOP_CZ.match(a):
            return 90
        if lg == 'Česká Chance Liga' and (TOP_CZ.match(h) or TOP_CZ.match(a)):
            return 82  # every Slavia, Sparta, Plzeň, Baník game: Czech searchers first
        if lg in EURO and BIG.match(h) and BIG.match(a):
            return 80
        if lg in TOP_LEAGUES and BIG.match(h) and BIG.match(a):
            return 76  # Premier League / La Liga / Bundesliga / Serie A big games
        if lg == '1. anglická liga' and BIG6.match(h) and BIG6.match(a):
            return 70
        if lg == 'Česká Chance Liga':
            return 40  # rest of the Czech league: only with a trend boost
    if sp == HOCKEY:
        if h == 'Česko' or a == 'Česko':
            return 85
        if lg == 'Česká Tipsport extraliga' and CZ_HOCKEY_TOP.match(h) and CZ_HOCKEY_TOP.match(a):
            return 60
        if lg == 'NHL':
            return 30  # NHL games with Czech players come up through the trends
    if sp == TENNIS and not LOW_TOUR.search(lg) and (CZ_TENNIS.search(h) or CZ_TENNIS.search(a)):
        return 80 if GRAND_SLAM.search(lg) else 65
    if sp in (BASKET, DARTS):
        return 20  # trend-only
    return 0


STOP = {'praha', 'united', 'city', 'club', 'sport', 'sporting', 'real', 'team', 'cesko', 'ceska', 'ceske', 'liga', 'zapas', 'vyhra', 'prohra', 'gol', 'goly',
        'trener', 'hrac', 'hraci', 'tymu', 'proti', 'sezona', 'sezony', 'nejlepsi', 'novy', 'nova', 'zpravy', 'pohar', 'skupina', 'kolo'}


def fold(t):
    return unicodedata.normalize('NFD', t.lower()).encode('ascii', 'ignore').decode()


def words(t):
    return {w for w in re.findall(r'[a-z]{5,}', fold(t)) if w not in STOP}


def trends():
    """Google Trends "trending now" for Czechia (official RSS, no key, ~10 searches a day with their news headlines).
    Returns [(search, words of the search + headlines)]; empty on any error — previews then run on base scores."""
    try:
        raw = urllib.request.urlopen(urllib.request.Request('https://trends.google.com/trending/rss?geo=CZ', headers={'User-Agent': 'Mozilla/5.0'}), timeout=20).read().decode('utf-8', 'ignore')
    except Exception as e:
        print(f'trendy nedostupné: {e}', file=sys.stderr)
        return []
    import html as _html
    out = []
    for it in re.findall(r'<item>(.*?)</item>', raw, re.S):
        title = _html.unescape(re.search(r'<title>(.*?)</title>', it, re.S).group(1)).strip()
        news = ' '.join(_html.unescape(x) for x in re.findall(r'<ht:news_item_title>(.*?)</ht:news_item_title>', it, re.S))
        out.append((title, words(title) | words(news)))
    return out


def trend_boost(m, tr):
    """+35 when a trending search (or its headlines) names one of the teams/players: e.g. "Michal Postava" → "Detroit povolal…" → Detroit's game."""
    names = words(m['h']) | words(m.get('a') or '')
    for title, ws in tr:
        hit = names & ws
        if hit:
            return 35, f'trend „{title}“ ({", ".join(sorted(hit))})'
    return 0, ''


def existing_ids():
    ids = set()
    for f in OUT.glob('*.md'):
        m = re.search(r'^matchId:\s*(\d+)', f.read_text(encoding='utf-8'), re.M)
        if m:
            ids.add(int(m.group(1)))
    return ids


FAQ_SCHEMA = {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['q', 'a'], 'properties': {'q': {'type': 'string'}, 'a': {'type': 'string'}}}}
FACTS_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['facts'],
    'properties': {'facts': {'type': 'array', 'items': {
        'type': 'object', 'additionalProperties': False, 'required': ['text', 'source', 'quote'],
        'properties': {'text': {'type': 'string'}, 'source': {'type': 'string'}, 'quote': {'type': 'string'}}}}},
}
CHECKED_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['facts', 'changes'],
    'properties': {'facts': FACTS_SCHEMA['properties']['facts'], 'changes': {'type': 'array', 'items': {'type': 'string'}}},
}
WRITE_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['title', 'description', 'body', 'faq'],
    'properties': {'title': {'type': 'string'}, 'description': {'type': 'string'}, 'body': {'type': 'string'}, 'faq': FAQ_SCHEMA},
}

# Step 2 — research: only facts with a source and a verbatim quote, nothing about TV (that comes from telly.cz).
RESEARCH_PROMPT = """Najdi na webu aktuální fakta k fotbalovému/hokejovému zápasu {home} – {away} ({league}, {kickoff}).
Hledej jen: postavení obou týmů v tabulce / ligové fázi soutěže {league}, výsledky jejich posledních zápasů (i v domácí lize), důležité absence (zranění, tresty) a vzájemné zápasy.
Zdroje: oficiální weby soutěží a klubů (uefa.com, clubs), livesport.cz, flashscore, sport.cz, isport.cz, idnes.cz, sport.aktualne.cz, ceskenoviny.cz, ESPN, BBC, kicker. Ne tipovací a sázkové weby.
Pravidla: každý fakt jedna česká věta s konkrétním údajem, k ní plná URL zdroje a doslovná citace ze zdroje (originální jazyk), která fakt dokládá. Jen fakta k sezóně 2026/27 a k těmto týmům. Max 8 faktů. Když nic spolehlivého nenajdeš, vrať prázdný seznam. Nic o TV vysílání ani o kurzech."""

# Step 3 — fact check: open every source again, keep only what it really says.
CHECK_PROMPT = """Ověř fakta k zápasu {home} – {away} ({league}, {kickoff}). U každého faktu otevři jeho zdroj (vyhledávání na webu) a porovnej s citací a se zdrojem.
- Zdroj fakt potvrzuje → ponech beze změny.
- Zdroj fakt vyvrací nebo ho říká jinak (pozor na skóre, kdo vedl, kdo srovnal, minuty, pořadí, body, data) → oprav text podle zdroje.
- Nejde ověřit, zdroj neexistuje, je o jiné sezóně nebo jiném zápase → fakt vyřaď.
Vrať ponechaná/opravená fakta a v „changes“ jednou větou každou opravu či vyřazení.

FAKTA (JSON):
{facts}"""

# Step 4 — writing without web access: only our data, the TV line and the checked facts.
WRITE_PROMPT = """Jsi sportovní redaktor českého webu SportStreamy.cz (přehled živých přenosů). Napiš náhled zápasu {home} – {away} pro čtenáře, kteří hledají „{home} {away} online / kde sledovat / TV“.

POUŽIJ VÝHRADNĚ TATO FAKTA (nic jiného nevíš; žádná jiná jména, čísla, výsledky ani stanice):
Naše data: {data}
TV v Česku: {tv_line}
Online: {stream_line}
Ověřená fakta o formě a kontextu: {facts}

STYL: sportovní novinář, plynulá přirozená čeština v celých větách, tykání. Žádné odrážky typu „Zápas: … Výkop: …“, žádné poznámky v závorkách, žádné zmínky o datech, zdrojích nebo ověřování, nic neopakuj. Výkop (ne „vykop“). Žádné tipy na výsledek. Kurzy jen popiš (favorit, pravděpodobnost z našich dat) a řekni, že jde o stav v době psaní a aktuální kurzy jsou v tabulce na stránce. Když je ověřených faktů málo, sekci o formě napiš krátce a obecně – nevymýšlej. Drž chronologii podle dat ve faktech („poslední zápas“ = nejnovější datum) a data zápasů ve faktech zachovej.

VÝSTUP (JSON):
- title: „{home} – {away}: kde sledovat živě, TV a kurzy“ (max 70 znaků).
- description: 140–160 znaků, obě jména, datum a „kde sledovat“.
- body: Markdown, 300–500 slov, bez H1, sekce ## „Kdy a kde se hraje“, „Kde sledovat {home} – {away} v TV a online“, „Forma a kontext“, „Co říkají kurzy“. V sekci o sledování přesně tento odkaz: [detail zápasu se živým skóre]({match_url}). Jiné odkazy jen tyto: {our_links}. Poslední věta: 18+ a zodpovědné hraní.
- faq: 3 otázky a odpovědi (kdy se hraje, kde sledovat, kdo je favorit podle kurzů), 1–2 věty, bez odkazů, bez zmínek „náš přehled / naše data“.
Názvy klubů skloňuj správně česky (porazil Sevillu, proti Lipsku)."""

TELLY = {'Liga mistrů': 'liga-mistru', 'Evropská liga': 'evropska-liga', 'Konferenční liga': 'konferencni-liga'}
CZ_TV = re.compile(r'(Nova Sport \d(?:, \d)*(?: a \d)?|Nova Action|ČT ?sport(?: Plus)?|Sport \d(?:, Sport \d)*(?: a Nova Sport \d)?|O2 TV Sport|Oneplay|Voyo|Premier Sport|Eurosport \d?|Canal\+ Sport)', re.I)


def tokens(name):
    w = re.findall(r'[a-z]{3,}', unicodedata.normalize('NFD', name.lower()).encode('ascii', 'ignore').decode())
    return [x for x in w if x not in ('fc', 'fk', 'afc', 'sk', 'rb', 'cf', 'ac', 'sc', 'club', 'praha')] or w


def tv_for(m):
    """Czech broadcaster from telly.cz: the match line if listed ("A vs. B: čtvrtek 22. 10. od 21:00, …, Sport 1"),
    else the competition's channel sentence. Returns (line for the writer, tv field, source) — tv '' when unknown."""
    page = TELLY.get(m['lg'])
    if not page:
        return 'Českého vysílatele se nepodařilo ověřit – čtenář ať se podívá do TV programu.', '', ''
    url = f'https://telly.cz/{page}/'
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode('utf-8', 'ignore')
    except Exception:
        return 'Českého vysílatele se nepodařilo ověřit – čtenář ať se podívá do TV programu.', '', ''
    text = re.sub(r'<[^>]+>', ' ', re.sub(r'</(p|li|h\d|div|tr)>', '\n', raw))
    import html as _html
    lines = [re.sub(r'\s+', ' ', _html.unescape(l)).strip() for l in text.split('\n')]
    st = datetime.fromtimestamp(m['st'] / 1000, TZ)
    date = f'{st.day}. {st.month}.'
    th, ta = tokens(m['h']), tokens(m['a'])
    for l in lines:
        if ' vs. ' not in l or date not in l or len(l) > 220:
            continue
        low = ' '.join(tokens(l))
        if any(t[:5] in low for t in th) or any(t[:5] in low for t in ta):
            ch = CZ_TV.findall(l.split(date, 1)[1])
            if ch:
                return f'Zápas vysílá v Česku {ch[-1]} (živě).', ch[-1], url
    comp = next((l for l in lines if 'najdete na Telly na kanálech' in l), '')
    ch = re.search(r'na kanálech (.+?)\s*\.', comp)
    if ch:
        return (f'Soutěž {m["lg"]} vysílají letos v Česku kanály {ch.group(1)}; na kterém poběží tento zápas, upřesní TV program.',
                ch.group(1).replace(', ', ' / ').replace(' a ', ' / '), url)
    return 'Českého vysílatele se nepodařilo ověřit – čtenář ať se podívá do TV programu.', '', ''


def facts_for(m, comp_path):
    st = datetime.fromtimestamp(m['st'] / 1000, TZ)
    o = (m.get('o') or {}).get('t')
    c = (m.get('o') or {}).get('c')
    prob = None
    if o and all(o[i] for i in (0, 2)):
        inv = [1 / x if x else 0 for x in o]
        s = sum(inv)
        prob = [round(x / s * 100) for x in inv]
    return {
        'domaci': m['h'], 'hoste': m['a'], 'soutez': m['lg'],
        'vykop': st.strftime('%-d. %-m. %Y v %H:%M') + ' (středoevropský čas)',
        'den_v_tydnu': ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'][st.weekday()],
        'kurzy_tipsport_1_X_2': o, 'kurzy_chance_1_X_2': c,
        'pravdepodobnost_z_kurzu_procenta_1_X_2': prob,
        'tipsport_vysila_video': bool(m.get('stream')),
        'url_souteze_na_webu': comp_path,
    }


def openai_key():
    for l in open('/home/kenny/ai/credentials/.openai-credentials.env', encoding='utf-8'):
        if l.startswith('OPENAI_API_KEY='):
            return l.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('OPENAI_API_KEY missing')


CITE = re.compile(r'\s*\(\[[^\]]*\]\((https?://[^)\s]+)\)\)')  # "([telly.cz](https://…?utm_source=openai))" web search appends


def clean_url(u):
    return re.sub(r'[?&]utm_source=openai$', '', re.sub(r'utm_source=openai&', '', u))


# OpenAI first; when the account has no credit (24. 11. 2026: "You have no credits remaining") the rest of the run goes
# through `claude -p` (Sonnet with WebSearch/WebFetch, the Claude subscription – no per-call bill). NAHLEDY_ENGINE=claude|openai forces one.
ENGINE = os.environ.get('NAHLEDY_ENGINE', 'auto')
CLAUDE_BIN = os.environ.get('CLAUDE_BIN', '/home/kenny/.local/bin/claude')
CLAUDE_CONFIG = os.environ.get('NAHLEDY_CLAUDE_CONFIG', '/home/kenny/.claude_account4')  # same account as the Discord bot
CLAUDE_MODEL = os.environ.get('NAHLEDY_CLAUDE_MODEL', 'sonnet')  # Kenny: no Opus for batch jobs
_claude = {'on': ENGINE == 'claude'}


def ask(prompt, schema, model, effort='low', web=True):
    """Structured answer + cost: OpenAI, or Claude when OpenAI is out of credit (see ENGINE)."""
    if not _claude['on']:
        try:
            return ask_openai(prompt, schema, model, effort, web)
        except RuntimeError as e:
            if ENGINE != 'auto' or 'insufficient_quota' not in str(e):
                raise
            _claude['on'] = True
            print('OpenAI bez kreditu → zbytek běhu přes claude -p', file=sys.stderr)
    return ask_claude(prompt, schema, web)


def ask_claude(prompt, schema, web=True):
    """`claude -p` in a clean environment (no CLAUDECODE/CLAUDE_CODE_* of a parent session) and a neutral cwd, so the
    run neither joins nor shows up among the workspace sessions. JSON is requested in the prompt and parsed loosely."""
    import tempfile
    full = (prompt + '\n\nOdpověz POUZE jedním JSON objektem přesně podle tohoto JSON Schema (žádný další text, žádné ```):\n'
            + json.dumps(schema, ensure_ascii=False))
    if web:
        full += '\nK ověření použij nástroje WebSearch a WebFetch.'
    env = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE_CODE') or k in ('CLAUDECODE', 'CLAUDE_EFFORT', 'CLAUDE_CONFIG_DIR'))}
    env['CLAUDE_CONFIG_DIR'] = CLAUDE_CONFIG
    cmd = [CLAUDE_BIN, '-p', full, '--output-format', 'json', '--model', CLAUDE_MODEL]
    if web:
        cmd += ['--allowedTools', 'WebSearch', 'WebFetch']
    with tempfile.TemporaryDirectory() as cwd:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=1200)
    try:
        d = json.loads(r.stdout)
    except ValueError:
        raise RuntimeError(f'claude -p: {(r.stdout or r.stderr)[:200]}')
    if d.get('is_error'):
        raise RuntimeError(f"claude -p: {str(d.get('result'))[:200]}")
    text = str(d.get('result') or '')
    a, b = text.find('{'), text.rfind('}')
    if a < 0 or b < a:
        raise RuntimeError(f'claude -p bez JSON: {text[:160]}')
    out = json.loads(text[a:b + 1])
    if 'changes' in schema.get('required', []):
        out.setdefault('changes', [])
    for k in schema.get('required', []):
        if k not in out:
            raise RuntimeError(f'claude -p: chybí pole {k}')
    for f in out.get('facts', []):
        f['text'] = CITE.sub('', str(f.get('text', '')))
        u = re.search(r'https?://[^\s)\]]+', str(f.get('source', '')))
        f['source'] = clean_url(u.group(0)) if u else ''
        f['quote'] = str(f.get('quote', ''))
    return out, 0.0  # subscription: no per-call cost (the CLI reports a notional total_cost_usd)


def ask_openai(prompt, schema, model, effort='low', web=True):
    """One Responses API call with strict JSON output (and the web_search tool) → (dict, cost in USD)."""
    body = {'model': model, 'reasoning': {'effort': effort}, 'input': prompt,
            'text': {'format': {'type': 'json_schema', 'name': 'out', 'strict': True, 'schema': schema}}}
    if web:
        body['tools'] = [{'type': 'web_search'}]
    req = urllib.request.Request('https://api.openai.com/v1/responses', data=json.dumps(body).encode(),
                                 headers={'Authorization': f'Bearer {openai_key()}', 'Content-Type': 'application/json'})
    for i in range(3):
        try:
            r = json.load(urllib.request.urlopen(req, timeout=600))
            break
        except urllib.error.HTTPError as e:
            body = e.read()[:300]
            if b'insufficient_quota' in body:  # no credit: retrying will not help
                raise RuntimeError(f'openai {e.code}: insufficient_quota')
            if e.code in (429, 500, 502, 503) and i < 2:
                time.sleep(30 * (i + 1))
                continue
            raise RuntimeError(f'openai {e.code}: {body[:200]}')
    if r.get('status') != 'completed':
        raise RuntimeError(f"openai status {r.get('status')}: {str(r.get('incomplete_details') or r.get('error'))[:200]}")
    text = ''.join(c['text'] for o in r['output'] if o['type'] == 'message' for c in o['content'] if c['type'] == 'output_text')
    u = r.get('usage') or {}
    pin, pcache, pout = PRICES.get(model, PRICES['gpt-5-mini'])
    cached = (u.get('input_tokens_details') or {}).get('cached_tokens', 0)
    searches = sum(1 for o in r['output'] if o['type'] == 'web_search_call')
    cost = ((u.get('input_tokens', 0) - cached) * pin + cached * pcache + u.get('output_tokens', 0) * pout) / 1e6 + searches * SEARCH_CALL
    out = json.loads(text)
    for f in out.get('facts', []):
        f['text'] = CITE.sub('', f['text'])
        u = re.search(r'https?://[^\s)\]]+', f['source'])  # the checker sometimes returns "([site](url))"
        f['source'] = clean_url(u.group(0)) if u else ''
    return out, cost


def preview(m, comp, match_url):
    """Steps 1–4 for one match → (preview dict, cost, log lines)."""
    log, cost = [], 0.0
    kickoff = datetime.fromtimestamp(m['st'] / 1000, TZ).strftime('%-d. %-m. %Y %H:%M')
    tv_line, tv, tv_src = tv_for(m)
    log.append(f'TV: {tv or "neověřeno"}')
    found, c1 = ask(RESEARCH_PROMPT.format(home=m['h'], away=m['a'], league=m['lg'], kickoff=kickoff), FACTS_SCHEMA, MODEL, 'medium')
    facts = [f for f in found['facts'] if f['source'] and f['quote'].strip()]
    checked, c2 = ask(CHECK_PROMPT.format(home=m['h'], away=m['a'], league=m['lg'], kickoff=kickoff, facts=json.dumps(facts, ensure_ascii=False, indent=1)),
                      CHECKED_SCHEMA, CHECK_MODEL, 'medium') if facts else ({'facts': [], 'changes': []}, 0.0)
    checked['facts'] = [f for f in checked['facts'] if f['source']]
    log += [f'fakta: nalezeno {len(facts)}, po kontrole {len(checked["facts"])}'] + [f'oprava: {x}' for x in checked['changes']]
    stream_line = ('Tipsport zápas vysílá živě registrovaným zákazníkům zdarma (tlačítko Sledovat na naší stránce).' if m.get('stream') else
                   'Tipsport k zápasu video nevysílá (práva drží televize), ale nabízí živé statistiky, průběžné skóre a kurzy. O Tipsportu nic dalšího netvrď.')
    prompt = WRITE_PROMPT.format(home=m['h'], away=m['a'], data=json.dumps(facts_for(m, comp), ensure_ascii=False), tv_line=tv_line, stream_line=stream_line,
                                 facts=json.dumps([f['text'] for f in checked['facts']], ensure_ascii=False) if checked['facts'] else '(žádná – sekci o formě napiš obecně)',
                                 match_url=match_url, our_links=f"{comp}, /sazkove-kancelare/tipsport/tv/, /clanky/kurzy-1x2-vysvetleni/, /zive/")
    c3 = 0.0
    for attempt in range(2):  # writing is cheap (no web): one retry with the validator's complaints
        p, c = ask(prompt, WRITE_SCHEMA, WRITE_MODEL, 'low', web=False)
        p = tidy(p, m)
        c3 += c
        p.update(tv=tv, tvSource=tv_src, tvLine=tv_line, sources=list(dict.fromkeys(([tv_src] if tv_src else []) + [f['source'] for f in checked['facts']])))
        errs = validate(p, m)
        if not errs:
            break
        log.append(f'přepis po validaci: {"; ".join(errs)}')
        prompt += '\n\nPŘEDCHOZÍ VERZE BYLA ODMÍTNUTA, oprav: ' + '; '.join(errs)
    return p, c1 + c2 + c3, log


def expand_channels(line):
    """'Nova Sport 3, 4, 5 a 6' → 'Nova Sport 3, Nova Sport 4, Nova Sport 5, Nova Sport 6' (validator compares names one by one)."""
    return re.sub(r'(Nova Sport|Sport|Eurosport) (\d)((?:, \d)*)(?: a (\d))?',
                  lambda m: ', '.join(f'{m.group(1)} {d}' for d in [m.group(2)] + re.findall(r'\d', m.group(3)) + ([m.group(4)] if m.group(4) else [])), line)


def tidy(p, m):
    """Fix what does not need a model: title/description length (built from the match itself) and the "our data"
    phrasing the writer keeps using for the facts we hand it. Everything else is left to the validator."""
    h, a = m['h'], m['a']
    if len(p['title']) > 80:
        p['title'] = next(t for t in (f'{h} – {a}: kde sledovat živě, TV a kurzy', f'{h} – {a}: kde sledovat živě', f'{h} – {a}') if len(t) <= 80 or t == f'{h} – {a}')
    if not 120 <= len(p['description']) <= 170:
        st = datetime.fromtimestamp(m['st'] / 1000, TZ)
        day = ['pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota', 'neděle'][st.weekday()]
        d = f'Kde sledovat {h} – {a} ({m["lg"]}), {day} {st.day}. {st.month}. v {st:%H:%M}: TV vysílání, živý přenos online, kurzy a forma obou týmů.'
        if len(d) > 170:
            d = d.replace(' a forma obou týmů', '').replace(f' ({m["lg"]})', '')
        if len(d) < 120:
            d += ' Přehled před zápasem.'
        p['description'] = d[:170]
    def fix(t):
        t = re.sub(r'\b([Pp]odle|[Dd]le|[Zz]|[Vv]e?)\s+(našich|interních)\s+dat\b', lambda x: f'{x.group(1)} dostupných údajů', t)
        return re.sub(r'\b([Nn])aše data\b', lambda x: ('D' if x.group(1) == 'N' else 'd') + 'ostupné údaje', t)
    p['body'] = fix(p['body'])
    p['description'] = fix(p['description'])
    p['faq'] = [{'q': q['q'], 'a': fix(q['a'])} for q in p['faq']]
    return p


def validate(p, m):
    errs = []
    words = len(re.sub(r'[#*\[\]()]', ' ', p['body']).split())
    if not 250 <= words <= 800:
        errs.append(f'délka {words} slov')
    for team in (m['h'], m['a']):
        if team.split(' ')[0].lower() not in (p['title'] + p['body']).lower():
            errs.append(f'chybí tým {team}')
    if len(p['title']) > 80 or len(p['description']) > 170 or len(p['description']) < 120:
        errs.append('délka title/description')
    # A broadcaster named in the text must be one telly.cz gave us — models like to fill in another country's or last season's.
    text = p['body'] + ' ' + ' '.join(q['a'] for q in p['faq'])
    allowed = {t.lower().replace(' ', '') for t in TV_NAMES.findall(expand_channels(p.get('tvLine', '')))}
    named = {t for t in TV_NAMES.findall(text) if t.lower().replace(' ', '') not in allowed}
    if named:
        errs.append(f'TV v textu bez ověření {sorted(named)}')
    if re.search(r'Movistar|Orange TV|DAZN|Sky Sport|beIN|TNT Sports|CBS|Prime Video', text):
        errs.append('zahraniční vysílatel')
    if re.search(r'TV program[^.]{0,40}na (naší|našem)', text):
        errs.append('slibuje TV program na našem webu')
    bad_phrase = BANNED.search(p['body'] + ' ' + p['description'] + ' ' + ' '.join(q['a'] for q in p['faq']))
    if bad_phrase:
        errs.append(f'zakázaná fráze „{bad_phrase.group(0)}“')
    links = re.findall(r'\]\((https?://[^)]+|/[^)]*)\)', p['body'])
    bad = [l for l in links if l.startswith('http') and 'sportstreamy.cz' not in l]
    if bad:
        errs.append(f'cizí odkazy v textu {bad[:2]}')
    if '18' not in p['body'].strip().split('\n')[-1]:
        errs.append('chybí závěrečná věta 18+')
    if '/zapas/' not in p['body']:
        errs.append('chybí odkaz na detail zápasu')
    if len(p['faq']) < 2:
        errs.append('málo FAQ')
    return errs


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def write(slug, m, p, sport_slug):
    st = datetime.fromtimestamp(m['st'] / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')
    fm = ['---', f"title: {yaml_str(p['title'])}", f"description: {yaml_str(p['description'])}", f"matchId: {m['id']}",
          f"home: {yaml_str(m['h'])}", f"away: {yaml_str(m['a'])}", f"league: {yaml_str(m['lg'])}", f"sport: {sport_slug}", f'start: {st}']
    if p.get('tv') and p.get('tvSource', '').startswith('http'):
        fm += [f"tv: {yaml_str(p['tv'])}", f"tvSource: {yaml_str(p['tvSource'])}"]
    src = [u for u in p['sources'] if u.startswith('http')][:8]
    fm.append('sources: ' + json.dumps(src, ensure_ascii=False))
    fm.append('faq:')
    for q in p['faq'][:4]:
        fm += [f"  - q: {yaml_str(q['q'])}", f"    a: {yaml_str(q['a'])}"]
    fm += [f"date: {datetime.now(TZ).date().isoformat()}", '---', '']
    (OUT / f'{slug}.md').write_text('\n'.join(fm) + p['body'].strip() + '\n', encoding='utf-8')


def sh(cmd, **kw):
    return subprocess.run(cmd, cwd=APP, check=True, capture_output=True, text=True, **kw)


def main():
    dry = '--dry-run' in sys.argv
    force = [int(sys.argv[i + 1]) for i, a in enumerate(sys.argv) if a == '--id']
    # A match in play is in both snapshots: one entry per id.
    static = live_items()
    items = static if static is not None else list({m['id']: m for m in kv('pre') + kv('live')}.values())
    now = time.time() * 1000
    have = existing_ids()
    sports = SPORT_SLUGS
    tr = trends()
    if tr:
        print('trendy CZ: ' + ', '.join(t for t, _ in tr))
    cands = []
    why = {}
    for m in items:
        if m['id'] in have:
            continue
        if force:
            if m['id'] in force:
                cands.append((999, m))
            continue
        base = score(m)
        if not base or not (now + 10 * 3600_000 <= m['st'] <= now + 60 * 3600_000):
            continue
        boost, reason = trend_boost(m, tr)
        s = base + boost
        # Own threshold 60: big matches on their own; Chance Liga, NHL, basketball and darts only when people search for them.
        if s >= 60:
            cands.append((s, m))
            why[m['id']] = reason
    cands.sort(key=lambda x: (-x[0], x[1]['st']))
    cands = cands[:MAX]
    for s, m in cands:
        print(f"{s:3} {datetime.fromtimestamp(m['st'] / 1000, TZ):%d.%m %H:%M} {m['lg']} | {m['h']} – {m['a']}{'  ← ' + why[m['id']] if why.get(m['id']) else ''}")
    if dry or not cands:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    made, total = [], 0.0
    for s, m in cands:
        sport_slug = sports.get(m['sp'], 'fotbal')
        comp = COMP_PATH.get(m['lg'], f'/{sport_slug}-online/')
        slug = f"{slugify(m['h'])}-{slugify(m['a'])}-{datetime.fromtimestamp(m['st'] / 1000, TZ):%Y-%m-%d}"
        match_url = f"/zapas/{m['id']}-{slugify(m['h'] + ' ' + m['a'])}/"
        try:
            p, cost, log = preview(m, comp, match_url)
            total += cost
            for line in log:
                print(f'  {slug}: {line}')
            errs = validate(p, m)
            if errs:
                print(f"ZAMÍTNUTO {slug}: {'; '.join(errs)}", file=sys.stderr)
                continue
            write(slug, m, p, sport_slug)
            made.append(slug)
            print(f'OK {slug} (${cost:.2f})')
        except Exception as e:
            print(f'CHYBA {slug}: {e}', file=sys.stderr)
    print(f'celkem ${total:.2f}, nových {len(made)}')
    if not made or '--no-deploy' in sys.argv:
        return
    sh(['pnpm', 'exec', 'astro', 'check'])
    if static is not None:
        # Static site: the push starts the live job (.github/workflows/live.yml), which builds and deploys; the hourly
        # IndexNow cron sends the new pages from the sitemap.
        sh(['git', 'add', 'src/content/nahledy'])
        sh(['git', '-c', 'user.name=Kenny', '-c', 'user.email=kenny@localhost', 'commit', '-qm', f"Match previews: {', '.join(made)}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"])
        subprocess.run(['git', 'push', '-q', 'origin', 'main'], cwd=APP, check=False)
        return
    sh(['pnpm', 'build'])
    sh(['pnpm', 'exec', 'wrangler', 'deploy'])
    purge(['sportstreamy.cz/jak-sledovat/', 'sportstreamy.cz/zapas/', 'sportstreamy.cz/sitemap-pages.xml'], home=True)
    urls = ['https://sportstreamy.cz/jak-sledovat/'] + [f'https://sportstreamy.cz/jak-sledovat/{s}/' for s in made]
    subprocess.run(['python3', '/home/kenny/ai/bin/indexnow.py', 'sportstreamy', *urls], check=False)
    sh(['git', 'add', 'src/content/nahledy'])
    sh(['git', '-c', 'user.name=Kenny', '-c', 'user.email=kenny@localhost', 'commit', '-qm', f"Match previews: {', '.join(made)}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"])
    subprocess.run(['git', 'push', '-q', 'origin', 'main'], cwd=APP, check=False)


def purge(prefixes, home=False):
    env = {}
    for l in open('/home/kenny/ai/credentials/.cloudflare-credentials.env', encoding='utf-8'):
        if '=' in l and not l.startswith('#'):
            k, v = l.strip().split('=', 1)
            env[k] = v.strip('"\'')
    h = {'X-Auth-Email': env['CF_EMAIL'], 'X-Auth-Key': env['CF_API_KEY'], 'Content-Type': 'application/json'}
    url = 'https://api.cloudflare.com/client/v4/zones/d9e46add44e303b6215f51e278f8fa30/purge_cache'
    urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({'prefixes': prefixes}).encode(), headers=h), timeout=30)
    if home:
        urllib.request.urlopen(urllib.request.Request(url, data=json.dumps({'files': ['https://sportstreamy.cz/']}).encode(), headers=h), timeout=30)


if __name__ == '__main__':
    main()
