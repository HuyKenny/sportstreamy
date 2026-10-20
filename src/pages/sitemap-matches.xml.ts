import { env } from 'cloudflare:workers';
import type { Env } from '../lib/types';
import { view } from '../lib/matches';
import { matchPath } from '../lib/url';
import { xml, urlset } from '../lib/sitemap';
export const prerender = false;
/** Live + upcoming matches only; finished ones drop out (their URL answers 410). */
export const GET = async () => {
  const v = await view(env as unknown as Env);
  const lastmod = new Date(v.at || Date.now()).toISOString();
  const urls = [...v.live, ...v.upcoming].slice(0, 5000).map((m) => ({ loc: matchPath(m), lastmod }));
  return xml(urlset(urls), 600);
};
