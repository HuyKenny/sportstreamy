import type { Env, Match, Snapshot } from './types';
import { liveMatches, login, toMatch, upcomingMatches, odds } from './tipsport';
import { competitionOf } from './competitions';
import { SPORT_BY_ID } from './sports';
import { resultsConfig, resultsSyncDb } from './results/config';
import { syncTipsportLive, syncTipsportSchedule, syncApiFootball } from './results/sync';
import { applyEnded, type EndedRaw } from './results/store';

/** Season-long markets ("Chance Liga 2026/2027 – celkově", "po 30. kole", top scorer…) are not matches. */
const OUTRIGHT = /celkov|dlouhodob|vítěz skupiny|vítěz soutěže|po \d+\.\s?kol|nejlepší střel|sestup|postup/i;

/** On the site: anything with video, plus head-to-head matches of curated top competitions (odds + live stats only). */
const keep = (m: Match | null): m is Match =>
  !!m && SPORT_BY_ID.has(m.sp) && !OUTRIGHT.test(m.h) && (m.stream || (!!m.a && !!competitionOf(m.sp, m.lg)));

const put = (env: Env, key: string, items: Match[]) => env.DATA.put(key, JSON.stringify({ at: Date.now(), items } satisfies Snapshot<Match>));

/** Every 3 min: what is in play right now (score, minute). */
export async function refreshLive(env: Env): Promise<number> {
  const s = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const raw = await liveMatches(s);
  const items = raw.map(toMatch).filter(keep);
  // An empty answer is far more likely an outage than "nothing is on": keep the previous snapshot.
  if (items.length) await put(env, 'live', items);
  // Results pilot: the same response, no extra request. A failure there must never break the live snapshot.
  const db = resultsSyncDb(env);
  if (db) await syncTipsportLive(db, raw, resultsConfig(env)).catch((e) => console.warn('results live sync failed', String(e)));
  // Final results the watcher caught between two runs (scripts/static/ended-watch.mjs → KV `ended`, put by run.sh).
  if (db) {
    const ended = await env.DATA.get<{ items: Record<string, EndedRaw> }>('ended', 'json').catch(() => null);
    const list = Object.values(ended?.items ?? {});
    if (list.length) await applyEnded(db, list).then((n) => console.log(`ended watcher: ${list.length} kept, ${n} applied`)).catch((e) => console.warn('ended apply failed', String(e)));
  }
  return items.length;
}

/** Every 15 min: next 7 days with Tipsport odds, plus Chance odds joined by match id (identical ids on both platforms). */
export async function refreshUpcoming(env: Env): Promise<number> {
  const t = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const raw = await upcomingMatches(t);
  const items = raw.map(toMatch).filter(keep);
  const db = resultsSyncDb(env);
  if (db) await syncTipsportSchedule(db, raw, resultsConfig(env)).catch((e) => console.warn('results schedule sync failed', String(e)));
  try {
    const c = await login('partners.chance.cz', env.CHANCE_API_USER, env.CHANCE_API_PASS);
    const byId = new Map(items.map((m) => [m.id, m]));
    for (const raw of await upcomingMatches(c)) {
      const m = byId.get(raw.id);
      const o = odds(raw);
      if (m && o && m.o) m.o.c = o;
    }
  } catch (e) {
    console.warn('chance odds skipped', String(e)); // Tipsport data alone is still a working site
  }
  if (items.length) await put(env, 'pre', items);
  return items.length;
}


/**
 * Every 15 min, results pilot: api-football fills what the Tipsport feed does not give (confirmed final results when
 * the short-lived `ended` flag was missed, half-time/extra-time/penalties, statistics, lineups, head-to-head).
 * Tipsport calls stay exactly as before (Tipsport's condition for using its data).
 */
export async function refreshApiFootball(env: Env): Promise<void> {
  const db = resultsSyncDb(env);
  const cfg = resultsConfig(env);
  if (!db || !cfg.apiFootball || !env.APISPORTS_KEY) return;
  const r = await syncApiFootball(db, cfg, { key: env.APISPORTS_KEY, cap: cfg.cap, floor: cfg.reserve });
  if (r.error) console.warn('api-football sync', r.error);
}
