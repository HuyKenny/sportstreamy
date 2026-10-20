#!/usr/bin/env python3
"""Branch offices of bookmakers → KV key `pobocky` (read by /pobocky/ pages, no redeploy needed).

    python3 scripts/pobocky.py            # fetch, write data/pobocky.json, upload to the production KV
    python3 scripts/pobocky.py --local    # same, but into the local `wrangler dev` KV
    python3 scripts/pobocky.py --dry-run  # fetch and print counts only

Sources (20. 10. 2026):
- Fortuna: public JSON https://api.ifortuna.cz/shop-locator/list/v2 (works from the Raspberry).
- Tipsport, Chance, Allwyn: their locators block the Raspberry IP (403/Akamai); they will be added through
  Apify once their endpoints are known. A brand whose fetch fails keeps its previous data (never wipe a brand).
"""
import json, re, subprocess, sys, unicodedata, urllib.request
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


SOURCES = {'fortuna': fortuna}


def main():
    old = json.loads(OUT.read_text()) if OUT.exists() else {'brands': {}}
    brands = dict(old.get('brands', {}))
    for brand, fn in SOURCES.items():
        try:
            rows = fn()
            if len(rows) < 20:
                raise RuntimeError(f'only {len(rows)} rows')
            for r in rows:
                r['citySlug'] = slug(r['city'])
            brands[brand] = sorted(rows, key=lambda r: (r['city'], r['street']))
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
