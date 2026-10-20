import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { Env } from '../../lib/types';
import { deeplink, generic, type Book } from '../../lib/partner';
import { view } from '../../lib/matches';
import { resultsDb } from '../../lib/results/config';
import { rowByExt } from '../../lib/results/store';

export const prerender = false;

const BOOKS = new Set(['tipsport', 'chance', 'sazka', 'sazka-ms', 'merkurxtip', 'registrace']);

/** Tracked redirect: /go/<book>/?m=<matchId>&p=<placement>. One Analytics Engine point per click, no cookies. */
export const GET: APIRoute = async ({ params, url, request }) => {
  const e = env as unknown as Env;
  const book = params.book ?? '';
  if (!BOOKS.has(book)) return new Response('Not found', { status: 404 });

  let target = book === 'registrace' ? generic(e, 'tipsport-reg') : generic(e, book as Book | 'sazka' | 'sazka-ms' | 'merkurxtip');
  const id = Number(url.searchParams.get('m'));
  if ((book === 'tipsport' || book === 'chance') && id) {
    const v = await view(e);
    const m = [...v.live, ...v.recent, ...v.upcoming].find((x) => x.id === id);
    // A finished match kept by the results pilot is no longer in the feeds: its stored Tipsport path still works.
    const path = m?.path || (resultsDb(e) ? (await rowByExt(resultsDb(e)!, id))?.path : '');
    if (path) target = deeplink(e, book as Book, path);
  }
  try {
    const ua = request.headers.get('user-agent') ?? '';
    const device = /bot|crawl|spider|slurp|preview|headless/i.test(ua) ? 'bot' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
    let page = '';
    try { page = new URL(request.headers.get('referer') ?? '').pathname; } catch { /* no referer */ }
    e.CLICKS?.writeDataPoint({
      indexes: [book],
      blobs: [book, (url.searchParams.get('p') ?? '').slice(0, 40), page.slice(0, 120), String(id || ''), device],
      doubles: [1],
    });
  } catch { /* measuring must never block the redirect */ }
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' },
  });
};
