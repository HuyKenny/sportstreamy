import type { ResultsEnv } from './config';
import { resultsConfig, resultsDb } from './config';
import { rowsBetween, dataRange, type ResultRow } from './store';
import { pragueDay, isDayKey } from './time';
import { group, type Group } from './status';
import { dayKey, addDays } from '../text';
import { competitionBySlug } from '../competitions';

/** Sports with a verified results source, in menu order. '' = all of them (the /vysledky/ hub). */
export const RESULT_SPORTS = [
  { slug: 'fotbal', id: 16, name: 'Fotbal', genitive: 'fotbalu' },
  { slug: 'hokej', id: 23, name: 'Hokej', genitive: 'hokeje' },
  { slug: 'basketbal', id: 7, name: 'Basketbal', genitive: 'basketbalu' },
  { slug: 'volejbal', id: 47, name: 'Volejbal', genitive: 'volejbalu' },
  { slug: 'hazena', id: 20, name: 'Házená', genitive: 'házené' },
];
const ALL = { slug: '', id: 0, name: 'Všechny sporty', genitive: 'zápasů' };
const sportOfComp = (c: string) => competitionBySlug(c)?.sp ?? 0;
/** Configured competitions of one sport (or all, grouped by sport in menu order). */
export const compsOf = (comps: string[], sport: number) =>
  sport ? comps.filter((c) => sportOfComp(c) === sport) : RESULT_SPORTS.flatMap((s) => comps.filter((c) => sportOfComp(c) === s.id));

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
  sport: (typeof RESULT_SPORTS)[number] | typeof ALL;
  sports: { slug: string; name: string; n: number }[]; // sports with matches that day (hub chips)
  updated: number | null;
}

/**
 * Everything /vysledky/ and /vysledky/<sport>/ need, from stored data only (no provider call on a page view).
 * Returns a redirect for invalid or out-of-range dates and for ?den=<today> (one URL for "today").
 */
export async function resultsPage(env: ResultsEnv, url: URL, sportSlug: string, now = Date.now()): Promise<{ redirect: string; status: 301 | 302 } | { notFound: true } | ResultsPageData> {
  const db = resultsDb(env);
  const sport = sportSlug ? RESULT_SPORTS.find((s) => s.slug === sportSlug) : ALL;
  if (!db || !sport) return { notFound: true };
  const cfg0 = resultsConfig(env);
  const cfg = { ...cfg0, comps: compsOf(cfg0.comps, sport.id) };
  if (!cfg.comps.length) return { notFound: true };
  const base = sport.slug ? `/vysledky/${sport.slug}/` : '/vysledky/';
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
  const all = await rowsBetween(db, from, to, cfg.comps, sport.id || undefined);
  const rows = all.filter((r) => (!comp || r.comp === comp) && (!stav || group(r.status) === STAV[stav]));
  const updated = all.reduce<number | null>((m, r) => (m == null || r.checked_at > m ? r.checked_at : m), null);
  return {
    rows, all, key, today, minKey, maxKey, comp, stav, comps: cfg.comps, staleMs: cfg.staleMs, base,
    noindex: !!(den || comp || stav || p.size),
    path: `${url.pathname}${url.search}`,
    sport, updated,
    sports: RESULT_SPORTS.map((s) => ({ slug: s.slug, name: s.name, n: all.filter((r) => r.sport === s.id).length })).filter((s) => !sport.id && s.n),
  };
}
