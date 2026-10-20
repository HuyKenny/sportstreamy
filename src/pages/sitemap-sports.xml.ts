import { env } from 'cloudflare:workers';
import type { Env } from '../lib/types';
import { view } from '../lib/matches';
import { leagues } from '../lib/page';
import { SPORTS, SPORT_BY_ID } from '../lib/sports';
import { COMPETITIONS } from '../lib/competitions';
import { TODAY_SPORTS } from '../lib/sport-text';
import { xml, urlset, type Url } from '../lib/sitemap';
export const prerender = false;
/** Sport pages, all curated competitions (stable), and other competitions with at least 2 matches on. */
export const GET = async () => {
  const v = await view(env as unknown as Env);
  const today = new Date().toISOString().slice(0, 10);
  const urls: Url[] = [];
  const active = new Set([...v.live, ...v.upcoming].map((m) => m.sp));
  for (const s of SPORTS) if (s.main || active.has(s.id)) urls.push({ loc: `/${s.slug}-online/`, lastmod: today, priority: s.main ? 0.9 : 0.6 });
  for (const s of TODAY_SPORTS) urls.push({ loc: `/${s}-dnes/`, lastmod: today, priority: 0.9 });
  const seen = new Set<string>();
  for (const c of COMPETITIONS) { const loc = `/${SPORT_BY_ID.get(c.sp)!.slug}-online/${c.slug}/`; seen.add(loc); urls.push({ loc, lastmod: today, priority: c.top ? 0.8 : 0.6 }); }
  for (const l of leagues(v)) {
    const loc = `/${SPORT_BY_ID.get(l.sp)!.slug}-online/${l.slug}/`;
    if (l.n >= 2 && !seen.has(loc)) { seen.add(loc); urls.push({ loc, lastmod: today, priority: 0.4 }); }
  }
  return xml(urlset(urls));
};
