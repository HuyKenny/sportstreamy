/**
 * Production Worker since 23. 11. 2026 (Cloudflare Workers Free): every page is a static asset rendered by the
 * GitHub Actions job (.github/workflows/live.yml → scripts/static/). Static asset hits never run this code; it only
 * runs for what has no file:
 *   /go/<book>/            tracked affiliate redirect (+ Analytics Engine point)
 *   /logo/<sport>/<id>.png crest proxy for crests the snapshot has not stored yet
 *   /vysledky/*            (run_worker_first) ?den= → the pre-rendered day stored under /_q/
 *   legacy WordPress URLs, uppercase paths, finished matches (410), everything else (404).
 * Data it needs comes from small JSON assets the snapshot writes (/_m/…), never from KV or D1.
 * Keep it light: the Free plan allows 10 ms CPU per request.
 */
import type { Env as AppEnv, Match } from './lib/types';
import { deeplink, generic, type Book } from './lib/partner';
import { legacyCompetition, legacyMatch, legacySport } from './lib/legacy';
import type { View } from './lib/matches';

interface Env extends AppEnv {
  ASSETS: Fetcher;
}

const BOOKS = new Set(['tipsport', 'chance', 'sazka', 'sazka-ms', 'merkurxtip', 'registrace']);
/** Must match scripts/static/snapshot.py (SHARDS). */
const SHARDS = 64;

const asset = (env: Env, url: URL, path: string) => env.ASSETS.fetch(new Request(new URL(path, url.origin)));

async function json<T>(env: Env, url: URL, path: string): Promise<T | null> {
  const r = await asset(env, url, path);
  return r.ok ? ((await r.json()) as T) : null;
}

/** id → [our page path, Tipsport matchUrl] for live, upcoming and stored results (written by the snapshot). */
const matchInfo = (env: Env, url: URL, id: number) => json<Record<string, [string, string]>>(env, url, `/_m/${id % SHARDS}.json`).then((m) => m?.[id] ?? null);

function redirect(to: string, status = 301, cache = 'public, max-age=3600'): Response {
  return new Response(null, { status, headers: { Location: to, 'Cache-Control': cache } });
}

async function page(env: Env, url: URL, path: string, status: number): Promise<Response> {
  const r = await asset(env, url, path);
  return new Response(r.body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Robots-Tag': 'noindex' } });
}

async function go(env: Env, url: URL, request: Request, book: string): Promise<Response> {
  if (!BOOKS.has(book)) return page(env, url, '/_404/', 404);
  let target = book === 'registrace' ? generic(env, 'tipsport-reg') : generic(env, book as Book | 'sazka' | 'sazka-ms' | 'merkurxtip');
  const id = Number(url.searchParams.get('m'));
  if ((book === 'tipsport' || book === 'chance') && id > 0) {
    const info = await matchInfo(env, url, id).catch(() => null);
    if (info?.[1]) target = deeplink(env, book as Book, info[1]);
  }
  try {
    const ua = request.headers.get('user-agent') ?? '';
    const device = /bot|crawl|spider|slurp|preview|headless/i.test(ua) ? 'bot' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
    let from = '';
    try { from = new URL(request.headers.get('referer') ?? '').pathname; } catch { /* no referer */ }
    env.CLICKS?.writeDataPoint({ indexes: [book], blobs: [book, (url.searchParams.get('p') ?? '').slice(0, 40), from.slice(0, 120), String(id || ''), device], doubles: [1] });
  } catch { /* measuring must never block the redirect */ }
  return new Response(null, { status: 302, headers: { Location: target, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' } });
}

const LOGO_SPORTS = new Set(['football', 'hockey', 'basketball', 'volleyball', 'handball']);
async function logo(sport: string, id: string): Promise<Response> {
  if (!LOGO_SPORTS.has(sport) || !/^\d{1,7}$/.test(id)) return new Response('Not found', { status: 404 });
  const res = await fetch(`https://media.api-sports.io/${sport}/teams/${id}.png`, { cf: { cacheEverything: true, cacheTtl: 2_592_000 } } as RequestInit);
  if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, s-maxage=86400' } });
  return new Response(res.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=2592000, immutable', 'X-Robots-Tag': 'noindex' } });
}

/** Current matches as a minimal View for the legacy-URL helpers ([id, home, away, sport, league]). */
async function legacyView(env: Env, url: URL): Promise<View> {
  const rows = (await json<[number, string, string, number, string][]>(env, url, '/_m/legacy.json')) ?? [];
  const upcoming = rows.map(([id, h, a, sp, lg]) => ({ id, h, a, sp, lg, lid: 0, st: 0, stream: false, path: '', live: false }) as Match);
  return { live: [], upcoming, recent: [], at: 0 };
}

/** /vysledky/<sport>/?den=YYYY-MM-DD → the copy the snapshot rendered for that day (soutez/stav are filtered in the browser). */
async function results(env: Env, url: URL, request: Request): Promise<Response> {
  const den = url.searchParams.get('den') ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(den) && /^\/vysledky\/([a-z]+\/)?$/.test(url.pathname)) {
    const r = await asset(env, url, `/_q${url.pathname}den-${den}/`);
    if (r.ok) return r;
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.hostname.startsWith('www.')) return redirect(`https://${url.hostname.slice(4)}${url.pathname}${url.search}`, 301, 'public, max-age=86400');
    const p = url.pathname;
    if (p.startsWith('/vysledky/')) return results(env, url, request);
    if (/[A-Z]/.test(p)) return redirect(p.toLowerCase() + url.search);
    const seg = p.split('/');
    if (seg[1] === 'go') return go(env, url, request, seg[2] ?? '');
    if (seg[1] === 'logo' && seg.length === 4) return logo(seg[2], seg[3].replace(/\.png$/, ''));
    if (seg[1] === 'zapas') {
      // A match page without a file: a renamed slug of a match we still have → its page; otherwise it is over (410).
      const id = Number((seg[2] ?? '').split('-')[0]);
      const info = id > 0 ? await matchInfo(env, url, id).catch(() => null) : null;
      if (info?.[0] && info[0] !== p) return redirect(info[0]);
      return page(env, url, '/_gone/', 410);
    }
    if (seg[1] === 'sport' && seg[2]) return redirect(legacySport(seg[2]));
    if ((seg[1] === 'soutez' || seg[1] === 'liga' || seg[1] === 'zivy-prenos') && seg[2]) {
      const v = await legacyView(env, url);
      const to = seg[1] === 'zivy-prenos' ? legacyMatch(v, seg[2]).to : legacyCompetition(v, seg[2]);
      return to ? redirect(to) : page(env, url, '/_gone/', 410);
    }
    return page(env, url, '/_404/', 404);
  },
};
