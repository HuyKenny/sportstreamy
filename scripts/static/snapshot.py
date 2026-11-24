#!/usr/bin/env python3
"""Render a site from its local `wrangler dev` into static files (Cloudflare Workers Free, since 23. 11. 2026).

The Astro SSR code stays the single source of truth: GitHub Actions runs it locally with the fresh data
(Tipsport feed in local KV, results in a local SQLite copy of D1), requests every page and stores the HTML.
Only pages whose content may have changed are rendered on a normal run; a full run every FULL_EVERY seconds
(or after a code change) renders everything, discovers new pages and drops pages that are gone.

    snapshot.py --site sportstreamy --base http://127.0.0.1:8787 --dist dist/client --state ../state \
                --out ../render/sportstreamy --data ../state/data --db <d1.sqlite> [--mode auto|full|hot]

Writes <out>/files/... (rendered files) and <out>/deploy.json (input of deploy.mjs: rendered files by path, unchanged
ones by stored hash). The caller stores the hashes deploy.mjs prints with `snapshot.py --commit`.
"""
import argparse
import concurrent.futures as cf
import html
import json
import re
import shutil
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SHARDS = 64                     # edge.ts reads /_m/<id % SHARDS>.json
FULL_EVERY = 3 * 3600           # seconds between full renders
HOT_BEFORE = 3 * 3600_000       # match pages re-rendered on every run from this long before kick-off ...
HOT_AFTER = 5 * 3600_000        # ... until this long after it
MAX_FILES = 19_000              # Free plan: 20 000 files per Worker version

SITES = {
    'sportstreamy': {
        'domain': 'sportstreamy.cz',
        'worker': 'sportstreamy',
        'match': re.compile(r'^/zapas/(\d+)-'),
        # Pages that do not depend on the live data (or only in a sidebar): rendered on full runs only.
        'warm': ('/jak-sledovat/', '/clanky/', '/sazkove-kancelare/', '/pobocky/', '/o-webu/', '/kontakt/', '/podminky/',
                 '/osobni-udaje/', '/zdroje-fotek/', '/zodpovedne-hrani/', '/prehled-sportu/'),
        # path regex → query keys that select a pre-rendered variant (edge.ts maps ?den= to /_q/<path>den-<day>/)
        'variants': [(re.compile(r'^/vysledky/([a-z]+/)?$'), ('den',), True)],
        'extra': ['/', '/api/live.json', '/api/search.json', '/api/vysledky.json', '/hledat/', '/program/', '/zive/', '/vysledky/'],
        'gone': '/zapas/1-gone/',
        'run_worker_first': ['/vysledky/*'],
    },
    'ziveprenosy': {
        'domain': 'ziveprenosy.sk',
        'worker': 'ziveprenosy-sk',
        'match': re.compile(r'^/prenos/(\d+)-'),
        'warm': ('/o-nas/', '/kontakt/', '/podmienky/', '/ochrana-osobnych-udajov/', '/zdroje-fotiek/', '/zodpovedne-hranie/',
                 '/tipsport-bonus/', '/tipsport-prihlasenie/', '/tipsport-tv/', '/clanky/'),
        'warm_re': re.compile(r'^/[a-z-]+/tim/'),
        'variants': [(re.compile(r'^/teraz-nazivo/$'), ('sport',), True),
                     (re.compile(r'^/vysledky/'), ('stav',), True),
                     (re.compile(r'^/program/'), ('sport',), False)],
        'extra': ['/', '/api/live.json', '/api/search.json', '/hladat/', '/program/', '/teraz-nazivo/', '/vysledky/'],
        'gone': None,
        'run_worker_first': ['/teraz-nazivo/*', '/program/*', '/vysledky/*'],
    },
}
SKIP = ('/go/', '/cdn-cgi/', '/_astro/', '/_m/', '/_q/', '/_data/')
LINK_RE = re.compile(r'''(?:href|src)\s*=\s*["']([^"'#]+)["']''')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def fetch(url, tries=3):
    """(status, headers, body); redirects are returned, not followed. 0 = no answer."""
    for i in range(tries):
        try:
            with OPENER.open(urllib.request.Request(url, headers={'User-Agent': 'snapshot/1.0'}), timeout=120) as r:
                return r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            if e.code in (500, 502, 503, 504) and i < tries - 1:
                time.sleep(1 + i)
                continue
            return e.code, e.headers, (e.read() if e.fp else b'')
        except Exception:
            if i == tries - 1:
                return 0, {}, b''
            time.sleep(1 + i)


def rel_of(path):
    """URL path → file key served at it (html_handling force-trailing-slash)."""
    return path + 'index.html' if path.endswith('/') else path


def variant_path(path, query, rules):
    """'/vysledky/', {'den': 'x'} → '/_q/vysledky/den-x/' when a rule allows exactly these keys, else None."""
    for rx, keys, hot in rules:
        if rx.search(path) and query and set(query) <= set(keys):
            vals = []
            for k in keys:
                v = query.get(k)
                if v is None:
                    continue
                if not re.fullmatch(r'[a-z0-9-]{1,40}', v):
                    return None, False
                vals.append(f'{k}-{v}')
            return f'/_q{path}{"_".join(vals)}/', hot
    return None, False


class Snap:
    def __init__(self, a):
        self.a = a
        self.cfg = SITES[a.site]
        self.base = a.base.rstrip('/')
        self.dist = Path(a.dist)
        self.state_file = Path(a.state) / f'{a.site}.json'
        self.out = Path(a.out)
        self.files_dir = self.out / 'files'
        self.now = int(time.time() * 1000)
        self.st = json.loads(self.state_file.read_text()) if self.state_file.exists() else {}
        self.pages = self.st.get('pages', {})          # file key → [hash, size, rendered_at, url (with query)]
        self.lock = threading.Lock()
        self.rendered = {}                             # file key → url
        self.redirects = {}                            # path → location
        self.dropped = set()
        self.errors = {}
        self.queued = set()
        self.static = {}                               # file key → abs path (build output)

    # -- what to render ----------------------------------------------------------------------------
    def mode(self):
        if self.a.mode != 'auto':
            return self.a.mode
        if not self.pages or self.st.get('build') != self.a.build:
            return 'full'
        return 'full' if self.now / 1000 - self.st.get('last_full', 0) > FULL_EVERY else 'hot'

    def sitemap_paths(self):
        out, todo, seen = [], ['/sitemap.xml'], set()
        while todo:
            p = todo.pop()
            if p in seen:
                continue
            seen.add(p)
            st, _, body = fetch(self.base + p)
            if st != 200:
                self.errors[p] = st
                continue
            self.save(p, body)
            x = body.decode('utf-8', 'replace')
            locs = [urllib.parse.urlsplit(html.unescape(l)).path for l in re.findall(r'<loc>\s*([^<\s]+)', x)]
            if '<sitemapindex' in x:
                todo += locs
            else:
                out += locs
        return out

    def hot_ids(self):
        """Matches that can change between two runs: in play, about to start, just finished, results just written."""
        ids = set()
        st, _, body = fetch(self.base + '/api/search.json')
        if st == 200:
            for row in json.loads(body).get('m', []):
                path, start, live = row[2], row[3], row[4]
                m = self.cfg['match'].match(path)
                if m and (live or start - HOT_BEFORE <= self.now <= start + HOT_AFTER):
                    ids.add(m.group(1))
        if self.a.db and Path(self.a.db).exists():
            since = self.st.get('last_run', 0) - 120_000
            con = sqlite3.connect(f'file:{self.a.db}?mode=ro', uri=True)
            q = ('SELECT ext_id FROM matches WHERE checked_at > ? OR COALESCE(final_at, 0) > ? OR COALESCE(af_checked_at, 0) > ? '
                 'OR (start_utc BETWEEN ? AND ?)')
            for (ext,) in con.execute(q, (since, since, since, self.now - HOT_AFTER, self.now + HOT_BEFORE)):
                ids.add(str(ext))
            con.close()
        return ids

    def is_warm(self, path):
        return path.startswith(self.cfg['warm']) or bool(self.cfg.get('warm_re') and self.cfg['warm_re'].search(path))

    # -- rendering ---------------------------------------------------------------------------------
    def save(self, key_path, body, src=None):
        key = rel_of(key_path)
        dest = self.files_dir / key.lstrip('/')
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)
        with self.lock:
            self.rendered[key] = src or key_path

    def render(self, url_path, query=None, store_as=None):
        """Render one URL; returns the links found in it (paths and query variants)."""
        url = self.base + urllib.parse.quote(url_path) + ('?' + urllib.parse.urlencode(query) if query else '')
        st, hdr, body = fetch(url)
        key = rel_of(store_as or url_path)
        if st in (301, 302, 307, 308):
            loc = hdr.get('Location', '')
            tgt = urllib.parse.urlsplit(urllib.parse.urljoin(url, loc))
            with self.lock:
                if not query and tgt.path != url_path:
                    self.redirects[url_path] = tgt.path + (('?' + tgt.query) if tgt.query else '') if tgt.netloc in ('', urllib.parse.urlsplit(self.base).netloc) else loc
                self.dropped.add(key)
            return [tgt.path] if tgt.netloc == urllib.parse.urlsplit(self.base).netloc else []
        if st in (404, 410):
            with self.lock:
                self.dropped.add(key)
            return []
        if st != 200:
            with self.lock:
                self.errors[url_path] = st
            return []
        self.save(store_as or url_path, body, url_path + ('?' + urllib.parse.urlencode(query) if query else ''))
        ctype = (hdr.get('Content-Type') or '').lower()
        if 'text/html' not in ctype:
            return []
        links = []
        for href in LINK_RE.findall(body.decode('utf-8', 'replace')):
            u = urllib.parse.urlsplit(urllib.parse.urljoin(url, html.unescape(href)))
            if u.netloc != urllib.parse.urlsplit(self.base).netloc or not u.path.startswith('/') or u.path.startswith(SKIP):
                continue
            links.append((u.path, dict(urllib.parse.parse_qsl(u.query)) if u.query else None))
        return links

    def run_queue(self, jobs, discover):
        """jobs: list of (path, query, store_as). Newly linked pages without a file are rendered too (discover=all links)."""
        queue = list(jobs)
        for j in queue:
            self.queued.add(j[2] or j[0])
        with cf.ThreadPoolExecutor(self.a.workers) as ex:
            futs = {}
            while queue or futs:
                while queue and len(futs) < self.a.workers * 2:
                    p, q, s = queue.pop(0)
                    futs[ex.submit(self.render, p, q, s)] = p
                done, _ = cf.wait(list(futs), return_when=cf.FIRST_COMPLETED)
                for f in done:
                    futs.pop(f)
                    for link in f.result():
                        path, query = link if isinstance(link, tuple) else (link, None)
                        if query:
                            vp, hot = variant_path(path, query, self.cfg['variants'])
                            if not vp or vp in self.queued:
                                continue
                            if discover or hot or rel_of(vp) not in self.pages:
                                self.queued.add(vp)
                                queue.append((path, query, vp))
                            continue
                        if path in self.queued:
                            continue
                        key = rel_of(path)
                        if key in self.static:
                            continue
                        if path.startswith('/logo/'):
                            if key not in self.pages:          # crests never change: fetched once, then kept
                                self.queued.add(path)
                                queue.append((path, None, None))
                            continue
                        last = path.rstrip('/').rsplit('/', 1)[-1]
                        if '.' in last and not path.endswith(('.xml', '.json', '.txt')):
                            continue                           # other static files come from the build
                        if discover or key not in self.pages:
                            self.queued.add(path)
                            queue.append((path, None, None))

    # -- main ----------------------------------------------------------------------------------------
    def build(self):
        t0 = time.time()
        if self.out.exists():
            shutil.rmtree(self.out)
        self.files_dir.mkdir(parents=True)
        for f in self.dist.rglob('*'):
            if f.is_file() and f.name not in ('_headers', '_redirects', '_routes.json'):
                self.static['/' + str(f.relative_to(self.dist))] = str(f.resolve())
        mode = self.mode()
        sm = self.sitemap_paths()
        match = self.cfg['match']
        jobs = []
        if mode == 'full':
            paths = list(dict.fromkeys(self.cfg['extra'] + sm))
            jobs = [(p, None, None) for p in paths]
            if self.a.site == 'sportstreamy':
                jobs += self.results_days()
            # stored query variants are rendered again (the discovery only finds the ones linked right now)
            jobs += [(v[3].split('?')[0], dict(urllib.parse.parse_qsl(v[3].split('?', 1)[1])), k[:-len('index.html')])
                     for k, v in self.pages.items() if k.startswith('/_q/') and len(v) > 3 and '?' in v[3]]
        else:
            hot = self.hot_ids()
            sm_set = set(sm)
            for p in dict.fromkeys(self.cfg['extra'] + sm):
                m = match.match(p)
                if (m and m.group(1) in hot) or (not m and not self.is_warm(p)) or rel_of(p) not in self.pages:
                    jobs.append((p, None, None))
            # match pages we still serve but that left the feed: re-check (200 for a few hours as "recent", then gone)
            for k in list(self.pages):
                if not k.endswith('/index.html'):
                    continue
                p = k[:-len('index.html')]
                m = match.match(p)
                if m and p not in sm_set and (m.group(1) in hot or self.now - self.pages[k][2] > 3600_000):
                    jobs.append((p, None, None))
        self.run_queue(jobs, discover=(mode == 'full'))
        # special pages the edge Worker serves with an error status
        for src, dest, want in ((f'/zz-{self.now}/', '/_404/', 404), (self.cfg['gone'], '/_gone/', 410)):
            if src:
                st, _, body = fetch(self.base + src)
                if st == want and body:
                    self.save(dest, body)
        self.data_files()
        self.write_deploy(mode)
        print(json.dumps({'site': self.a.site, 'mode': mode, 'rendered': len(self.rendered), 'dropped': len(self.dropped),
                          'errors': len(self.errors), 'error_sample': dict(list(self.errors.items())[:10]),
                          'seconds': round(time.time() - t0)}, ensure_ascii=False), flush=True)
        if len(self.errors) > max(20, len(self.rendered) // 10):
            sys.exit(f'{self.a.site}: too many render errors')

    def results_days(self):
        """sportstreamy /vysledky/<sport>/?den=<day> for every day the results database holds (the date picker has no links)."""
        if not (self.a.db and Path(self.a.db).exists()):
            return []
        con = sqlite3.connect(f'file:{self.a.db}?mode=ro', uri=True)
        lo, hi = con.execute("SELECT MIN(start_utc), MAX(start_utc) FROM matches WHERE review = 0").fetchone()
        con.close()
        if not lo:
            return []
        out = []
        day = 86_400_000
        today = time.strftime('%Y-%m-%d', time.localtime(self.now / 1000))
        for t in range(lo, hi + day, day):
            d = time.strftime('%Y-%m-%d', time.localtime(t / 1000))
            if d == today:
                continue
            for base in ('/vysledky/', '/vysledky/fotbal/', '/vysledky/hokej/', '/vysledky/basketbal/', '/vysledky/volejbal/', '/vysledky/hazena/'):
                out.append((base, {'den': d}, f'/_q{base}den-{d}/'))
        return out

    def data_files(self):
        """Small JSON files for the edge Worker (/_m/) and the Raspberry scripts (/_data/)."""
        data = Path(self.a.data)
        items = []
        for k in ('live', 'pre'):
            f = data / f'{k}.json'
            if f.exists():
                items += json.loads(f.read_text()).get('items', [])
        info = {}                                      # id → [page path, Tipsport path]
        for k, v in list(self.pages.items()) + [(k, [None, None, None, p]) for k, p in self.rendered.items()]:
            m = self.cfg['match'].match(k)
            if m and k.endswith('/index.html'):
                info.setdefault(m.group(1), [k[:-len('index.html')], ''])
        for k in self.dropped:
            m = self.cfg['match'].match(k)
            if m and info.get(m.group(1), [''])[0] + 'index.html' == k:
                info.pop(m.group(1), None)
        for it in items:
            info.setdefault(str(it['id']), ['', ''])[1] = it.get('path') or ''
        if self.a.db and Path(self.a.db).exists():
            con = sqlite3.connect(f'file:{self.a.db}?mode=ro', uri=True)
            # Paths in the results database come from the Czech feed (tipsport.cz). ziveprenosy.sk deeplinks to
            # tipsport.sk, so it takes match paths only from its own Tipsport.sk feed (--data).
            rows = con.execute("SELECT ext_id, path FROM matches WHERE provider = 'tipsport' AND path != ''") if self.a.site == 'sportstreamy' else []
            for ext, path in rows:
                info.setdefault(str(ext), ['', ''])
                if not info[str(ext)][1]:
                    info[str(ext)][1] = path
            if self.a.site == 'sportstreamy':
                rows = con.execute('SELECT DISTINCT m.sport AS sport, tl.af_id AS id FROM team_link tl JOIN matches m '
                                   'ON m.home_ext = tl.tip_id OR m.away_ext = tl.tip_id').fetchall()
                self.save('/_data/team-logos.json', json.dumps([{'sport': s, 'id': i} for s, i in rows]).encode())
            con.close()
        shards = [{} for _ in range(SHARDS)]
        for i, v in info.items():
            if i.isdigit():
                shards[int(i) % SHARDS][i] = v
        for n, s in enumerate(shards):
            self.save(f'/_m/{n}.json', json.dumps(s, ensure_ascii=False, separators=(',', ':')).encode())
        if self.a.site == 'sportstreamy':
            legacy = [[m['id'], m['h'], m.get('a') or '', m['sp'], m.get('lg') or ''] for m in items]
            self.save('/_m/legacy.json', json.dumps(legacy, ensure_ascii=False, separators=(',', ':')).encode())
            soon = [m for m in items if self.now - 3 * 3600_000 <= m.get('st', 0) <= self.now + 72 * 3600_000]
            self.save('/_data/nahledy.json', json.dumps({'at': self.now, 'items': soon}, ensure_ascii=False, separators=(',', ':')).encode())

    def headers_file(self):
        """The build's _headers with the security headers the SSR Worker used to add (copied from a local response)."""
        st, hdr, _ = fetch(self.base + '/')
        sec = []
        for k in ('Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy',
                  'Cross-Origin-Opener-Policy', 'Content-Security-Policy', 'Cross-Origin-Resource-Policy', 'X-Permitted-Cross-Domain-Policies'):
            v = hdr.get(k) if hdr else None
            if v:
                sec.append(f'  {k}: {v}')
        src = (self.dist / '_headers').read_text() if (self.dist / '_headers').exists() else ''
        # drop the build's own "/*" block, ours carries the full set
        blocks = re.split(r'\n(?=\S)', src)
        rest = [b for b in blocks if b.strip() and not b.startswith('/*') and not b.startswith('#')]
        return '\n'.join(['/*'] + sec + ['', '/api/*', '  X-Robots-Tag: noindex', '', '/_m/*', '  X-Robots-Tag: noindex',
                                          '', '/_data/*', '  X-Robots-Tag: noindex', '', '/_q/*', '  X-Robots-Tag: noindex', ''] + rest) + '\n'

    def write_deploy(self, mode):
        files = {}
        for key, f in self.static.items():
            files[key] = {'file': f}
        keep_q = {}
        for key, v in self.pages.items():
            if key in self.rendered or key in self.dropped or key in self.static:
                continue
            if mode == 'full' and not key.startswith('/logo/'):
                continue                               # not reached on a full run → gone
            files[key] = {'hash': v[0], 'size': v[1]}
            keep_q[key] = v
        urls = {}
        for key, p in self.rendered.items():
            files[key] = {'file': str((self.files_dir / key.lstrip('/')).resolve())}
            urls[key] = p
        if len(files) > MAX_FILES:
            sys.exit(f'{self.a.site}: {len(files)} files, over the {MAX_FILES} limit')
        redirects = dict(self.st.get('redirects', {})) if mode != 'full' else {}
        redirects.update(self.redirects)
        lines = [f'{p} {t} 301' for p, t in sorted(redirects.items())
                 if ' ' not in p + t and p.isascii() and t.isascii() and len(p) + len(t) < 1000 and not p.startswith(('/go/', '/zapas/', '/prenos/'))]
        cfg = self.cfg
        deploy = {
            'worker': cfg['worker'], 'site': self.a.site, 'mode': mode,
            'config': {'html_handling': 'force-trailing-slash', 'not_found_handling': 'none', 'run_worker_first': cfg['run_worker_first']},
            'headers': self.headers_file(), 'redirects': '\n'.join(lines[:1900]) + '\n',
            'files': files,
            # for --commit: what to remember about rendered files
            'rendered': urls, 'redirect_map': redirects,
        }
        (self.out / 'deploy.json').write_text(json.dumps(deploy, ensure_ascii=False))


def commit(a):
    """After a successful deploy: store hashes of rendered files, forget dropped ones, remember the run."""
    cfg_out = Path(a.out)
    dep = json.loads((cfg_out / 'deploy.json').read_text())
    res = json.loads(Path(a.result).read_text())
    hashes = res['hashes']
    state_file = Path(a.state) / f'{a.site}.json'
    st = json.loads(state_file.read_text()) if state_file.exists() else {}
    old = st.get('pages', {})
    now = int(time.time() * 1000)
    pages = {}
    for key, (h, size) in hashes.items():
        if key in dep['rendered']:
            pages[key] = [h, size, now, dep['rendered'][key]]
        elif key in old:
            pages[key] = old[key]
    st.update({'pages': pages, 'last_run': now, 'redirects': dep['redirect_map'], 'build': a.build})
    if dep['mode'] == 'full':
        st['last_full'] = now // 1000
    state_file.write_text(json.dumps(st, ensure_ascii=False, separators=(',', ':')))
    print(f"{a.site}: state {len(pages)} files, uploaded {res.get('uploaded')} ({res.get('bytes', 0) // 1024} kB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--site', required=True, choices=SITES)
    ap.add_argument('--base', default='http://127.0.0.1:8787')
    ap.add_argument('--dist')
    ap.add_argument('--state', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--data', default='')
    ap.add_argument('--db', default='')
    ap.add_argument('--mode', default='auto', choices=['auto', 'full', 'hot'])
    ap.add_argument('--build', default='', help='identifier of the code build (a change forces a full render)')
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--commit', action='store_true')
    ap.add_argument('--result', help='--commit: JSON printed by deploy.mjs')
    a = ap.parse_args()
    if a.commit:
        return commit(a)
    Snap(a).build()


if __name__ == '__main__':
    main()
