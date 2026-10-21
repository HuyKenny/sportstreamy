import type { Db } from './db';
import type { ResultRow } from './store';
import type { Raw } from './normalize';
import { FINAL, isFinal } from './status';
import { AF_STATUS } from './normalize';
import { utcDay } from './time';
import { dayKey } from '../text';

const q = (list: readonly string[]) => list.map((s) => `'${s}'`).join(',');
/** api-football codes after which nothing about the result changes any more. */
export const AF_DONE = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO'];
const PILOT = (comps: string[]) => `provider = 'tipsport' AND review = 0 AND comp IN (${q(comps)})`;

/**
 * Prague days whose fixture list must be fetched now (one request per day):
 * - pairing: unpaired pilot matches, at most every 6 h per day;
 * - results: matches past ~100 min from kick-off without a final api-football state, at most every 10 min.
 * Only days inside the Free plan's window (UTC yesterday…tomorrow).
 */
export async function dueDays(db: Db, comps: string[], now: number): Promise<string[]> {
  if (!comps.length) return [];
  const from = now - 36 * 3600_000;
  const to = now + 36 * 3600_000;
  const r = await db
    .prepare(`SELECT start_utc, af_id, af_status, status FROM matches WHERE ${PILOT(comps)} AND start_utc BETWEEN ? AND ? AND status <> 'cancelled'`)
    .bind(from, to)
    .all<Pick<ResultRow, 'start_utc' | 'af_id' | 'af_status' | 'status'>>();
  const fetched = new Map((await db.prepare('SELECT day, at FROM af_fetch').all<{ day: string; at: number }>()).results.map((x) => [x.day, x.at]));
  const allowed = new Set([utcDay(now - 86_400_000), utcDay(now), utcDay(now + 86_400_000)]);
  const days = new Set<string>();
  for (const m of r.results) {
    const day = dayKey(m.start_utc);
    if (!allowed.has(day)) continue;
    const last = fetched.get(day) ?? 0;
    const needPair = !m.af_id && now - last > 6 * 3600_000;
    const needResult = m.start_utc <= now - 100 * 60_000 && !AF_DONE.includes(m.af_status ?? '') && now - last > 10 * 60_000;
    if (needPair || needResult) days.add(day);
  }
  return [...days].sort();
}

export const markFetched = (db: Db, day: string, at: number) =>
  db.prepare('INSERT INTO af_fetch (day, at) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET at = excluded.at').bind(day, at).run();

/** Pilot matches of one competition around a kick-off time. */
export async function slotRows(db: Db, comp: string, start: number, tolMs = 15 * 60_000): Promise<ResultRow[]> {
  const r = await db
    .prepare(`SELECT * FROM matches WHERE provider = 'tipsport' AND review = 0 AND comp = ? AND start_utc BETWEEN ? AND ?`)
    .bind(comp, start - tolMs, start + tolMs)
    .all<ResultRow>();
  return r.results;
}

export async function linksFor(db: Db, tipIds: (string | null)[]): Promise<Map<string, string>> {
  const ids = tipIds.filter((x): x is string => !!x);
  if (!ids.length) return new Map();
  const r = await db.prepare(`SELECT tip_id, af_id FROM team_link WHERE tip_id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all<{ tip_id: string; af_id: string }>();
  return new Map(r.results.map((x) => [x.tip_id, x.af_id]));
}

/** Pair a match with a fixture and remember both team pairs. False when a stored link contradicts it. */
export async function pair(db: Db, row: ResultRow, fx: Raw, at: number): Promise<boolean> {
  const links = await linksFor(db, [row.home_ext, row.away_ext]);
  const hAf = String(fx.teams.home.id);
  const aAf = String(fx.teams.away.id);
  if ((row.home_ext && links.has(row.home_ext) && links.get(row.home_ext) !== hAf) || (row.away_ext && links.has(row.away_ext) && links.get(row.away_ext) !== aAf)) return false;
  const stmts = [db.prepare('UPDATE matches SET af_id = ? WHERE id = ? AND af_id IS NULL').bind(String(fx.fixture.id), row.id)];
  for (const [tip, af, tn, an] of [[row.home_ext, hAf, row.home, fx.teams.home.name], [row.away_ext, aAf, row.away, fx.teams.away.name]] as const) {
    if (tip) stmts.push(db.prepare('INSERT OR IGNORE INTO team_link (tip_id, af_id, tip_name, af_name, created) VALUES (?, ?, ?, ?, ?)').bind(tip, af, tn, String(an), at));
  }
  await db.batch(stmts);
  row.af_id = String(fx.fixture.id);
  return true;
}

/**
 * Bring api-football's verdict into our record:
 * - final there, not final here → our result (status, score, half time, extra time, penalties), source apifootball;
 * - final on both sides → fill missing periods/penalties; a different score is flagged as mismatch (Tipsport kept);
 * - postponed/cancelled there while we have no result → same state here.
 * Live api-football states are ignored: live scores come from Tipsport.
 */
export async function applyFixture(db: Db, row: ResultRow, fx: Raw, at: number): Promise<boolean> {
  const short = String(fx.fixture?.status?.short ?? '');
  const st = AF_STATUS[short];
  const g = fx.goals ?? {};
  const sc = fx.score ?? {};
  const both = (x: { home?: unknown; away?: unknown } | undefined) => x && x.home != null && x.away != null;
  const periods: [number, number][] = [];
  if (both(sc.halftime) && both(sc.fulltime)) {
    periods.push([sc.halftime.home, sc.halftime.away], [sc.fulltime.home - sc.halftime.home, sc.fulltime.away - sc.halftime.away]);
    if (both(sc.extratime)) periods.push([sc.extratime.home, sc.extratime.away]);
  }
  const pen = both(sc.penalty) ? [sc.penalty.home, sc.penalty.away] : [null, null];
  const base = 'af_status = ?, af_checked_at = ?';
  if (st && FINAL.includes(st) && g.home != null && g.away != null) {
    if (!isFinal(row.status)) {
      const r = await db
        .prepare(`UPDATE matches SET ${base}, status = ?, sh = ?, sa = ?, periods = ?, pen_h = ?, pen_a = ?, result_src = 'apifootball', final_at = ?, checked_at = ?, minute_raw = NULL WHERE id = ? AND status NOT IN (${q(FINAL)})`)
        .bind(short, at, st, g.home, g.away, periods.length ? JSON.stringify(periods) : null, pen[0], pen[1], at, at, row.id)
        .run();
      return (r.meta.changes ?? 0) > 0;
    }
    const agree = row.sh === g.home && row.sa === g.away;
    await db
      .prepare(`UPDATE matches SET ${base}, mismatch = ?, periods = COALESCE(periods, ?), pen_h = COALESCE(pen_h, ?), pen_a = COALESCE(pen_a, ?), status = CASE WHEN ? AND status = 'ft' THEN ? ELSE status END WHERE id = ?`)
      .bind(short, at, agree ? 0 : 1, periods.length ? JSON.stringify(periods) : null, pen[0], pen[1], agree ? 1 : 0, st, row.id)
      .run();
    return false;
  }
  if ((st === 'postponed' || st === 'cancelled') && ['scheduled', 'unconfirmed', 'postponed'].includes(row.status)) {
    await db.prepare(`UPDATE matches SET ${base}, status = ? WHERE id = ?`).bind(short, at, st, row.id).run();
    return true;
  }
  await db.prepare(`UPDATE matches SET ${base} WHERE id = ?`).bind(short, at, row.id).run();
  return false;
}

/** Finished, paired matches still without details (newest first). */
export async function needDetail(db: Db, comps: string[], now: number, limit: number): Promise<ResultRow[]> {
  const r = await db
    .prepare(`SELECT * FROM matches WHERE ${PILOT(comps)} AND af_id IS NOT NULL AND af_status IN ('FT','AET','PEN') AND stats IS NULL AND start_utc >= ? ORDER BY start_utc DESC LIMIT ?`)
    .bind(now - 48 * 3600_000, limit)
    .all<ResultRow>();
  return r.results;
}

/** Paired matches from 3 h ago to 36 h ahead without head-to-head, soonest first. */
export async function needH2h(db: Db, comps: string[], now: number, limit: number): Promise<ResultRow[]> {
  const r = await db
    .prepare(`SELECT * FROM matches WHERE ${PILOT(comps)} AND af_id IS NOT NULL AND h2h IS NULL AND start_utc BETWEEN ? AND ? ORDER BY start_utc LIMIT ?`)
    .bind(now - 3 * 3600_000, now + 36 * 3600_000, limit)
    .all<ResultRow>();
  return r.results;
}

export const saveStats = (db: Db, id: number, json: string) => db.prepare('UPDATE matches SET stats = ? WHERE id = ?').bind(json, id).run();
export const saveH2h = (db: Db, id: number, json: string) => db.prepare('UPDATE matches SET h2h = ? WHERE id = ?').bind(json, id).run();

/** Requests still available today for optional data (details, H2H), after our cap and the provider's own count. */
export async function spare(db: Db, provider: string, now: number, cap: number, floor: number): Promise<number> {
  const r = await db.prepare('SELECT used, remaining_reported FROM api_usage WHERE provider = ? AND day = ?').bind(provider, utcDay(now)).first<{ used: number; remaining_reported: number | null }>();
  const ours = cap - (r?.used ?? 0);
  const theirs = r?.remaining_reported == null ? Infinity : r.remaining_reported - floor;
  return Math.min(ours, theirs);
}
