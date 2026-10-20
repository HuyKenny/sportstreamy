#!/usr/bin/env python3
"""Previews of big matches → src/content/nahledy/<slug>.md, then build + deploy + IndexNow + commit.

    python3 scripts/nahledy.py              # pick matches 10–60 h ahead, write up to MAX previews, deploy
    python3 scripts/nahledy.py --dry-run    # only list the candidates
    python3 scripts/nahledy.py --no-deploy  # write files, skip build/deploy/commit
    python3 scripts/nahledy.py --id 123     # force one Tipsport match id (still validated)

Which matches: football Liga mistrů / Evropská liga / Konferenční liga with a Czech club, Liga mistrů between two
big clubs, Chance Liga games between the top Czech clubs, Czech national teams (football, hockey).
Text: `claude -p` (Sonnet, account petr.korec = ~/.claude_account4) with WebSearch/WebFetch. It gets our facts
(time, odds, stream) as JSON and may add only what it verifies on the web — every such claim needs a source URL,
the Czech TV broadcaster only with a source, otherwise the page says it is not verified. A validator rejects
the text otherwise (length, team names, sources, banned phrases); a rejected match is retried next run.
Cron: bin/sportstreamy-nahledy.sh (daily 8:20).
"""
import json, os, re, subprocess, sys, time, unicodedata, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

APP = Path(__file__).resolve().parent.parent
OUT = APP / 'src' / 'content' / 'nahledy'
WORK = Path('/home/kenny/ai/tmp/sportstreamy-nahledy')
KV_ID = 'ad0a4a01c23a4ed7b01a4690449014f1'
TZ = ZoneInfo('Europe/Prague')
MAX = int(os.environ.get('NAHLEDY_MAX', '4'))
CLAUDE = os.environ.get('CLAUDE_BIN', '/home/kenny/.local/bin/claude')
MODEL = os.environ.get('NAHLEDY_MODEL', 'claude-sonnet-5')
FOOTBALL, HOCKEY = 16, 23

CZ_CLUBS = re.compile(r'\b(Slavia Praha|Sparta Praha|Plzeň|Viktoria Plzeň|Baník Ostrava|Jablonec|Mladá Boleslav|Sigma Olomouc|Olomouc|Slovan Liberec|Liberec|'
                      r'Teplice|Hradec Králové|Pardubice|Bohemians|Slovácko|Zlín|Karviná|Dukla Praha|Brno|Zbrojovka)\b')
TOP_CZ = re.compile(r'^(Slavia Praha|Sparta Praha|Plzeň|Viktoria Plzeň|Baník Ostrava)$')
BIG = re.compile(r'^(Real Madrid|FC Barcelona|Barcelona|Atlético Madrid|Bayern München|B Dortmund|Dortmund|Paris SG|Manchester City|Manchester United|'
                 r'Liverpool|Arsenal|Chelsea|Tottenham|Juventus Torino|Inter Milano|AC Milán|AC Milan|Napoli|AS Roma|Bayer Leverkusen|Leverkusen|Benfica|FC Porto)$')
EURO = {'Liga mistrů', 'Evropská liga', 'Konferenční liga'}
TV_NAMES = re.compile(r'\b(Nova Sport \d?|Nova Action|Voyo|O2 TV Sport|O2 TV|Oneplay|ČT ?sport|ČT ?Sport|Sport ?1|Sport ?2|Canal\+|Premier Sport|Eurosport|Max|Skylink|DAZN|Prima)\b')
BANNED = re.compile(r'jistá výhra|tutovka|garantovan|sázka jistoty|100\s*% jist|nelze prohrát|zaručen', re.I)


def slugify(s):
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def kv(key):
    r = subprocess.run(['pnpm', 'exec', 'wrangler', 'kv', 'key', 'get', key, '--namespace-id', KV_ID, '--remote'], cwd=APP, capture_output=True, text=True, check=True)
    return json.loads(r.stdout)['items']


def score(m):
    """0 = not a preview; higher = more interest from Czech searchers."""
    h, a, lg, sp = m['h'], m.get('a') or '', m['lg'], m['sp']
    if not a:
        return 0
    if sp == FOOTBALL:
        if lg in EURO and (CZ_CLUBS.search(h) or CZ_CLUBS.search(a)):
            return 100
        if re.search(r'Česko', h + a) and not re.search(r'U\d\d|žen|\(ž\)', lg + h + a):
            return 95
        if lg == 'Česká Chance Liga' and TOP_CZ.match(h) and TOP_CZ.match(a):
            return 90
        if lg == 'Liga mistrů' and BIG.match(h) and BIG.match(a):
            return 80
    if sp == HOCKEY and (h == 'Česko' or a == 'Česko'):
        return 85
    return 0


def existing_ids():
    ids = set()
    for f in OUT.glob('*.md'):
        m = re.search(r'^matchId:\s*(\d+)', f.read_text(encoding='utf-8'), re.M)
        if m:
            ids.add(int(m.group(1)))
    return ids


SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['title', 'description', 'tv', 'tvSource', 'sources', 'body', 'faq'],
    'properties': {
        'title': {'type': 'string'}, 'description': {'type': 'string'},
        'tv': {'type': 'string'}, 'tvSource': {'type': 'string'},
        'sources': {'type': 'array', 'items': {'type': 'string'}},
        'body': {'type': 'string'},
        'faq': {'type': 'array', 'items': {'type': 'object', 'additionalProperties': False, 'required': ['q', 'a'], 'properties': {'q': {'type': 'string'}, 'a': {'type': 'string'}}}},
    },
}

PROMPT = """Jsi sportovní redaktor českého webu SportStreamy.cz (přehled živých přenosů, licencované sázkové kanceláře Tipsport a Chance). Napiš náhled zápasu pro čtenáře, kteří hledají „{home} {away} online / kde sledovat / TV“.

FAKTA Z NAŠICH DAT (smíš je použít bez zdroje):
{facts}

POSTUP
1. Přes WebSearch/WebFetch ověř na důvěryhodných zdrojích (oficiální weby klubů, soutěže, UEFA, ČT, Nova, O2 TV, sport.cz, isport.cz, idnes.cz, sport.aktualne.cz, livesport.cz, ESPN, BBC):
   a) KDO zápas vysílá v české televizi / na české streamovací službě – jen pokud to výslovně uvádí zdroj pro TENTO zápas nebo pro celou soutěž v sezóně 2026/27 (zdroj z dřívějších sezón nestačí, práva se mění). Nejlepší zdroj TV: stránky soutěží na telly.cz (např. https://telly.cz/liga-mistru/, /evropska-liga/, /konferencni-liga/, /chance-liga/) – u zápasů uvádějí kanál. Tipovací a sázkové weby nejsou zdroj. Jinak nech tv a tvSource prázdné a v textu ani v FAQ žádnou stanici nejmenuj – napiš jen, že vysílatele se nepodařilo ověřit a ať čtenář mrkne do TV programu.
   b) Kontext: postavení v tabulce / skupině, forma posledních zápasů, důležité absence, vzájemné zápasy. Uveď jen to, co jsi ve zdroji skutečně našel. Každý zdroj, ze kterého bereš fakt, dej do „sources“ (plné URL).
2. Nic si nevymýšlej. Žádná čísla, jména hráčů ani výsledky, které nejsou ve faktech nebo ve zdrojích. Když něco nenajdeš, prostě to vynech.
3. Žádné tipy na výsledek, žádné „jisté výhry“. Kurzy jen popiš (favorit, pravděpodobnost z našich dat) a uveď, že jde o stav v době psaní – aktuální kurzy jsou v tabulce na stránce.

VÝSTUP (JSON podle schématu), česky, tykáním jako zbytek webu:
- title: „{home} – {away}: kde sledovat živě, TV a kurzy“ (můžeš upravit, max 70 znaků, obě jména týmů).
- description: 140–160 znaků, obsahuje obě jména, datum a „kde sledovat“.
- tv: název stanice / služby (např. „Nova Sport 1“) nebo prázdný řetězec; tvSource: URL zdroje nebo prázdný řetězec.
- body: Markdown, 350–600 slov, bez H1. Sekce (## nadpisy): „Kdy a kde se hraje“, „Kde sledovat {home} – {away} v TV a online“, „Forma a kontext“, „Co říkají kurzy“. V sekci o sledování: TV jen podle ověřeného zdroje; online uveď, že {stream_line}; přidej odkaz [detail zápasu se živým skóre]({match_url}). Odkazy používej jen tyto naše: {our_links}. Konec: věta o 18+ a zodpovědném hraní.
- faq: 3 otázky a odpovědi (kdy se hraje, kde sledovat, kdo je favorit podle kurzů), odpovědi 1–2 věty, bez odkazů.
"""


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


def claude(prompt, schema=None):
    env = {k: v for k, v in os.environ.items() if not (k.startswith('CLAUDE_CODE') or k in ('CLAUDECODE', 'CLAUDE_EFFORT', 'CLAUDE_PID'))}
    env['CLAUDE_CONFIG_DIR'] = '/home/kenny/.claude_account4'
    WORK.mkdir(parents=True, exist_ok=True)
    r = subprocess.run([CLAUDE, '-p', prompt, '--model', MODEL, '--output-format', 'json', '--json-schema', json.dumps(schema or SCHEMA),
                        '--allowedTools', 'WebSearch', 'WebFetch', '--name', 'discord-bot: sportstreamy-nahledy'],
                       cwd=WORK, env=env, capture_output=True, text=True, timeout=900)
    d = json.loads(r.stdout)
    if d.get('is_error'):
        raise RuntimeError(f"claude: {str(d.get('result'))[:200]}")
    out = d.get('structured_output') or d.get('result')
    if isinstance(out, str):
        out = json.loads(re.search(r'\{.*\}', out, re.S).group(0))
    return out, d.get('total_cost_usd', 0)


CHECK_SCHEMA = {
    'type': 'object', 'additionalProperties': False, 'required': ['body', 'faq', 'changes'],
    'properties': {
        'body': {'type': 'string'},
        'faq': SCHEMA['properties']['faq'],
        'changes': {'type': 'array', 'items': {'type': 'string'}},
    },
}

CHECK_PROMPT = """Jsi ověřovatel faktů. Níže je náhled zápasu {home} – {away} a seznam zdrojů. Fakta z našich dat (čas, kurzy, pravděpodobnost, jestli Tipsport vysílá video) jsou správně:
{facts}

ZDROJE: {sources}

ÚKOL: Otevři zdroje přes WebFetch (případně dohledej přes WebSearch) a ověř KAŽDÉ jiné faktické tvrzení v textu i v FAQ: výsledky, skóre, kdo vedl a kdo srovnal, střelci a minuty, data zápasů, pořadí a body v tabulce, jména trenérů a hráčů, absence, kdo vysílá v TV. Pozor hlavně na průběh zápasu (kdo dal gól na jaký stav).
- Tvrzení, které zdroj potvrzuje → nech.
- Tvrzení, které zdroj vyvrací → oprav podle zdroje.
- Tvrzení, které nejde potvrdit → smaž (případně přeformuluj obecněji bez čísel a jmen).
Nic nového nepřidávej. Zachovej nadpisy, odkazy, styl a délku přibližně stejnou. V „changes“ vypiš každou provedenou opravu nebo smazání jednou větou (prázdné pole, když bylo vše v pořádku).

TEXT:
{body}

FAQ (JSON):
{faq}
"""


def factcheck(p, m, facts):
    out, cost = claude(CHECK_PROMPT.format(home=m['h'], away=m['a'], facts=json.dumps(facts, ensure_ascii=False), sources='\n'.join(p['sources']) or '(žádné)',
                                           body=p['body'], faq=json.dumps(p['faq'], ensure_ascii=False)), CHECK_SCHEMA)
    return {**p, 'body': out['body'], 'faq': out['faq']}, out['changes'], cost


def validate(p, m):
    errs = []
    words = len(re.sub(r'[#*\[\]()]', ' ', p['body']).split())
    if not 300 <= words <= 900:
        errs.append(f'délka {words} slov')
    for team in (m['h'], m['a']):
        if team.split(' ')[0].lower() not in (p['title'] + p['body']).lower():
            errs.append(f'chybí tým {team}')
    if len(p['title']) > 80 or len(p['description']) > 170 or len(p['description']) < 90:
        errs.append('délka title/description')
    if p['tv'] and not p['tvSource'].startswith('http'):
        errs.append('TV bez zdroje')
    # A broadcaster named in the text must be the verified one — the model likes to fill in last season's rights holder.
    text = p['body'] + ' ' + ' '.join(q['a'] for q in p['faq'])
    named = {t for t in TV_NAMES.findall(text)}
    if named and not p['tv']:
        errs.append(f'TV v textu bez ověření {sorted(named)}')
    if re.search(r'TV program[^.]{0,40}na (naší|našem)', text):
        errs.append('slibuje TV program na našem webu')
    if BANNED.search(p['body'] + p['description']):
        errs.append('zakázaná fráze')
    if not p['sources'] and re.search(r'Forma a kontext', p['body']) and re.search(r'\d+\.\s*místě|\d+:\d+', p['body'].split('Forma a kontext')[-1].split('##')[0]):
        errs.append('fakta o formě bez zdrojů')
    links = re.findall(r'\]\((https?://[^)]+|/[^)]*)\)', p['body'])
    bad = [l for l in links if l.startswith('http') and 'sportstreamy.cz' not in l]
    if bad:
        errs.append(f'cizí odkazy v textu {bad[:2]}')
    if len(p['faq']) < 2:
        errs.append('málo FAQ')
    return errs


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def write(slug, m, p, sport_slug):
    st = datetime.fromtimestamp(m['st'] / 1000, timezone.utc).isoformat().replace('+00:00', 'Z')
    fm = ['---', f"title: {yaml_str(p['title'])}", f"description: {yaml_str(p['description'])}", f"matchId: {m['id']}",
          f"home: {yaml_str(m['h'])}", f"away: {yaml_str(m['a'])}", f"league: {yaml_str(m['lg'])}", f"sport: {sport_slug}", f'start: {st}']
    if p['tv'] and p['tvSource'].startswith('http'):
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


def check_file(path):
    """Fact-check an already written preview in place (used for the first batch and for spot checks)."""
    f = Path(path)
    raw = f.read_text(encoding='utf-8')
    fm, body = raw.split('\n---\n', 1)
    g = lambda k: json.loads(re.search(rf'^{k}: (.*)$', fm, re.M).group(1))
    faq = [{'q': json.loads(q), 'a': json.loads(a)} for q, a in re.findall(r'- q: (.*)\n    a: (.*)', fm)]
    mid = int(re.search(r'^matchId: (\d+)', fm, re.M).group(1))
    items = {x['id']: x for x in kv('pre') + kv('live')}
    m = items.get(mid) or {'h': g('home'), 'a': g('away'), 'st': 0}
    p = {'title': g('title'), 'description': g('description'), 'tv': '', 'tvSource': '', 'sources': g('sources'), 'body': body, 'faq': faq}
    p2, changes, cost = factcheck(p, m, facts_for(m, '') if m.get('st') else {})
    print(f'{f.name}: ${cost:.2f}')
    for ch in changes:
        print('  -', ch)
    errs = validate(p2, m)
    if errs:
        print('  ZAMÍTNUTO po kontrole:', errs)
        return
    fm_new = re.sub(r'faq:\n(?:  - q: .*\n    a: .*\n?)+', 'faq:\n' + ''.join(f"  - q: {yaml_str(q['q'])}\n    a: {yaml_str(q['a'])}\n" for q in p2['faq'][:4]), fm + '\n')
    f.write_text(fm_new.rstrip('\n') + '\n---\n' + p2['body'].strip() + '\n', encoding='utf-8')


def main():
    if '--check' in sys.argv:
        for path in sys.argv[sys.argv.index('--check') + 1:]:
            check_file(path)
        return
    dry = '--dry-run' in sys.argv
    force = [int(sys.argv[i + 1]) for i, a in enumerate(sys.argv) if a == '--id']
    items = kv('pre') + kv('live')
    now = time.time() * 1000
    have = existing_ids()
    sports = {16: 'fotbal', 23: 'hokej'}
    cands = []
    for m in items:
        if m['id'] in have:
            continue
        if force:
            if m['id'] in force:
                cands.append((999, m))
            continue
        s = score(m)
        if s and now + 10 * 3600_000 <= m['st'] <= now + 60 * 3600_000:
            cands.append((s, m))
    cands.sort(key=lambda x: (-x[0], x[1]['st']))
    cands = cands[:MAX]
    for s, m in cands:
        print(f"{s:3} {datetime.fromtimestamp(m['st'] / 1000, TZ):%d.%m %H:%M} {m['lg']} | {m['h']} – {m['a']}")
    if dry or not cands:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    made, total = [], 0.0
    for s, m in cands:
        sport_slug = sports.get(m['sp'], 'fotbal')
        comp = '/fotbal-online/' + {'Liga mistrů': 'liga-mistru', 'Evropská liga': 'evropska-liga', 'Konferenční liga': 'konferencni-liga', 'Česká Chance Liga': 'chance-liga'}.get(m['lg'], '') if m['sp'] == FOOTBALL else f'/{sport_slug}-online/'
        comp = comp.rstrip('/') + '/'
        slug = f"{slugify(m['h'])}-{slugify(m['a'])}-{datetime.fromtimestamp(m['st'] / 1000, TZ):%Y-%m-%d}"
        match_url = f"/zapas/{m['id']}-{slugify(m['h'] + ' ' + m['a'])}/"
        facts = facts_for(m, comp)
        stream_line = 'Tipsport zápas vysílá živě registrovaným zákazníkům zdarma (tlačítko Sledovat na naší stránce)' if m.get('stream') else \
            'Tipsport k zápasu video nevysílá (práva drží televize), ale nabízí živé statistiky, průběžné skóre a kurzy'
        prompt = PROMPT.format(home=m['h'], away=m['a'], facts=json.dumps(facts, ensure_ascii=False, indent=1), stream_line=stream_line,
                               match_url=match_url, our_links=f"{match_url}, {comp}, /sazkove-kancelare/tipsport/tv/, /clanky/kurzy-1x2-vysvetleni/, /zive/")
        try:
            p, cost = claude(prompt)
            p, changes, cost2 = factcheck(p, m, facts)
            cost = (cost or 0) + (cost2 or 0)
            total += cost
            for ch in changes:
                print(f'  oprava {slug}: {ch}')
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
