import type { Db } from './db';
import type { ResultsConfig } from './config';
import { fromTipsport, type Raw, type Obs } from './normalize';
import { checkTeams, upsertState, upsertSchedule, markUnconfirmed } from './store';
import { runJob, type RunResult } from './budget';
import { AF_LEAGUE, fixturesOnDate, fixtureDetail, headToHead, QuotaError, type AfOptions } from './apifootball';
import { dueDays, markFetched, slotRows, linksFor, pair, applyFixture, needDetail, needH2h, saveStats, saveH2h, spare } from './afstore';
import { nameScore, detailFrom, meetingsFrom } from './afdata';

const LEASE = 150_000; // shorter than the */3 cron interval

const pilot = (raw: Raw[], at: number, cfg: ResultsConfig) => raw.map((r) => fromTipsport(r, at, cfg.comps)).filter((o): o is Obs => !!o);

/**
 * Live feed → results. Uses the response refreshLive() already fetched: no extra request to Tipsport.
 * An empty feed is treated as an outage: nothing is written and nothing is marked unconfirmed.
 */
export function syncTipsportLive(db: Db, raw: Raw[], cfg: ResultsConfig, at = Date.now()): Promise<RunResult> {
  return runJob(db, 'tipsport-live', at, LEASE, async () => {
    if (!raw.length) throw new Error('empty live feed (kept previous data)');
    const list = pilot(raw, at, cfg);
    await checkTeams(db, list, at);
    const written = await upsertState(db, list, at);
    await markUnconfirmed(db, 'tipsport', at);
    return { seen: list.length, written, review: list.filter((o) => o.review).length };
  });
}

/** Prematch feed → programme of the pilot competitions (kick-off changes, new fixtures). Same response refreshUpcoming() uses. */
export function syncTipsportSchedule(db: Db, raw: Raw[], cfg: ResultsConfig, at = Date.now()): Promise<RunResult> {
  return runJob(db, 'tipsport-schedule', at, LEASE, async () => {
    if (!raw.length) throw new Error('empty prematch feed (kept previous data)');
    // Only matches that have not started: anything already running belongs to the live feed.
    const list = pilot(raw.filter((r) => Number(r.dateStart) > at && !r.ended), at, cfg);
    await checkTeams(db, list, at);
    const written = await upsertSchedule(db, list, at);
    return { seen: list.length, written, review: list.filter((o) => o.review).length };
  });
}

const LEAGUE_COMP = new Map(Object.entries(AF_LEAGUE).map(([comp, id]) => [id, comp]));
/** Optional requests (details, H2H) only while this many stay spare after our cap and the provider floor. */
const OPTIONAL_SPARE = 15;

/**
 * Pair one day's api-football fixtures with our Tipsport matches and apply their results.
 * Pairing never relies on names alone: same competition, kick-off within 15 min, and either known team links or
 * both names matching (one name is enough only when the slot holds a single fixture and a single match).
 */
export async function pairAndApply(db: Db, fixtures: Raw[], comps: string[], at: number): Promise<{ applied: number; ambiguous: number }> {
  let applied = 0;
  let ambiguous = 0;
  const pilot = fixtures.filter((f) => comps.includes(LEAGUE_COMP.get(Number(f.league?.id)) ?? '') && f.fixture?.id && f.teams?.home?.id && f.teams?.away?.id);
  for (const fx of pilot) {
    const comp = LEAGUE_COMP.get(Number(fx.league.id))!;
    const start = Number(fx.fixture.timestamp) * 1000;
    const rows = await slotRows(db, comp, start);
    let row = rows.find((r) => r.af_id === String(fx.fixture.id));
    if (!row) {
      const sameSlot = pilot.filter((f) => f.league.id === fx.league.id && Math.abs(Number(f.fixture.timestamp) * 1000 - start) <= 15 * 60_000).length;
      const links = await linksFor(db, rows.flatMap((r) => [r.home_ext, r.away_ext]));
      const ok = rows.filter((r) => !r.af_id).filter((r) => {
        const lh = r.home_ext ? links.get(r.home_ext) : undefined;
        const la = r.away_ext ? links.get(r.away_ext) : undefined;
        if (lh || la) return (!lh || lh === String(fx.teams.home.id)) && (!la || la === String(fx.teams.away.id));
        const sh = nameScore(r.home, String(fx.teams.home.name));
        const sa = nameScore(r.away, String(fx.teams.away.name));
        return (sh >= 0.75 && sa >= 0.75) || (rows.length === 1 && sameSlot === 1 && Math.max(sh, sa) >= 0.75);
      });
      if (ok.length !== 1) {
        if (ok.length > 1 || rows.some((r) => !r.af_id)) ambiguous++;
        continue;
      }
      if (!(await pair(db, ok[0], fx, at))) { ambiguous++; continue; }
      row = ok[0];
    }
    if (await applyFixture(db, row, fx, at)) applied++;
  }
  return { applied, ambiguous };
}

/**
 * api-football as the second source, run from the 15-minute cron: fixture lists of the days that need them
 * (pairing, confirming results Tipsport may have missed), then — while the budget allows — details of finished
 * matches and head-to-head of upcoming ones. Results first, optional data last; every request is reserved.
 */
export function syncApiFootball(db: Db, cfg: ResultsConfig, o: AfOptions, at = Date.now()): Promise<RunResult> {
  return runJob(db, 'apifootball', at, 10 * 60_000, async () => {
    let seen = 0;
    let written = 0;
    let review = 0;
    for (const day of await dueDays(db, cfg.comps, at)) {
      const fixtures = await fixturesOnDate(db, day, o);
      await markFetched(db, day, at);
      const r = await pairAndApply(db, fixtures, cfg.comps, at);
      seen += fixtures.length;
      written += r.applied;
      review += r.ambiguous;
    }
    if (cfg.stats) {
      try {
        for (const row of await needDetail(db, cfg.comps, at, 6)) {
          if ((await spare(db, 'apifootball', at, o.cap, o.floor)) < OPTIONAL_SPARE) break;
          const fx = await fixtureDetail(db, row.af_id!, o);
          // Stored even when empty, so a match without published details is not asked for again and again.
          await saveStats(db, row.id, JSON.stringify(detailFrom(fx ?? {}, at) ?? { none: true, at }));
        }
        const links = new Map<string, string>();
        for (const row of await needH2h(db, cfg.comps, at, 6)) {
          if ((await spare(db, 'apifootball', at, o.cap, o.floor)) < OPTIONAL_SPARE) break;
          for (const [k, v] of await linksFor(db, [row.home_ext, row.away_ext])) links.set(k, v);
          const a = row.home_ext ? links.get(row.home_ext) : undefined;
          const b = row.away_ext ? links.get(row.away_ext) : undefined;
          if (!a || !b) continue;
          await saveH2h(db, row.id, JSON.stringify(meetingsFrom(await headToHead(db, a, b, o))));
        }
      } catch (e) {
        if (!(e instanceof QuotaError)) throw e; // optional data stops quietly at the budget
      }
    }
    return { seen, written, review };
  });
}
