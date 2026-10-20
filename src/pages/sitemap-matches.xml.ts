import { env } from 'cloudflare:workers';
import type { Env } from '../lib/types';
import { view } from '../lib/matches';
import { matchPath } from '../lib/url';
import { xml, urlset } from '../lib/sitemap';
import { resultsConfig, resultsDb } from '../lib/results/config';
import { finalsSince } from '../lib/results/store';
import { resultPath } from '../lib/results/view';
export const prerender = false;
/** Live + upcoming matches; finished ones drop out (410) — except results-pilot matches, archived with lastmod = final result. */
export const GET = async () => {
  const v = await view(env as unknown as Env);
  const lastmod = new Date(v.at || Date.now()).toISOString();
  const urls = [...v.live, ...v.upcoming].slice(0, 5000).map((m) => ({ loc: matchPath(m), lastmod }));
  const e = env as unknown as Env;
  const db = resultsDb(e);
  if (db) {
    const seen = new Set(urls.map((u) => u.loc));
    for (const r of await finalsSince(db, Date.now() - 90 * 86_400_000, resultsConfig(e).comps)) {
      const loc = resultPath(r);
      if (!seen.has(loc)) urls.push({ loc, lastmod: new Date(r.final_at ?? Date.now()).toISOString() });
    }
  }
  return xml(urlset(urls), 600);
};
