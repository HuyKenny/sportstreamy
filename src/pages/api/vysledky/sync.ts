import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { Env } from '../../../lib/types';
import { resultsConfig } from '../../../lib/results/config';
import type { Db } from '../../../lib/results/db';
import { authorized, PRIVATE } from '../../../lib/results/admin';
import { syncTipsportLive, syncApiFootball } from '../../../lib/results/sync';
import { login, liveMatches } from '../../../lib/tipsport';

export const prerender = false;

/**
 * Manual sync (POST, Bearer RESULTS_ADMIN_TOKEN). Same locks as the cron; api-football only when enabled and
 * through the same daily budget. GET is not accepted, so a crawler or prefetch can never trigger it.
 */
export const POST: APIRoute = async ({ request }) => {
  const e = env as unknown as Env;
  if (!authorized(e, request) || !e.RESULTS) return new Response('Not found', { status: 404, headers: PRIVATE });
  const cfg = resultsConfig(e);
  const db = e.RESULTS as unknown as Db;
  const s = await login('partners.tipsport.cz', e.TIPSPORT_CLIENT_ID, e.TIPSPORT_CLIENT_SECRET);
  const out: Record<string, unknown> = { tipsport: await syncTipsportLive(db, await liveMatches(s), cfg) };
  if (cfg.apiFootball && e.APISPORTS_KEY) out.apifootball = await syncApiFootball(db, cfg, { key: e.APISPORTS_KEY, cap: cfg.cap, floor: cfg.reserve });
  return new Response(JSON.stringify(out), { headers: PRIVATE });
};
