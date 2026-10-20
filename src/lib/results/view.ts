import type { Match } from '../types';
import type { ResultRow } from './store';
import { isFinal, isInPlay } from './status';
import { competitionBySlug } from '../competitions';
import { SPORT_BY_ID } from '../sports';

export const resultPath = (r: Pick<ResultRow, 'slug'>) => `/zapas/${r.slug}/`;

/** "2:1" when both sides are known, otherwise null — a missing score is never shown as 0:0. */
export const scoreText = (r: Pick<ResultRow, 'sh' | 'sa'>) => (r.sh != null && r.sa != null ? `${r.sh}:${r.sa}` : null);

export function periodsOf(r: Pick<ResultRow, 'periods'>): [number, number][] {
  try {
    const p = JSON.parse(r.periods ?? 'null');
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/** "poločas 1:0" (+ "prodloužení 1:0", "penalty 4:3") from what the provider published. */
export function detailText(r: ResultRow): string {
  const p = periodsOf(r);
  const out: string[] = [];
  if (p[0]) out.push(`1. poločas ${p[0][0]}:${p[0][1]}`);
  if ((r.status === 'aet' || r.status === 'pen') && p.length > 2) out.push(`prodloužení ${p.slice(2).map((x) => `${x[0]}:${x[1]}`).join(', ')}`);
  if (r.pen_h != null && r.pen_a != null) out.push(`penalty ${r.pen_h}:${r.pen_a}`);
  return out.join(' · ');
}

/** In play, but the provider has not confirmed it for longer than the threshold. */
export const isStale = (r: ResultRow, now: number, staleMs: number) => isInPlay(r.status) && now - r.checked_at > staleMs;

/** Stored row in the shape the existing match components expect. */
export const asMatch = (r: ResultRow): Match => ({
  id: Number(r.ext_id),
  h: r.home,
  a: r.away,
  sp: r.sport,
  lg: r.lg,
  lid: 0,
  st: r.start_utc,
  stream: !!r.stream,
  path: r.path,
  live: isInPlay(r.status),
  ...(scoreText(r) && !isFinal(r.status) ? { sc: scoreText(r)! } : {}),
  ...(r.minute_raw ? { ti: r.minute_raw } : {}),
});

export const compName = (slug: string) => competitionBySlug(slug)?.name ?? slug;

/** Group by competition, in the order of the configured pilot list. */
export function byComp(rows: ResultRow[], comps: string[]): { comp: string; rows: ResultRow[] }[] {
  return comps.map((c) => ({ comp: c, rows: rows.filter((r) => r.comp === c) })).filter((g) => g.rows.length);
}

/** The existing competition page (/fotbal-online/chance-liga/) — results live there, not on a second copy. */
export const compPath = (slug: string) => `/${SPORT_BY_ID.get(competitionBySlug(slug)?.sp ?? 16)?.slug ?? 'fotbal'}-online/${slug}/`;
