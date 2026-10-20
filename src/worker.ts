import { handle } from '@astrojs/cloudflare/handler';
import type { Env as AppEnv } from './lib/types';
import { refreshLive, refreshUpcoming, pingIndexNow } from './lib/refresh';
import { SECURITY_HEADERS } from './lib/security';

/** Paths that are never cached: tracked redirects, live score feed, Cloudflare internals. */
const NO_CACHE = /^\/(go|cdn-cgi)\/|^\/api\/live\.json$/;

/** Security headers on every SSR response, and an explicit charset on HTML. */
function finish(res: Response): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
  const ct = out.headers.get('Content-Type') ?? '';
  if (ct.startsWith('text/html') && !/charset/i.test(ct)) out.headers.set('Content-Type', 'text/html; charset=utf-8');
  return out;
}

/**
 * Pages are server-rendered from KV, so every uncached hit costs CPU. Public GET responses that carry
 * `s-maxage` (set in layouts/Base.astro) are kept in the colo cache for that long. Only HTML pages are looked up:
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
  const hit = await cache.match(request);
  if (hit) return finish(hit);
  const res = await handle(request, env as never, ctx);
  if (res.status === 200 && /s-maxage=\d+/.test(res.headers.get('Cache-Control') ?? '')) ctx.waitUntil(cache.put(request, res.clone()));
  return finish(res);
}

export default {
  fetch: serve,
  async scheduled(ev: ScheduledController, rawEnv: unknown, ctx: ExecutionContext) {
    const env = rawEnv as AppEnv;
    // "*/15" also fires on the same minute as "*/3": run the heavier job there and let it include a live pass.
    const heavy = ev.cron === '*/15 * * * *';
    ctx.waitUntil(
      (heavy ? Promise.all([refreshLive(env), refreshUpcoming(env)]) : refreshLive(env))
        .catch((e) => console.error('refresh failed', String(e)))
        // IndexNow after every program refresh; already-sent ids are skipped, so this is usually a no-op.
        .then(() => (heavy ? pingIndexNow(env).then((n) => n && console.log('indexnow sent', n)) : undefined))
        .catch((e) => console.error('indexnow failed', String(e))),
    );
  },
};
