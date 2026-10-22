import type { Env, Match, Snapshot } from './types';
import { dayKey, addDays } from './text';
import { SPORTS } from './sports';
import { competitionOf } from './competitions';

export interface View {
  /** In play now: start has passed and not finished. */
  live: Match[];
  /** Not started yet, sorted by start. */
  upcoming: Match[];
  /** Started within the last 3 h but not in the live feed any more ("záznam"). */
  recent: Match[];
  at: number;
}

const ORDER = new Map(SPORTS.map((s, i) => [s.id, s.main ? i : 100 + i]));
/** Lower = shown first: main sports in menu order, then the rest. */
export const rank = (m: Match) => ORDER.get(m.sp) ?? 999;

/** Low-interest feeds that would otherwise fill the live lists: ITF/UTR/Challenger tennis, Setka-style leagues, virtual sports. */
const LOW = /\bITF\b|\bUTR\b|Challenger|Setka|eSports|e-sport|Cyber|Battle|Liga Pro|Virtu|simul|\(\d+x\d+ min\)/i;

/**
 * 0 = curated top competition or a Czech competition, 1 = main sport, 2 = the rest (table tennis, lower leagues,
 * ITF/UTR tennis, virtual leagues…). Lists sort by tier first, so Czech fans see football and hockey before ITF.
 */
export const tier = (m: Match) => (competitionOf(m.sp, m.lg)?.top || /^Česk/.test(m.lg) ? 0 : LOW.test(m.lg) ? 2 : rank(m) < 100 ? 1 : 2);

/** Top competitions, then main sports, each by start time – so Chance Liga is not buried under table tennis. */
export const featured = (items: Match[]) => [...items].sort((a, b) => tier(a) - tier(b) || a.st - b.st || a.id - b.id);

let cache: { at: number; v: View } | undefined;

/** Merge live + prematch snapshots. Tipsport flags matches "live" hours early, so live also requires start <= now. */
export async function view(env: Env, now = Date.now()): Promise<View> {
  if (cache && now - cache.at < 15_000) return cache.v;
  const [l, p] = await Promise.all([env.DATA.get<Snapshot<Match>>('live', 'json'), env.DATA.get<Snapshot<Match>>('pre', 'json')]);
  const liveFeed = new Map((l?.items ?? []).map((m) => [m.id, m]));
  const all = new Map<number, Match>();
  for (const m of p?.items ?? []) all.set(m.id, m);
  for (const m of liveFeed.values()) all.set(m.id, { ...all.get(m.id), ...m, o: all.get(m.id)?.o });
  const live: Match[] = [];
  const upcoming: Match[] = [];
  const recent: Match[] = [];
  for (const m of all.values()) {
    if (m.st > now) upcoming.push(m);
    else if (liveFeed.has(m.id)) live.push(m);
    else if (now - m.st < 3 * 3600_000) recent.push(m);
  }
  const bySt = (a: Match, b: Match) => a.st - b.st || a.id - b.id;
  upcoming.sort(bySt);
  recent.sort((a, b) => b.st - a.st);
  // Within a tier: matches with video first (that is what people come for), then sport order and start.
  live.sort((a, b) => tier(a) - tier(b) || Number(b.stream) - Number(a.stream) || rank(a) - rank(b) || bySt(a, b));
  const v = { live, upcoming, recent, at: Math.max(l?.at ?? 0, p?.at ?? 0) };
  cache = { at: now, v };
  return v;
}

export const matchesOn = (v: View, key: string) => v.upcoming.filter((m) => dayKey(m.st) === key);
export { dayKey, addDays };

/** Round-robin across sports (in the given order), so a carousel is not five tennis matches in a row. */
export function mixSports(items: Match[], n: number): Match[] {
  const by = new Map<number, Match[]>();
  for (const m of items) by.set(m.sp, [...(by.get(m.sp) ?? []), m]);
  const queues = [...by.values()];
  const out: Match[] = [];
  while (out.length < n && queues.some((q) => q.length)) for (const q of queues) { const m = q.shift(); if (m && out.length < n) out.push(m); }
  return out;
}
