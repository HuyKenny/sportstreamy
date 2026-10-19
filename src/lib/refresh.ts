import type { Env, Match, Snapshot } from './types';
import { liveMatches, login, toMatch, upcomingMatches, odds } from './tipsport';

const put = (env: Env, key: string, items: Match[]) => env.DATA.put(key, JSON.stringify({ at: Date.now(), items } satisfies Snapshot<Match>));

/** Every 3 min: what is in play right now (score, minute). */
export async function refreshLive(env: Env): Promise<number> {
  const s = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const items = (await liveMatches(s)).map(toMatch).filter((m): m is Match => !!m);
  // An empty answer is far more likely an outage than "nothing is on": keep the previous snapshot.
  if (items.length) await put(env, 'live', items);
  return items.length;
}

/** Every 15 min: next 7 days with Tipsport odds, plus Chance odds joined by match id (identical ids on both platforms). */
export async function refreshUpcoming(env: Env): Promise<number> {
  const t = await login('partners.tipsport.cz', env.TIPSPORT_CLIENT_ID, env.TIPSPORT_CLIENT_SECRET);
  const items = (await upcomingMatches(t)).map(toMatch).filter((m): m is Match => !!m);
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
