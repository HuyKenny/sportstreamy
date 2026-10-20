import type { Env, Match, Snapshot } from './types';
import { liveMatches, login, toMatch, upcomingMatches, odds } from './tipsport';
import { competitionOf } from './competitions';
import { SPORT_BY_ID } from './sports';
import { matchPath } from './url';

/** Season-long markets ("Chance Liga 2026/2027 – celkově", "po 30. kole", top scorer…) are not matches. */
const OUTRIGHT = /celkov|dlouhodob|vítěz skupiny|vítěz soutěže|po \d+\.\s?kol|nejlepší střel|sestup|postup/i;

/** On the site: anything with video, plus head-to-head matches of curated top competitions (odds + live stats only). */
const keep = (m: Match | null): m is Match =>
  !!m && SPORT_BY_ID.has(m.sp) && !OUTRIGHT.test(m.h) && (m.stream || (!!m.a && !!competitionOf(m.sp, m.lg)));

const put = (env: Env, key: string, items: Match[]) => env.DATA.put(key, JSON.stringify({ at: Date.now(), items } satisfies Snapshot<Match>));

/** Every 3 min: what is in play right now (score, minute). */
export async function refreshLive(env: Env): Promise<number> {
  const s = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const items = (await liveMatches(s)).map(toMatch).filter(keep);
  // An empty answer is far more likely an outage than "nothing is on": keep the previous snapshot.
  if (items.length) await put(env, 'live', items);
  return items.length;
}

/** Every 15 min: next 7 days with Tipsport odds, plus Chance odds joined by match id (identical ids on both platforms). */
export async function refreshUpcoming(env: Env): Promise<number> {
  const t = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const items = (await upcomingMatches(t)).map(toMatch).filter(keep);
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
 * Hourly: tell IndexNow (Bing, Seznam, Yandex…) about match pages starting in the next 48 h that we have not
 * submitted yet. The sent ids live in KV so every URL goes out once.
 */
export async function pingIndexNow(env: Env): Promise<number> {
  if (!env.INDEXNOW_KEY) return 0;
  const [pre, sent] = await Promise.all([env.DATA.get<Snapshot<Match>>('pre', 'json'), env.DATA.get<number[]>('ixsent', 'json')]);
  const done = new Set(sent ?? []);
  const soon = Date.now() + 48 * 3600_000;
  const fresh = (pre?.items ?? []).filter((m) => m.st < soon && !done.has(m.id)).slice(0, 1000);
  if (!fresh.length) return 0;
  const host = 'sportstreamy.cz';
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: env.INDEXNOW_KEY, keyLocation: `https://${host}/${env.INDEXNOW_KEY}.txt`, urlList: fresh.map((m) => `https://${host}${matchPath(m)}`) }),
  });
  if (!res.ok && res.status !== 202) throw new Error(`indexnow ${res.status}`);
  const keep = [...done, ...fresh.map((m) => m.id)].slice(-6000);
  await env.DATA.put('ixsent', JSON.stringify(keep));
  return fresh.length;
}
