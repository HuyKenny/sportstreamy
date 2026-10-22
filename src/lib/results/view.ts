import type { Match } from '../types';
import type { ResultRow } from './store';
import { isFinal, isInPlay } from './status';
import { competitionBySlug } from '../competitions';
import { SPORT_BY_ID } from '../sports';
import type { Detail, Meeting } from './afdata';

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
  const pair = (x: [number, number]) => `${x[0]}:${x[1]}`;
  const out: string[] = [];
  const shoot = r.sport === 23 ? 'nájezdy' : 'penalty';
  if (r.sport === 16 || r.sport === 20) {
    if (p[0]) out.push(`1. poločas ${pair(p[0])}`);
    if ((r.status === 'aet' || r.status === 'pen') && p.length > 2) out.push(`prodloužení ${p.slice(2).map(pair).join(', ')}`);
  } else if (p.length) {
    const regular = r.sport === 23 ? 3 : r.sport === 7 ? 4 : p.length;
    out.push(`${periodWord(r.sport).many} ${p.slice(0, regular).map(pair).join(', ')}`);
    if (p.length > regular) out.push(`prodloužení ${p.slice(regular).map(pair).join(', ')}`);
  }
  if (r.pen_h != null && r.pen_a != null) out.push(`${shoot} ${r.pen_h}:${r.pen_a}`);
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

export const STAT_LABELS: Record<string, string> = {
  'Ball Possession': 'Držení míče', 'Total Shots': 'Střely', 'Shots on Goal': 'Střely na branku', 'Corner Kicks': 'Rohy',
  Fouls: 'Fauly', Offsides: 'Ofsajdy', 'Yellow Cards': 'Žluté karty', 'Red Cards': 'Červené karty',
  'Goalkeeper Saves': 'Zákroky brankáře', expected_goals: 'Očekávané góly (xG)',
};
export const EVENT_LABELS: Record<Detail['events'][number]['kind'], string> = {
  goal: 'Gól', own: 'Vlastní gól', pen: 'Gól z penalty', missed: 'Neproměněná penalta', red: 'Červená karta', yellowred: 'Druhá žlutá a červená', yellow: 'Žlutá karta', sub: 'Střídání', var: 'VAR', pim: 'Vyloučení',
};

/** Stored api-football details, or null when there are none (never an empty shell). */
export function detailOf(r: Pick<ResultRow, 'stats'>): Detail | null {
  try {
    const d = JSON.parse(r.stats ?? 'null');
    return d && !d.none && (d.events?.length || d.stats?.length || d.lineups?.length) ? (d as Detail) : null;
  } catch {
    return null;
  }
}

export function meetingsOf(r: { h2h?: string | null }): Meeting[] {
  try {
    const m = JSON.parse(r.h2h ?? 'null');
    return Array.isArray(m) ? m : [];
  } catch {
    return [];
  }
}

/** VAR decisions as api-football words them → Czech. */
export const VAR_LABELS: Record<string, string> = {
  'Goal cancelled': 'gól neuznán', 'Goal Disallowed - offside': 'gól neuznán – ofsajd', 'Penalty confirmed': 'penalta potvrzena',
  'Penalty cancelled': 'penalta zrušena', 'Card upgrade': 'karta zpřísněna', 'Goal confirmed': 'gól potvrzen',
};

/** Numeric value of a statistic ("49%" → 49, "1.15" → 1.15), null when missing. */
export const statNum = (v: string | null) => (v == null ? null : Number.parseFloat(v.replace('%', '')) || 0);

/** Goals per side for the scoreboard (own goals count for the other side). */
export function scorers(d: Detail | null): { h: Detail['events']; a: Detail['events']; redH: number; redA: number } {
  const ev = d?.events ?? [];
  const goal = (e: Detail['events'][number]) => e.kind === 'goal' || e.kind === 'pen' || e.kind === 'own';
  const red = (e: Detail['events'][number]) => e.kind === 'red' || e.kind === 'yellowred';
  return {
    h: ev.filter((e) => goal(e) && e.side === 'h'),
    a: ev.filter((e) => goal(e) && e.side === 'a'),
    redH: ev.filter((e) => red(e) && e.side === 'h').length,
    redA: ev.filter((e) => red(e) && e.side === 'a').length,
  };
}

/** Hockey: kind of goal and infraction as the provider words them → Czech (unknown words are left out). */
export const HOCKEY_NOTES: Record<string, string> = {
  'Power-play': 'v přesilovce', 'Short-handed': 'v oslabení', 'Empty-net': 'do prázdné branky', 'Penalty shot': 'trestné střílení',
  Hooking: 'hákování', Holding: 'držení', 'Holding the stick': 'držení hole', Slashing: 'sekání', Tripping: 'podražení',
  Roughing: 'hrubost', Interference: 'bránění ve hře', 'High-sticking': 'vysoká hůl', 'Cross-checking': 'krosček',
  Fighting: 'bitka', Boarding: 'naražení na mantinel', Charging: 'napadení', Elbowing: 'loket', 'Delay of game': 'zdržování hry',
  'Too many men on the ice': 'too many men', Unsportsmanlike: 'nesportovní chování', 'Unsportsmanlike conduct': 'nesportovní chování',
  Misconduct: 'osobní trest', 'Game misconduct': 'osobní trest do konce utkání', Kneeing: 'koleno', Diving: 'filmování', Spearing: 'bodnutí holí',
};

/** Sport-aware labels: hockey has periods and shoot-outs, basketball quarters, volleyball sets. */
export function periodWord(sport: number): { one: string; many: string } {
  if (sport === 23) return { one: 'třetina', many: 'třetiny' };
  if (sport === 7) return { one: 'čtvrtina', many: 'čtvrtiny' };
  if (sport === 47) return { one: 'set', many: 'sety' };
  return { one: 'poločas', many: 'poločasy' };
}
