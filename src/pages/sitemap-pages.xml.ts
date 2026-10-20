import { getCollection } from 'astro:content';
import { xml, urlset, type Url } from '../lib/sitemap';
export const prerender = false;
export const GET = async () => {
  const urls: Url[] = [
    { loc: '/', priority: 1 }, { loc: '/zive/', priority: 0.9 }, { loc: '/program/', priority: 0.9 }, { loc: '/program/zitra/', priority: 0.7 },
    { loc: '/clanky/', priority: 0.5 }, { loc: '/o-webu/' }, { loc: '/zodpovedne-hrani/' }, { loc: '/osobni-udaje/' }, { loc: '/podminky/' }, { loc: '/kontakt/' }, { loc: '/zdroje-fotek/' },
  ];
  urls.push({ loc: '/jak-sledovat/', priority: 0.6 });
  for (const p of await getCollection('nahledy')) urls.push({ loc: `/jak-sledovat/${p.id}/`, lastmod: p.data.date.toISOString().slice(0, 10), priority: 0.7 });
  for (const a of await getCollection('clanky')) urls.push({ loc: `/clanky/${a.id}/`, lastmod: (a.data.updated ?? a.data.date).toISOString().slice(0, 10), priority: 0.5 });
  return xml(urlset(urls), 3600);
};
