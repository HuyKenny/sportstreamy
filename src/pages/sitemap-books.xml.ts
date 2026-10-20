import { env } from 'cloudflare:workers';
import type { Env } from '../lib/types';
import { BOOKS } from '../lib/books';
import { loadBranches, citiesOf, CITY_MIN } from '../lib/pobocky';
import { xml, urlset, type Url } from '../lib/sitemap';
export const prerender = false;
/** Bookmaker hub, topic pages and branch pages (brands with data; cities with more than one shop). */
export const GET = async () => {
  const doc = await loadBranches(env as unknown as Env);
  const lastmod = (doc.updated || new Date().toISOString()).slice(0, 10);
  const urls: Url[] = [{ loc: '/sazkove-kancelare/', priority: 0.8 }, { loc: '/pobocky/', lastmod, priority: 0.6 }];
  for (const b of BOOKS) {
    urls.push({ loc: `/sazkove-kancelare/${b.slug}/`, priority: 0.7 });
    for (const t of b.topics) urls.push({ loc: `/sazkove-kancelare/${b.slug}/${t}/`, priority: t === 'tv' ? 0.8 : 0.6 });
    const rows = doc.brands[b.slug] ?? [];
    if (!b.branches || !rows.length) continue;
    urls.push({ loc: `/pobocky/${b.slug}/`, lastmod, priority: 0.6 });
    for (const c of citiesOf(rows)) if (c.n >= CITY_MIN) urls.push({ loc: `/pobocky/${b.slug}/${c.slug}/`, lastmod, priority: 0.4 });
  }
  return xml(urlset(urls), 3600);
};
