import type { Db, Stmt } from './db';
import type { Obs } from './normalize';
import { teamKind } from './normalize';
import { FINAL, IN_PLAY } from './status';

/** A stored match as pages read it. */
export interface ResultRow {
  id: number;
  provider: string;
  sport: number;
  ext_id: string;
  comp: string;
  lg: string;
  season: string | null;
  home: string;
  away: string;
  home_ext: string | null;
  away_ext: string | null;
  start_utc: number;
  status: string;
  status_raw: string | null;
  minute_raw: string | null;
  sh: number | null;
  sa: number | null;
  periods: string | null;
  pen_h: number | null;
  pen_a: number | null;
  stream: number;
  path: string;
  slug: string;
  src_at: number;
  checked_at: number;
  final_at: number | null;
  review: number;
  stats: string | null;
}

const COLS = ['provider', 'sport', 'ext_id', 'comp', 'lg', 'season', 'home', 'away', 'home_ext', 'away_ext', 'start_utc', 'status', 'status_raw', 'minute_raw', 'sh', 'sa', 'periods', 'pen_h', 'pen_a', 'stream', 'path', 'slug', 'src_at', 'checked_at', 'final_at', 'review'] as const;
const INSERT = `INSERT INTO matches (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`;
const q = (list: readonly string[]) => list.map((s) => `'${s}'`).join(',');
const FIN = q(FINAL);

const values = (o: Obs, at: number) => [
  o.provider, o.sport, o.ext_id, o.comp, o.lg, o.season, o.home, o.away, o.home_ext, o.away_ext, o.start_utc,
  o.status, o.status_raw, o.minute_raw, o.sh, o.sa, o.periods ? JSON.stringify(o.periods) : null, o.pen_h, o.pen_a,
  o.stream ? 1 : 0, o.path, o.slug, o.src_at, at, FINAL.includes(o.status) ? at : null, o.review ? 1 : 0,
];

/**
 * State from the live feed. Idempotent on (provider, sport, ext_id); the slug is never rewritten.
 * Guards: an older answer (src_at) never overwrites a newer one, a final result is never turned back into a live
 * one, and a missing score keeps the last known score instead of blanking it.
 */
const UPSERT_STATE = `${INSERT}
ON CONFLICT (provider, sport, ext_id) DO UPDATE SET
  comp = excluded.comp, lg = excluded.lg, season = COALESCE(excluded.season, matches.season),
  home = excluded.home, away = excluded.away,
  home_ext = COALESCE(excluded.home_ext, matches.home_ext), away_ext = COALESCE(excluded.away_ext, matches.away_ext),
  start_utc = excluded.start_utc,
  status = excluded.status, status_raw = excluded.status_raw, minute_raw = excluded.minute_raw,
  sh = COALESCE(excluded.sh, matches.sh), sa = COALESCE(excluded.sa, matches.sa),
  periods = COALESCE(excluded.periods, matches.periods),
  pen_h = COALESCE(excluded.pen_h, matches.pen_h), pen_a = COALESCE(excluded.pen_a, matches.pen_a),
  stream = excluded.stream, path = CASE WHEN excluded.path <> '' THEN excluded.path ELSE matches.path END,
  src_at = excluded.src_at, checked_at = excluded.checked_at,
  final_at = CASE WHEN excluded.status IN (${FIN}) THEN
      CASE WHEN matches.final_at IS NULL OR matches.status IS NOT excluded.status
             OR matches.sh IS NOT COALESCE(excluded.sh, matches.sh) OR matches.sa IS NOT COALESCE(excluded.sa, matches.sa)
           THEN excluded.checked_at ELSE matches.final_at END
    ELSE NULL END,
  review = MAX(excluded.review, matches.review)
WHERE excluded.src_at >= matches.src_at
  AND NOT (matches.status IN (${FIN}) AND excluded.status NOT IN (${FIN}))`;

/**
 * Programme from the prematch feed: names, kick-off (a postponement only moves start_utc, the record and URL stay),
 * video flag. It never touches the state or score, and leaves finished matches alone.
 */
const UPSERT_SCHEDULE = `${INSERT}
ON CONFLICT (provider, sport, ext_id) DO UPDATE SET
  comp = excluded.comp, lg = excluded.lg, season = COALESCE(excluded.season, matches.season),
  home = excluded.home, away = excluded.away,
  home_ext = COALESCE(excluded.home_ext, matches.home_ext), away_ext = COALESCE(excluded.away_ext, matches.away_ext),
  start_utc = excluded.start_utc, stream = excluded.stream,
  path = CASE WHEN excluded.path <> '' THEN excluded.path ELSE matches.path END,
  status = CASE WHEN matches.status = 'unconfirmed' AND excluded.start_utc > excluded.src_at THEN 'scheduled' ELSE matches.status END,
  checked_at = CASE WHEN matches.status IN ('scheduled', 'postponed', 'unconfirmed') THEN MAX(matches.checked_at, excluded.checked_at) ELSE matches.checked_at END,
  review = MAX(excluded.review, matches.review)
WHERE matches.status NOT IN (${FIN})`;

/**
 * Remember what kind of team each provider id is. If an id we know as a men's team suddenly comes as women/youth
 * (or the other way round), the match is held for review instead of publishing a possibly wrong result.
 */
export async function checkTeams(db: Db, list: Obs[], at: number): Promise<void> {
  const stmts: Stmt[] = [];
  const order: [Obs, string][] = [];
  for (const o of list) {
    for (const [id, name] of [[o.home_ext, o.home], [o.away_ext, o.away]] as const) {
      if (!id) continue;
      stmts.push(db.prepare(`INSERT INTO team_map (provider, ext_id, name, kind, seen_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (provider, ext_id) DO UPDATE SET name = excluded.name, seen_at = excluded.seen_at RETURNING kind`)
        .bind(o.provider, id, name, teamKind(name), at));
      order.push([o, teamKind(name)]);
    }
  }
  if (!stmts.length) return;
  const res = (await db.batch(stmts)) as { results?: { kind: string }[] }[];
  res.forEach((r, i) => {
    const [o, kind] = order[i];
    if (r.results?.[0] && r.results[0].kind !== kind) o.review = true;
  });
}

export async function upsertState(db: Db, list: Obs[], at: number): Promise<number> {
  if (!list.length) return 0;
  const res = (await db.batch(list.map((o) => db.prepare(UPSERT_STATE).bind(...values(o, at))))) as { meta?: { changes?: number } }[];
  return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

export async function upsertSchedule(db: Db, list: Obs[], at: number): Promise<number> {
  if (!list.length) return 0;
  const sched = list.map((o) => ({ ...o, status: 'scheduled' as const, sh: null, sa: null, periods: null, pen_h: null, pen_a: null, minute_raw: null, status_raw: null }));
  const res = (await db.batch(sched.map((o) => db.prepare(UPSERT_SCHEDULE).bind(...values(o, at))))) as { meta?: { changes?: number } }[];
  return res.reduce((n, r) => n + (r.meta?.changes ?? 0), 0);
}

/**
 * After a successful, non-empty live feed: in-play matches the feed has not confirmed for `goneMs` left it without
 * an `ended` flag, and scheduled ones long past kick-off were never seen live. Both keep their last known data and
 * are marked 'unconfirmed' — the site says the final result could not be verified instead of inventing one.
 */
export async function markUnconfirmed(db: Db, provider: string, now: number, goneMs = 20 * 60_000, lateMs = 4 * 3600_000): Promise<number> {
  const a = await db.prepare(`UPDATE matches SET status = 'unconfirmed' WHERE provider = ? AND status IN (${q([...IN_PLAY, 'unknown'])}) AND checked_at < ?`).bind(provider, now - goneMs).run();
  const b = await db.prepare(`UPDATE matches SET status = 'unconfirmed' WHERE provider = ? AND status = 'scheduled' AND start_utc < ?`).bind(provider, now - lateMs).run();
  return (a.meta.changes ?? 0) + (b.meta.changes ?? 0);
}

const PUBLIC = `provider = 'tipsport' AND review = 0`;
const inList = (n: number) => Array(n).fill('?').join(',');

/** Is any pilot match about to start or in play? Gates the per-minute pass so it calls Tipsport only around matches. */
export async function inMatchWindow(db: Db, now: number): Promise<boolean> {
  const r = await db
    .prepare(`SELECT 1 AS x FROM matches WHERE provider = 'tipsport' AND status IN ('scheduled', ${q([...IN_PLAY, 'unknown'])}) AND start_utc BETWEEN ? AND ? LIMIT 1`)
    .bind(now - 3 * 3600_000, now + 10 * 60_000)
    .first<{ x: number }>();
  return !!r;
}

/** One query for a whole day / sport / set of competitions (index matches_sport_start). */
export async function rowsBetween(db: Db, from: number, to: number, comps: string[], sport?: number): Promise<ResultRow[]> {
  if (!comps.length) return [];
  const r = await db
    .prepare(`SELECT * FROM matches WHERE ${PUBLIC} AND start_utc >= ? AND start_utc < ? AND comp IN (${inList(comps.length)})${sport ? ' AND sport = ?' : ''} ORDER BY start_utc, id`)
    .bind(from, to, ...comps, ...(sport ? [sport] : []))
    .all<ResultRow>();
  return r.results;
}

export async function rowByExt(db: Db, extId: string | number): Promise<ResultRow | null> {
  return db.prepare(`SELECT * FROM matches WHERE ${PUBLIC} AND ext_id = ? LIMIT 1`).bind(String(extId)).first<ResultRow>();
}

/** Latest finished (or unverified) matches of a competition, newest first. */
export async function recentOfComp(db: Db, comp: string, now: number, limit = 10): Promise<ResultRow[]> {
  const r = await db
    .prepare(`SELECT * FROM matches WHERE ${PUBLIC} AND comp = ? AND start_utc < ? AND status IN (${q([...FINAL, 'unconfirmed', 'cancelled', 'interrupted'])}) ORDER BY start_utc DESC LIMIT ?`)
    .bind(comp, now, limit)
    .all<ResultRow>();
  return r.results;
}

/** Finished matches for the sitemap; lastmod = when the result became final (or was corrected). */
export async function finalsSince(db: Db, since: number, comps: string[]): Promise<Pick<ResultRow, 'slug' | 'final_at'>[]> {
  if (!comps.length) return [];
  const r = await db
    .prepare(`SELECT slug, final_at FROM matches WHERE ${PUBLIC} AND status IN (${FIN}) AND start_utc >= ? AND comp IN (${inList(comps.length)}) ORDER BY start_utc DESC LIMIT 5000`)
    .bind(since, ...comps)
    .all<Pick<ResultRow, 'slug' | 'final_at'>>();
  return r.results;
}

/** First and last kick-off we hold — bounds the date picker so there is no endless calendar of empty days. */
export async function dataRange(db: Db, comps: string[]): Promise<{ min: number | null; max: number | null }> {
  if (!comps.length) return { min: null, max: null };
  const r = await db.prepare(`SELECT MIN(start_utc) AS min, MAX(start_utc) AS max FROM matches WHERE ${PUBLIC} AND comp IN (${inList(comps.length)})`).bind(...comps).first<{ min: number | null; max: number | null }>();
  return r ?? { min: null, max: null };
}

export interface OpsStatus {
  lastOk: Record<string, number | null>;
  lastError: { job: string; at: number; error: string } | null;
  usage: { provider: string; day: string; used: number; cap: number; remaining_reported: number | null }[];
  matches: number;
  review: number;
  staleLive: number;
  unconfirmed: number;
}

export async function opsStatus(db: Db, now: number, staleMs: number): Promise<OpsStatus> {
  const [ok, err, usage, counts] = await db.batch([
    db.prepare('SELECT job, MAX(finished) AS at FROM sync_runs WHERE ok = 1 GROUP BY job'),
    db.prepare('SELECT job, started AS at, error FROM sync_runs WHERE ok = 0 ORDER BY started DESC LIMIT 1'),
    db.prepare('SELECT provider, day, used, cap, remaining_reported FROM api_usage ORDER BY day DESC LIMIT 6'),
    db.prepare(`SELECT COUNT(*) AS matches, SUM(review) AS review,
      SUM(CASE WHEN status IN (${q(IN_PLAY)}) AND checked_at < ? THEN 1 ELSE 0 END) AS staleLive,
      SUM(CASE WHEN status = 'unconfirmed' THEN 1 ELSE 0 END) AS unconfirmed FROM matches`).bind(now - staleMs),
  ]) as { results: Record<string, unknown>[] }[];
  const c = counts.results[0] ?? {};
  return {
    lastOk: Object.fromEntries(ok.results.map((r) => [String(r.job), (r.at as number) ?? null])),
    lastError: (err.results[0] as OpsStatus['lastError']) ?? null,
    usage: usage.results as OpsStatus['usage'],
    matches: Number(c.matches ?? 0),
    review: Number(c.review ?? 0),
    staleLive: Number(c.staleLive ?? 0),
    unconfirmed: Number(c.unconfirmed ?? 0),
  };
}

/** Earlier finished meetings of the same two teams that we hold (by provider team ids, not by names). */
export async function meetings(db: Db, a: string | null, b: string | null, excludeExt: string, limit = 5): Promise<ResultRow[]> {
  if (!a || !b) return [];
  const r = await db
    .prepare(`SELECT * FROM matches WHERE ${PUBLIC} AND status IN (${FIN}) AND ext_id <> ? AND ((home_ext = ? AND away_ext = ?) OR (home_ext = ? AND away_ext = ?)) ORDER BY start_utc DESC LIMIT ?`)
    .bind(excludeExt, a, b, b, a, limit)
    .all<ResultRow>();
  return r.results;
}
