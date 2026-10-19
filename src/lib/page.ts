import { env } from 'cloudflare:workers';
import type { Env, Match } from './types';
import { view, featured, rank, type View } from './matches';
import { SPORTS, SPORT_BY_ID } from './sports';
import { slugify } from './text';

export const getEnv = () => env as unknown as Env;

export interface SportCount { slug: string; name: string; id: number; live: number; total: number }

/** Per-sport counts for chips and sidebars (only sports that have anything on). */
export function sportCounts(v: View): SportCount[] {
  const out: SportCount[] = [];
  for (const s of SPORTS) {
    const live = v.live.filter((m) => m.sp === s.id).length;
    const total = live + v.upcoming.filter((m) => m.sp === s.id).length;
    if (total) out.push({ slug: s.slug, name: s.name, id: s.id, live, total });
  }
  return out;
}

export interface League { name: string; slug: string; sp: number; n: number; live: number }

/** Competitions ranked by how much is on (live counts double). */
export function leagues(v: View, sp?: number): League[] {
  const map = new Map<string, League>();
  const add = (m: Match, isLive: boolean) => {
    if (sp && m.sp !== sp) return;
    if (!SPORT_BY_ID.has(m.sp) || !m.lg) return;
    const k = `${m.sp}|${m.lg}`;
    const l = map.get(k) ?? { name: m.lg, slug: slugify(m.lg), sp: m.sp, n: 0, live: 0 };
    l.n++;
    if (isLive) l.live++;
    map.set(k, l);
  };
  v.live.forEach((m) => add(m, true));
  v.upcoming.forEach((m) => add(m, false));
  return [...map.values()].sort((a, b) => b.live * 2 + b.n - (a.live * 2 + a.n));
}

export { view, featured, rank };
