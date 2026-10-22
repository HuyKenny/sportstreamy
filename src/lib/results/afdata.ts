import type { Raw } from './normalize';

/**
 * Pure transforms of api-football data: team-name similarity for pairing with Tipsport, and the compact JSON we
 * store for details and head-to-head. Nothing here invents values: missing numbers stay null.
 */

const NOISE = new Set(['fc', 'afc', 'cf', 'sc', 'sk', 'fk', 'ac', 'as', 'ss', 'us', 'cd', 'ud', 'club', 'football', '1905', '1910', 'a', 's', 'de', 'the']);

export function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NOISE.has(t));
}

/**
 * 1 when every significant word of the shorter name appears in the longer one, also as a 4+ letter prefix
 * ("Nottingham" ~ "Nottingham Forest", "Plzen" ~ "Viktoria Plzen"); otherwise the share of shared words, so
 * "Manchester United" vs "Manchester City" is only 0.5.
 */
export function nameScore(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  const same = (x: string, y: string) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return short.filter((t) => long.some((u) => same(t, u))).length / short.length;
}

export interface Detail {
  /** For 'sub': player = going off, assist = coming on (checked against real data: scorers appear as `player` when replaced). */
  events: { min: string; side: 'h' | 'a'; kind: 'goal' | 'own' | 'pen' | 'missed' | 'red' | 'yellowred' | 'yellow' | 'sub' | 'var'; player: string; assist: string | null; note?: string }[];
  stats: { key: string; h: string | null; a: string | null }[];
  lineups: { side: 'h' | 'a'; formation: string | null; coach: string | null; xi: string[] }[];
  at: number;
}

const KIND = (type: string, detail: string): Detail['events'][number]['kind'] | null => {
  if (type === 'Goal') return /own/i.test(detail) ? 'own' : /missed/i.test(detail) ? 'missed' : /penalty/i.test(detail) ? 'pen' : 'goal';
  if (type === 'Card') return /second yellow/i.test(detail) ? 'yellowred' : /red/i.test(detail) ? 'red' : 'yellow';
  if (type === 'subst') return 'sub';
  if (type === 'Var') return 'var';
  return null;
};

/** The statistics we show, in this order (labels in view.ts). Others are dropped. */
export const STAT_KEYS = ['Ball Possession', 'Total Shots', 'Shots on Goal', 'Corner Kicks', 'Fouls', 'Offsides', 'Yellow Cards', 'Red Cards', 'Goalkeeper Saves', 'expected_goals'];

const val = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

export function detailFrom(fx: Raw, at: number): Detail | null {
  const home = fx?.teams?.home?.id;
  if (!home) return null;
  const side = (teamId: unknown): 'h' | 'a' => (teamId === home ? 'h' : 'a');
  const events = ((fx.events ?? []) as Raw[]).flatMap((e) => {
    const kind = KIND(String(e.type ?? ''), String(e.detail ?? ''));
    if (!kind || !e.player?.name) return [];
    const min = e.time?.elapsed != null ? `${e.time.elapsed}${e.time.extra ? `+${e.time.extra}` : ''}'` : '';
    return [{ min, side: side(e.team?.id), kind, player: String(e.player.name), assist: e.assist?.name ? String(e.assist.name) : null, ...(kind === 'var' && e.detail ? { note: String(e.detail) } : {}) }];
  });
  const byTeam = new Map(((fx.statistics ?? []) as Raw[]).map((s) => [side(s.team?.id), new Map(((s.statistics ?? []) as Raw[]).map((x) => [String(x.type), val(x.value)]))]));
  const stats = byTeam.size === 2
    ? STAT_KEYS.map((key) => ({ key, h: byTeam.get('h')?.get(key) ?? null, a: byTeam.get('a')?.get(key) ?? null })).filter((s) => s.h !== null || s.a !== null)
    : [];
  const lineups = ((fx.lineups ?? []) as Raw[]).map((l) => ({
    side: side(l.team?.id),
    formation: val(l.formation),
    coach: l.coach?.name ? String(l.coach.name) : null,
    xi: ((l.startXI ?? []) as Raw[]).map((p) => String(p.player?.name ?? '')).filter(Boolean),
  })).filter((l) => l.xi.length);
  if (!events.length && !stats.length && !lineups.length) return null;
  return { events, stats, lineups, at };
}

export interface Meeting { date: number; home: string; away: string; sh: number; sa: number; league: string }

const FINISHED = new Set(['FT', 'AET', 'PEN']);

/** Last finished meetings, newest first (provider names, not ours). */
export function meetingsFrom(list: Raw[], limit = 5): Meeting[] {
  return list
    .filter((f) => FINISHED.has(String(f.fixture?.status?.short)) && f.goals?.home != null && f.goals?.away != null)
    .map((f) => ({ date: Number(f.fixture.timestamp) * 1000, home: String(f.teams?.home?.name ?? ''), away: String(f.teams?.away?.name ?? ''), sh: Number(f.goals.home), sa: Number(f.goals.away), league: String(f.league?.name ?? '') }))
    .sort((x, y) => y.date - x.date)
    .slice(0, limit);
}
