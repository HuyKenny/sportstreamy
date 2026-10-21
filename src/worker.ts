import { handle } from '@astrojs/cloudflare/handler';
import type { Env as AppEnv } from './lib/types';
import { refreshLive, refreshUpcoming, refreshApiFootball } from './lib/refresh';
import { SECURITY_HEADERS } from './lib/security';

/** Paths that are never cached: tracked redirects, live score feed, Cloudflare internals. */
const NO_CACHE = /^\/(go|cdn-cgi)\/|^\/api\/live\.json$|^\/api\/vysledky\/(stav|sync)\/?$/;

/** Security headers on every SSR response, and an explicit charset on HTML. */
function finish(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  const ct = out.headers.get('Content-Type') ?? '';
  if (ct.startsWith('text/html') && !/charset/i.test(ct)) out.headers.set('Content-Type', 'text/html; charset=utf-8');
  return out;
}

/** How long past its TTL a cached page may still be served while a fresh copy renders in the background. */
const STALE_FACTOR = 10;

/**
 * Pages are server-rendered from KV, so every uncached hit costs CPU and ~400 ms. Public GET responses that carry
 * `s-maxage` (set in layouts/Base.astro) go to the colo cache with a longer lifetime; within the TTL they are served
 * as is, after it they are still served instantly while ctx.waitUntil renders and stores a fresh copy
 * (stale-while-revalidate — the Cache API does not do that by itself). Only HTML pages are looked up:
 * a lookup for /go/ or the live feed would always miss (and shows up as a 504 "edgeWorkerCacheAPI" in analytics).
 */
async function serve(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  // One canonical spelling: /Fotbal-Online/ → /fotbal-online/ (Tipsport-derived slugs are always lowercase).
  if (/[A-Z]/.test(url.pathname)) {
    url.pathname = url.pathname.toLowerCase();
    return new Response(null, { status: 301, headers: { Location: url.toString() } });
  }
  if (request.method !== 'GET' || NO_CACHE.test(url.pathname)) return finish(await handle(request, env as never, ctx));
  const cache = (caches as unknown as { default: Cache }).default;
  const render = async () => {
    const res = await handle(request, env as never, ctx);
    const cc = res.headers.get('Cache-Control') ?? '';
    const ttl = Number(/s-maxage=(\d+)/.exec(cc)?.[1] ?? 0);
    if (res.status === 200 && ttl > 0) {
      const stored = new Response(res.clone().body, res);
      stored.headers.set('Cache-Control', `public, s-maxage=${ttl * STALE_FACTOR}`);
      stored.headers.set('X-SS-Stored', String(Date.now()));
      stored.headers.set('X-SS-TTL', String(ttl));
      stored.headers.set('X-SS-CC', cc);
      ctx.waitUntil(cache.put(request, stored));
    }
    return res;
  };
  const hit = await cache.match(request);
  if (!hit) return finish(await render());
  const age = (Date.now() - Number(hit.headers.get('X-SS-Stored') ?? 0)) / 1000;
  if (age > Number(hit.headers.get('X-SS-TTL') ?? 0)) ctx.waitUntil(render().catch(() => undefined));
  const out = new Response(hit.body, hit);
  out.headers.set('Cache-Control', hit.headers.get('X-SS-CC') ?? 'public, max-age=0');
  for (const h of ['X-SS-Stored', 'X-SS-TTL', 'X-SS-CC']) out.headers.delete(h);
  out.headers.set('Age', String(Math.round(age)));
  return finish(out);
}

export default {
  fetch: serve,
  async scheduled(ev: ScheduledController, rawEnv: unknown, ctx: ExecutionContext) {
    const env = rawEnv as AppEnv;
    // "*/15" also fires on the same minute as "*/3": run the heavier job there and let it include a live pass.
    const heavy = ev.cron === '*/15 * * * *';
    ctx.waitUntil(
      (heavy ? Promise.all([refreshLive(env), refreshUpcoming(env), refreshApiFootball(env)]) : refreshLive(env))
        .catch((e) => console.error('refresh failed', String(e))),
      // IndexNow is sent from the Raspberry cron (bin/indexnow.py sportstreamy --sitemap): api.indexnow.org
      // throttles Cloudflare's shared egress IPs, so a ping from here gets 403/429.
    );
  },
};
