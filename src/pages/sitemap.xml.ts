import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { env } from 'cloudflare:workers';
import type { Env } from '../lib/types';
import { view } from '../lib/matches';
import { SPORTS } from '../lib/sports';
import { matchPath, leaguePath } from '../lib/url';
import { leagues } from '../lib/page';

export const prerender = false;
const BASE = 'https://sportstreamy.cz';

/** One sitemap: sections + sports + live leagues + upcoming matches (matches drop out when they finish). */
export const GET: APIRoute = async () => {
  const v = await view(env as unknown as Env);
  const urls = new Set<string>(['/', '/zive/', '/program/', '/program/zitra/', '/sazkove-kancelare/', '/sazkove-kancelare/tipsport/', '/sazkove-kancelare/chance/', '/sazkove-kancelare/sazka/', '/clanky/', '/o-webu/', '/zodpovedne-hrani/', '/osobni-udaje/', '/podminky/', '/kontakt/']);
  for (const a of await getCollection('clanky')) urls.add(`/clanky/${a.id}/`);
  const bySport = new Map(SPORTS.map((s) => [s.id, s]));
  for (const l of leagues(v)) {
    const s = bySport.get(l.sp);
    if (!s) continue;
    urls.add(`/${s.slug}-online/`);
    if (l.n >= 2) urls.add(leaguePath(s.slug, l.name));
  }
  for (const m of v.upcoming.slice(0, 3000)) urls.add(matchPath(m));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...urls].map((u) => `<url><loc>${BASE}${u}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=900' } });
};
