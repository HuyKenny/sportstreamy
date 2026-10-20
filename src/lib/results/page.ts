import type { ResultsEnv } from './config';
import { resultsConfig, resultsDb } from './config';
import { rowsBetween, dataRange, type ResultRow } from './store';
import { pragueDay, isDayKey } from './time';
import { group, type Group } from './status';
import { dayKey, addDays } from '../text';

/** Sports with a verified results source. Only football for the pilot. */
export const RESULT_SPORTS = [{ slug: 'fotbal', id: 16, name: 'Fotbal', genitive: 'fotbalu' }];

const STAV: Record<string, Group> = { probiha: 'live', skonceno: 'final', nadchazejici: 'upcoming' };
export const STAV_LABELS: [string, string][] = [['', 'Vše'], ['probiha', 'Probíhá'], ['skonceno', 'Skončeno'], ['nadchazejici', 'Nadcházející']];

export interface ResultsPageData {
  rows: ResultRow[]; // filtered
  all: ResultRow[]; // whole day (counts for chips)
  key: string;
  today: string;
  minKey: string;
  maxKey: string;
  comp: string;
  stav: string;
  comps: string[];
  staleMs: number;
  base: string;
  noindex: boolean;
  path: string;
  sport: (typeof RESULT_SPORTS)[number];
  updated: number | null;
}

/**
 * Everything /vysledky/ and /vysledky/<sport>/ need, from stored data only (no provider call on a page view).
 * Returns a redirect for invalid or out-of-range dates and for ?den=<today> (one URL for "today").
 */
export async function resultsPage(env: ResultsEnv, url: URL, sportSlug: string, now = Date.now()): Promise<{ redirect: string; status: 301 | 302 } | { notFound: true } | ResultsPageData> {
  const db = resultsDb(env);
  const sport = RESULT_SPORTS.find((s) => s.slug === sportSlug);
  if (!db || !sport) return { notFound: true };
  const cfg = resultsConfig(env);
  const base = url.pathname === '/vysledky/' ? '/vysledky/' : `/vysledky/${sport.slug}/`;
  const p = url.searchParams;
  const today = dayKey(now);
  const den = p.get('den') ?? '';
  const comp = cfg.comps.includes(p.get('soutez') ?? '') ? p.get('soutez')! : '';
  const stav = STAV[p.get('stav') ?? ''] ? p.get('stav')! : '';
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ ...(comp ? { soutez: comp } : {}), ...(stav ? { stav } : {}), ...extra });
    return `${base}${q.size ? `?${q}` : ''}`;
  };
  if (den === today) return { redirect: keep({}), status: 301 };
  const range = await dataRange(db, cfg.comps);
  // The picker covers only days we hold data for (plus yesterday/tomorrow): no endless calendar of empty pages.
  const yesterday = dayKey(addDays(now, -1));
  const minKey = [range.min ? dayKey(range.min) : yesterday, yesterday].sort()[0];
  const maxKey = [range.max ? dayKey(range.max) : today, dayKey(addDays(now, 1))].sort().at(-1)!;
  if (den && (!isDayKey(den) || den < minKey || den > maxKey)) return { redirect: keep({}), status: 302 };
  const key = den || today;
  const [from, to] = pragueDay(key);
  const all = await rowsBetween(db, from, to, cfg.comps, sport.id);
  const rows = all.filter((r) => (!comp || r.comp === comp) && (!stav || group(r.status) === STAV[stav]));
  const updated = all.reduce<number | null>((m, r) => (m == null || r.checked_at > m ? r.checked_at : m), null);
  return {
    rows, all, key, today, minKey, maxKey, comp, stav, comps: cfg.comps, staleMs: cfg.staleMs, base,
    noindex: !!(den || comp || stav || p.size),
    path: `${url.pathname}${url.search}`,
    sport, updated,
  };
}
