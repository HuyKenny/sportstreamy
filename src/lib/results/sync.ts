import type { Db } from './db';
import type { ResultsConfig } from './config';
import { fromTipsport, type Raw, type Obs } from './normalize';
import { checkTeams, upsertState, upsertSchedule, markUnconfirmed } from './store';
import { runJob, type RunResult } from './budget';
import { listOnDate, detailFor, h2hFor, QuotaError, type AfOptions } from './apifootball';
import { AF_DONE, dueDays, markFetched, slotRows, linksFor, pair, applyFixture, needDetail, needH2h, saveStats, saveH2h, spare } from './afstore';
import { nameScore, detailFrom, detailFromHockey, meetingsFromFx } from './afdata';
import { FOOTBALL, type Fx, type SportApi } from './sports-api';

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
 * Pair one day's api-sports games with our Tipsport matches and apply their results.
 * Pairing never relies on names alone: same competition, kick-off within 15 min, and either known team links or
 * both names matching (one exact + one half-matching name, or one name when the slot holds a single game and a
 * single match). More than one candidate = not paired.
 */
export async function pairAndApply(db: Db, games: Raw[], comps: string[], at: number, def: SportApi = FOOTBALL): Promise<{ applied: number; ambiguous: number }> {
  let applied = 0;
  let ambiguous = 0;
  const leagueComp = new Map(Object.entries(def.leagues).map(([comp, id]) => [id, comp]));
  const pilot = games
    .map((raw) => ({ raw, fx: def.parse(raw) }))
    .filter((x): x is { raw: Raw; fx: Fx } => !!x.fx && comps.includes(leagueComp.get(x.fx.league) ?? '') && !!x.fx.home.id && !!x.fx.away.id);
  for (const { raw, fx } of pilot) {
    const comp = leagueComp.get(fx.league)!;
    const rows = await slotRows(db, comp, fx.ts);
    let row = rows.find((r) => r.af_id === fx.id);
    if (!row) {
      const sameSlot = pilot.filter((x) => x.fx.league === fx.league && Math.abs(x.fx.ts - fx.ts) <= 15 * 60_000).length;
      const links = await linksFor(db, rows.flatMap((r) => [r.home_ext, r.away_ext]));
      const ok = rows.filter((r) => !r.af_id).filter((r) => {
        const lh = r.home_ext ? links.get(r.home_ext) : undefined;
        const la = r.away_ext ? links.get(r.away_ext) : undefined;
        if (lh || la) return (!lh || lh === fx.home.id) && (!la || la === fx.away.id);
        const sh = nameScore(r.home, fx.home.name);
        const sa = nameScore(r.away, fx.away.name);
        // Both names, or one exact and the other half ("Sporting Lisboa" ~ "Sporting CP"); the single-candidate check below still applies.
        return (sh >= 0.75 && sa >= 0.75) || (Math.max(sh, sa) === 1 && Math.min(sh, sa) >= 0.5) || (rows.length === 1 && sameSlot === 1 && Math.max(sh, sa) >= 0.75);
      });
      if (ok.length !== 1) {
        if (ok.length > 1 || rows.some((r) => !r.af_id)) ambiguous++;
        continue;
      }
      if (!(await pair(db, ok[0], fx, at))) { ambiguous++; continue; }
      row = ok[0];
    }
    if (await applyFixture(db, row, raw, at, def)) applied++;
  }
  return { applied, ambiguous };
}

/**
 * One sport from api-sports, run from the 15-minute cron on the Raspberry: game lists of the days that need them
 * (pairing, confirming results Tipsport may have missed), then — while `keep` requests stay free — details of
 * finished matches (football: events/stats/lineups, hockey: events; the response also confirms the result) and
 * head-to-head of upcoming ones. Results first, optional data last; every request is reserved in that sport's own
 * daily ledger, so one sport can never use up another's quota.
 */
export function syncApiSports(db: Db, cfg: ResultsConfig, def: SportApi, o: AfOptions, at = Date.now()): Promise<RunResult> {
  const comps = cfg.comps.filter((c) => c in def.leagues);
  return runJob(db, def.provider, at, 10 * 60_000, async () => {
    let seen = 0;
    let written = 0;
    let review = 0;
    if (!comps.length) return { seen, written, review };
    for (const day of await dueDays(db, comps, at, def)) {
      const games = await listOnDate(db, def, day, o);
      await markFetched(db, day, at, def.provider);
      const r = await pairAndApply(db, games, comps, at, def);
      seen += games.length;
      written += r.applied;
      review += r.ambiguous;
    }
    if (cfg.stats) {
      // Optional data only while `keep` requests stay free for result checks later in the day.
      // At most 4 optional requests per run: the provider's per-minute limit is tighter than documented.
      let left = 4;
      const room = async () => left-- > 0 && (await spare(db, def.provider, at, o.cap, o.floor)) > cfg.keep;
      try {
        if (def.detail) {
          for (const row of await needDetail(db, comps, cfg.priority, at, 6)) {
            if (!(await room())) break;
            const res = await detailFor(db, def, row.af_id!, o);
            if (def.detail.path === '/fixtures') {
              const fx = res as Raw | null;
              if (!fx) { await saveStats(db, row.id, JSON.stringify({ none: true, at })); continue; }
              // The same response confirms or corrects the result.
              if (await applyFixture(db, row, fx, at, def)) written++;
              const done = AF_DONE.includes(String(fx.fixture?.status?.short ?? ''));
              // Stored even when empty, so a match without published details is not asked for again; unfinished → retry.
              if (done) await saveStats(db, row.id, JSON.stringify(detailFrom(fx, at) ?? { none: true, at }));
            } else {
              const home = (await linksFor(db, [row.home_ext])).get(row.home_ext ?? '') ?? '';
              await saveStats(db, row.id, JSON.stringify(detailFromHockey((res as Raw[]) ?? [], home, at) ?? { none: true, at }));
            }
          }
        }
        for (const row of await needH2h(db, comps, cfg.priority, at, 6)) {
          if (!(await room())) break;
          const games = (await h2hFor(db, def, row.af_h, row.af_a, o)).map((g) => def.parse(g)).filter((x): x is Fx => !!x);
          await saveH2h(db, row.id, JSON.stringify(meetingsFromFx(games)));
        }
      } catch (e) {
        // Optional data stops quietly at the budget or a persistent rate limit; results are already stored.
        if (!(e instanceof QuotaError) && !/ratelimit|too many/i.test(String(e))) throw e;
      }
    }
    return { seen, written, review };
  });
}

/** Football (the original entry point, kept for the existing callers and tests). */
export const syncApiFootball = (db: Db, cfg: ResultsConfig, o: AfOptions, at = Date.now()) => syncApiSports(db, cfg, FOOTBALL, o, at);
