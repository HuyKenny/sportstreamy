import type { Db } from './db';
import type { ResultsConfig } from './config';
import { fromTipsport, fromApiFootball, type Raw, type Obs } from './normalize';
import { checkTeams, upsertState, upsertSchedule, markUnconfirmed } from './store';
import { runJob, type RunResult } from './budget';
import { AF_LEAGUE, currentSeason, fixturesOn, type AfOptions } from './apifootball';
import { dayKey } from '../text';

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

/**
 * api-football (off by default, see docs/vysledky-provoz.md): once a day the current season per league and that
 * day's fixtures — 2 requests per league. Stored with review = 1 for pairing; nothing from it is public yet.
 */
export function syncApiFootball(db: Db, cfg: ResultsConfig, o: AfOptions, at = Date.now()): Promise<RunResult> {
  return runJob(db, 'apifootball', at, 10 * 60_000, async () => {
    let seen = 0;
    let written = 0;
    for (const comp of cfg.comps) {
      const league = AF_LEAGUE[comp];
      if (!league) continue;
      const season = await currentSeason(db, league, o);
      if (!season) throw new Error(`no current season for league ${league}`);
      const list = (await fixturesOn(db, league, season, dayKey(at), o)).map((fx) => fromApiFootball(fx, at, comp)).filter((x): x is Obs => !!x);
      seen += list.length;
      written += await upsertState(db, list, at);
    }
    return { seen, written, review: seen };
  });
}
