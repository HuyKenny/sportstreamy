import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { Env } from '../../../lib/types';
import { resultsConfig } from '../../../lib/results/config';
import { opsStatus } from '../../../lib/results/store';
import type { Db } from '../../../lib/results/db';
import { authorized, PRIVATE } from '../../../lib/results/admin';

export const prerender = false;

/** Ops view: last sync per job, last error, quota use, record counts, stale live matches. Bearer RESULTS_ADMIN_TOKEN. */
export const GET: APIRoute = async ({ request }) => {
  const e = env as unknown as Env;
  if (!authorized(e, request) || !e.RESULTS) return new Response('Not found', { status: 404, headers: PRIVATE });
  const cfg = resultsConfig(e);
  const s = await opsStatus(e.RESULTS as unknown as Db, Date.now(), cfg.staleMs);
  return new Response(JSON.stringify({ config: { ...cfg, comps: cfg.comps }, ...s }, null, 2), { headers: PRIVATE });
};
