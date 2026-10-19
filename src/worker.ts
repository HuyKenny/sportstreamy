import { handle } from '@astrojs/cloudflare/handler';
import type { Env as AppEnv } from './lib/types';
import { refreshLive, refreshUpcoming } from './lib/refresh';

export default {
  fetch: handle,
  async scheduled(ev: ScheduledController, rawEnv: unknown, ctx: ExecutionContext) {
    const env = rawEnv as AppEnv;
    // "*/15" also fires on the same minute as "*/3": run the heavier job there and let it include a live pass.
    const heavy = ev.cron === '*/15 * * * *';
    ctx.waitUntil(
      (heavy ? Promise.all([refreshLive(env), refreshUpcoming(env)]) : refreshLive(env)).catch((e) => console.error('refresh failed', String(e))),
    );
  },
};
