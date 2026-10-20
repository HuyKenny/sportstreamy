import type { Env, Match, Snapshot } from './types';
import { liveMatches, login, toMatch, upcomingMatches, odds } from './tipsport';
import { competitionOf } from './competitions';
import { SPORT_BY_ID } from './sports';
import { resultsConfig, resultsSyncDb } from './results/config';
import { syncTipsportLive, syncTipsportSchedule } from './results/sync';
import { inMatchWindow } from './results/store';

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
 * Every minute, results pilot only: Tipsport keeps an ended match in the live feed for ~1 minute (measured 21. 10.:
 * median 60 s, max 4 min), so the 3-minute pass alone would miss many final whistles. This pass runs only while a pilot
 * match is about to start or in play (one D1 read otherwise) and on minutes the 3-minute job does not cover.
 */
export async function refreshResults(env: Env, now = new Date()): Promise<void> {
  const db = resultsSyncDb(env);
  if (!db || now.getUTCMinutes() % 3 === 0 || !(await inMatchWindow(db, now.getTime()))) return;
  const s = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  await syncTipsportLive(db, await liveMatches(s), resultsConfig(env));
}
