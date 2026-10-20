import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import type { Env } from '../../lib/types';
import { resultsConfig, resultsDb } from '../../lib/results/config';
import { rowsBetween } from '../../lib/results/store';
import { pragueDay, isDayKey } from '../../lib/results/time';
import { statusShort, statusLabel } from '../../lib/results/status';
import { scoreText } from '../../lib/results/view';
import { dayKey } from '../../lib/text';

export const prerender = false;

/** id → [short state, state, score, minute] for one Prague day. Reads our D1 only — never the provider. */
export const GET: APIRoute = async ({ url }) => {
  const e = env as unknown as Env;
  const db = resultsDb(e);
  if (!db) return new Response('Not found', { status: 404 });
  const den = url.searchParams.get('den') ?? '';
  const key = isDayKey(den) ? den : dayKey(Date.now());
  const [from, to] = pragueDay(key);
  const out: Record<string, [string, string, string, string]> = {};
  for (const r of await rowsBetween(db, from, to, resultsConfig(e).comps)) {
    out[r.ext_id] = [r.status === 'scheduled' ? '' : statusShort(r.status), statusLabel(r.status, r.status_raw), scoreText(r) ?? '', r.minute_raw ?? ''];
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=30', 'X-Robots-Tag': 'noindex' } });
};
