import { handle } from '@astrojs/cloudflare/handler';
import type { Env as AppEnv } from './lib/types';
import { refreshLive, refreshUpcoming, pingIndexNow } from './lib/refresh';

/**
 * Pages are server-rendered from KV, so every uncached hit costs CPU. Public GET responses that carry
 * `s-maxage` (set in layouts/Base.astro) are kept in the colo cache for that long; /go/ redirects are private
 * and never cached, so every click still reaches the Worker and is counted.
 */
async function cached(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'GET') return handle(request, env as never, ctx);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await handle(request, env as never, ctx);
  if (res.status === 200 && /s-maxage=\d+/.test(res.headers.get('Cache-Control') ?? '')) ctx.waitUntil(cache.put(request, res.clone()));
  return res;
}

export default {
  fetch: cached,
  async scheduled(ev: ScheduledController, rawEnv: unknown, ctx: ExecutionContext) {
    const env = rawEnv as AppEnv;
    // "*/15" also fires on the same minute as "*/3": run the heavier job there and let it include a live pass.
    const heavy = ev.cron === '*/15 * * * *';
    const hourly = heavy && new Date(ev.scheduledTime).getUTCMinutes() < 15;
    ctx.waitUntil(
      (heavy ? Promise.all([refreshLive(env), refreshUpcoming(env)]) : refreshLive(env))
        .then(() => (hourly ? pingIndexNow(env) : 0))
        .catch((e) => console.error('refresh failed', String(e))),
    );
  },
};
