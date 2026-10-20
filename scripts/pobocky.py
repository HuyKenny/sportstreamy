#!/usr/bin/env python3
"""Branch offices of bookmakers → KV key `pobocky` (read by /pobocky/ pages, no redeploy needed).

    python3 scripts/pobocky.py            # fetch, write data/pobocky.json, upload to the production KV
    python3 scripts/pobocky.py --local    # same, but into the local `wrangler dev` KV
    python3 scripts/pobocky.py --dry-run  # fetch and print counts only

Sources (20. 10. 2026):
- Fortuna: public JSON https://api.ifortuna.cz/shop-locator/list/v2 (works from the Raspberry).
- Tipsport, Chance: their locators block the Raspberry IP (403/Akamai) and have no JSON API — the list is rendered
  into the page. Fetched through Apify (puppeteer-scraper, residential CZ proxy) as page text: city, "street | zip".
  No GPS and no opening hours there; the region comes from the zip prefix (learned from the Fortuna data).
- Allwyn: >7 000 points of sale, map without a usable list — not included yet.
A brand whose fetch fails keeps its previous data (never wipe a brand).
"""
import collections, json, re, subprocess, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
OUT = APP / 'data' / 'pobocky.json'
KV_ID = 'ad0a4a01c23a4ed7b01a4690449014f1'
UA = 'Mozilla/5.0 (sportstreamy.cz pobocky; +https://sportstreamy.cz)'
DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']


def slug(s):
    s = unicodedata.normalize('NFD', s.lower()).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def city_of(municipality):
    """'Praha 4' → 'Praha'; other municipalities stay as they are ('Frýdek-Místek', 'Ústí nad Labem')."""
    return 'Praha' if re.match(r'^Praha\b', municipality) else municipality.strip()


def hours(day):
    if not day:
        return ''
    a, b = day.get('amStart'), day.get('pmEnd') or day.get('amEnd')
    if day.get('amEnd') and day.get('pmStart'):
        return f"{a}–{day['amEnd']}, {day['pmStart']}–{day.get('pmEnd', '')}"
    return f'{a}–{b}' if a and b else ''


def fortuna():
    req = urllib.request.Request('https://api.ifortuna.cz/shop-locator/list/v2', headers={'User-Agent': UA, 'Origin': 'https://www.ifortuna.cz', 'Referer': 'https://www.ifortuna.cz/pobocky'})
    data = json.load(urllib.request.urlopen(req, timeout=60))['branchOfficesDetail']
    out = []
    for i in data:
        city = city_of(i['municipality'])
        out.append({
            'name': i['name'].removesuffix(' F').strip(),
            'street': i['street'],
            'city': city,
            'part': i['municipality'] if i['municipality'] != city else '',
            'zip': i.get('zipCode', ''),
            'region': i.get('region', ''),
            'lat': i['geoLocation']['lat'], 'lon': i['geoLocation']['lng'],
            'note': (i.get('info') or '').strip(),
            'hours': [hours(i.get(d) or {}) for d in DAYS],
            'live': bool(i['flags'].get('live')),
        })
    return out


APIFY_PAGE_FN = """async function pageFunction({ page }) {
  await new Promise(r => setTimeout(r, 8000));
  return await page.evaluate(() => { const t = document.body.innerText; const i = t.indexOf('Seznam poboček'); return { url: location.href, list: i >= 0 ? t.slice(i) : '' }; });
}"""
_apify_cache = {}


def apify_token():
    for l in open('/home/kenny/ai/credentials/.apify-credentials.env', encoding='utf-8'):
        if l.startswith('APIFY_API_TOKEN='):
            return l.split('=', 1)[1].strip().strip('"\'')
    raise RuntimeError('APIFY_API_TOKEN missing')


def apify_lists(hosts=('tipsport.cz', 'chance.cz')):
    """Locator pages in one Apify run → {host: page text}. Cached so tipsport() and chance() share the run."""
    if all(h in _apify_cache for h in hosts):
        return _apify_cache
    tok = apify_token()
    api = 'https://api.apify.com/v2'
    body = {
        'startUrls': [{'url': f'https://www.{h}/pobocky'} for h in hosts if h not in _apify_cache],
        'linkSelector': '', 'pageFunction': APIFY_PAGE_FN,
        'proxyConfiguration': {'useApifyProxy': True, 'apifyProxyGroups': ['RESIDENTIAL'], 'apifyProxyCountry': 'CZ'},
        'proxyRotation': 'PER_REQUEST', 'useChrome': True, 'maxConcurrency': 1, 'maxRequestRetries': 6,
        'pageLoadTimeoutSecs': 90, 'pageFunctionTimeoutSecs': 120, 'closeCookieModals': True, 'maxScrollHeightPixels': 0,
    }
    req = urllib.request.Request(f'{api}/acts/apify~puppeteer-scraper/runs?timeout=900&memory=4096', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {tok}'})
    run = json.load(urllib.request.urlopen(req, timeout=60))['data']
    auth = {'Authorization': f'Bearer {tok}'}
    for _ in range(120):
        time.sleep(10)
        run = json.load(urllib.request.urlopen(urllib.request.Request(f"{api}/actor-runs/{run['id']}", headers=auth), timeout=60))['data']
        if run['status'] not in ('READY', 'RUNNING'):
            break
    items = json.load(urllib.request.urlopen(urllib.request.Request(f"{api}/datasets/{run['defaultDatasetId']}/items?clean=true", headers=auth), timeout=60))
    for it in items:
        if it.get('list'):
            _apify_cache[urllib.parse.urlparse(it['url']).hostname.removeprefix('www.')] = it['list']
    return _apify_cache


ZIP_REGION = {}  # zip prefix (2 digits) → region, learned from Fortuna rows in main()


def from_text(host):
    """Page text: 'Brno' / 'Tilhonova 31/2 | 627 00' / 'OtevřenoZavírá v 18:30' → branch rows (no GPS, no hours)."""
    text = apify_lists().get(host)
    for _ in range(2):  # the residential proxy sometimes fails one page for all retries — run again just for it
        if text:
            break
        text = apify_lists((host,)).get(host)
    if not text:
        raise RuntimeError(f'{host}: no list in the Apify result')
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    out, seen = [], set()
    for i, l in enumerate(lines):
        m = re.match(r'^(.+?) \| (\d{3}) ?(\d{2})$', l)
        if not m or i == 0:
            continue
        place = lines[i - 1]
        city = city_of(place.split(' – ')[0])
        street, zip_ = m.group(1).strip(), f'{m.group(2)} {m.group(3)}'
        if (street, zip_) in seen:
            continue
        seen.add((street, zip_))
        out.append({'name': street, 'street': street, 'city': city, 'part': place if place != city else '', 'zip': zip_,
                    'region': ZIP_REGION.get(m.group(2)[:2], ''), 'lat': None, 'lon': None, 'note': '', 'hours': [], 'live': False})
    return out



SOURCES = {'fortuna': fortuna, 'tipsport': lambda: from_text('tipsport.cz'), 'chance': lambda: from_text('chance.cz')}


def learn_zip_regions(rows):
    c = collections.defaultdict(collections.Counter)
    for r in rows:
        if r['zip'] and r['region']:
            c[r['zip'][:2]][r['region']] += 1
    ZIP_REGION.update({k: v.most_common(1)[0][0] for k, v in c.items()})


def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {'brands': {}}
    brands = dict(old.get('brands', {}))
    learn_zip_regions(brands.get('fortuna', []))
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    for brand, fn in SOURCES.items():
        if only and brand not in only:
            continue
        try:
            rows = fn()
            if len(rows) < 20:
                raise RuntimeError(f'only {len(rows)} rows')
            for r in rows:
                r['citySlug'] = slug(r['city'])
            brands[brand] = sorted(rows, key=lambda r: (r['city'], r['street']))
            if brand == 'fortuna':
                learn_zip_regions(rows)
            print(f'{brand}: {len(rows)} poboček, {len({r["city"] for r in rows})} měst')
        except Exception as e:
            print(f'{brand}: CHYBA {e} – ponechávám stará data ({len(brands.get(brand, []))})', file=sys.stderr)
    if '--dry-run' in sys.argv:
        return
    from datetime import datetime, timezone
    doc = {'updated': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'brands': brands}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')))
    # wrangler dev keys local KV by binding name, production by namespace id
    target = ['--binding', 'DATA', '--local'] if '--local' in sys.argv else ['--namespace-id', KV_ID, '--remote']
    where = target[-1:]
    subprocess.run(['pnpm', 'exec', 'wrangler', 'kv', 'key', 'put', 'pobocky', '--path', str(OUT), *target], cwd=APP, check=True)
    print('KV pobocky nahráno', where[0])


if __name__ == '__main__':
    main()
