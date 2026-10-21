import { describe, it, expect, vi } from 'vitest';
import { testDb } from './d1';
import { classify, fromTipsport, fromApiFootball, periodsOf, penaltiesOf, score, type Raw } from '../src/lib/results/normalize';
import { upsertState, rowsBetween, rowByExt, markUnconfirmed, opsStatus, finalsSince, checkTeams } from '../src/lib/results/store';
import { syncTipsportLive, syncTipsportSchedule, syncApiFootball, pairAndApply } from '../src/lib/results/sync';
import { dueDays, applyFixture } from '../src/lib/results/afstore';
import { nameScore, detailFrom, meetingsFrom } from '../src/lib/results/afdata';
import { afGet, QuotaError, ProviderError } from '../src/lib/results/apifootball';
import { reserve, acquire, runJob } from '../src/lib/results/budget';
import { pragueDay, pragueMidnight, isDayKey } from '../src/lib/results/time';
import { resultsConfig } from '../src/lib/results/config';
import { statusLabel, group } from '../src/lib/results/status';
import { dayKey } from '../src/lib/text';

const cfg = resultsConfig({ RESULTS: {}, RESULTS_ENABLED: 'on', RESULTS_SYNC: 'on' });
const T0 = Date.UTC(2026, 9, 24, 14, 0); // Sat 24 Oct 2026 16:00 Prague

/** A Tipsport live/prematch feed item for a Chance Liga match. */
const tip = (p: Partial<Raw> = {}): Raw => ({
  id: 9001, idSuperSport: 16, nameCompetition: 'Česká Chance Liga', competitionAnnualId: 265600,
  homeParticipant: 'Slavia Praha', visitingParticipant: 'Sparta Praha', homeParticipantId: 11, visitingParticipantId: 12,
  dateStart: T0, matchType: 'LIVE', matchUrl: '/live/zapas/fotbal-slavia-sparta/9001', stream: false,
  home: '-', away: '-', statusOffer: '', time: '', ended: false, ...p,
});

describe('normalization', () => {
  it('future match has no score (null, not 0)', () => {
    const o = fromTipsport(tip({ dateStart: T0 + 3600_000, statusOffer: 'Za 60 minut' }), T0, cfg.comps)!;
    expect(o.status).toBe('scheduled');
    expect(o.sh).toBeNull();
    expect(o.sa).toBeNull();
    expect(score('-')).toBeNull();
    expect(score('0')).toBe(0);
  });
  it('live, half time, final, extra time and penalties', () => {
    expect(classify({ dateStart: T0, statusOffer: '2.pol. - 48.min (1:1, 0:1)' }, T0 + 1)).toBe('live');
    expect(classify({ dateStart: T0, statusOffer: 'Poločas (1:0)' }, T0 + 1)).toBe('ht');
    expect(classify({ dateStart: T0, statusOffer: 'Prodloužení (1:1, 0:0)' }, T0 + 1)).toBe('et');
    expect(classify({ dateStart: T0, ended: true, statusOffer: '(3:1, 0:1)' }, T0 + 1)).toBe('ft');
    expect(classify({ dateStart: T0, ended: true, statusOffer: 'po prodl. (1:1, 0:0, 1:0)' }, T0 + 1)).toBe('aet');
    expect(classify({ dateStart: T0, ended: true, statusOffer: 'pen. 4:3 (1:1, 0:0)' }, T0 + 1)).toBe('pen');
    expect(periodsOf('2.pol. - 48.min (1:1, 0:1)')).toEqual([[1, 1], [0, 1]]);
    expect(penaltiesOf('pen. 4:3 (1:1, 0:0)')).toEqual([4, 3]);
  });
  it('postponed, interrupted, cancelled and unknown states', () => {
    expect(classify({ dateStart: T0, statusOffer: 'Odloženo' }, T0)).toBe('postponed');
    expect(classify({ dateStart: T0, statusOffer: 'Přerušeno (0:0)' }, T0 + 1)).toBe('interrupted');
    expect(classify({ dateStart: T0, statusOffer: 'Zrušeno' }, T0 + 1)).toBe('cancelled');
    expect(classify({ dateStart: T0, statusOffer: 'něco nového' }, T0 + 1)).toBe('unknown');
    expect(statusLabel('unknown', 'něco nového')).toBe('Stav: něco nového');
    expect(statusLabel('unknown')).not.toMatch(/Konec/);
    expect(group('unconfirmed')).toBe('other');
  });
  it('women, youth and reserve teams are held for review in a men\'s pilot competition', () => {
    expect(fromTipsport(tip({ homeParticipant: 'Slavia Praha Ž' }), T0, cfg.comps)!.review).toBe(true);
    expect(fromTipsport(tip({ visitingParticipant: 'Sparta Praha U19' }), T0, cfg.comps)!.review).toBe(true);
    expect(fromTipsport(tip({ visitingParticipant: 'Sparta Praha B' }), T0, cfg.comps)!.review).toBe(true);
    expect(fromTipsport(tip({ homeParticipantId: undefined }), T0, cfg.comps)!.review).toBe(true);
    expect(fromTipsport(tip(), T0, cfg.comps)!.review).toBe(false);
  });
  it('ignores competitions outside the pilot', () => {
    expect(fromTipsport(tip({ nameCompetition: '1. kolumbijská liga' }), T0, cfg.comps)).toBeNull();
  });
  it('api-football fixture keeps missing values as null', () => {
    const o = fromApiFootball({ fixture: { id: 5, timestamp: T0 / 1000, status: { short: 'NS', long: 'Not Started', elapsed: null } }, league: { season: 2026, name: 'Czech Liga' }, teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } }, goals: { home: null, away: null }, score: { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, penalty: { home: null, away: null } } }, T0, 'chance-liga')!;
    expect(o.status).toBe('scheduled');
    expect(o.sh).toBeNull();
    expect(o.periods).toBeNull();
    expect(o.review).toBe(true);
    expect(fromApiFootball({ fixture: { id: 6, timestamp: 1, status: { short: 'PEN' } }, goals: { home: 1, away: 1 }, score: { penalty: { home: 5, away: 4 } }, teams: {} }, T0, 'x')!.pen_h).toBe(5);
  });
});

const rows = async (db: ReturnType<typeof testDb>) => (await db.prepare('SELECT * FROM matches ORDER BY id').all<Record<string, unknown>>()).results;

describe('store', () => {
  it('repeated import creates no duplicates', async () => {
    const db = testDb();
    for (let i = 0; i < 3; i++) await syncTipsportLive(db, [tip({ statusOffer: '1.pol. - 10.min (0:0)', home: '0', away: '0', time: "10'" })], cfg, T0 + 600_000 + i * 180_000);
    expect(await rows(db)).toHaveLength(1);
  });
  it('two matches of the same pair are two records with two URLs', async () => {
    const db = testDb();
    await syncTipsportLive(db, [tip({ id: 1, ended: true, home: '2', away: '0', statusOffer: '(1:0, 1:0)' }), tip({ id: 2, dateStart: T0 + 90 * 86_400_000, statusOffer: 'Za 10 dní' })], cfg, T0 + 7_200_000);
    const r = await rows(db);
    expect(r).toHaveLength(2);
    expect(new Set(r.map((x) => x.slug)).size).toBe(2);
    expect(r[0].sh).toBe(2);
    expect(r[1].sh).toBeNull();
  });
  it('postponed match with a new kick-off keeps its id and slug', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 86_400_000 })], cfg, T0);
    const before = (await rows(db))[0];
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 3 * 86_400_000, homeParticipant: 'SK Slavia Praha' })], cfg, T0 + 900_000);
    const after = await rows(db);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].slug).toBe(before.slug);
    expect(after[0].start_utc).toBe(T0 + 3 * 86_400_000);
    expect(after[0].home).toBe('SK Slavia Praha');
  });
  it('an older response never overwrites newer data, a final never goes back to live', async () => {
    const db = testDb();
    const live = fromTipsport(tip({ statusOffer: '2.pol. - 80.min (1:0, 0:0)', home: '1', away: '0' }), T0 + 5_000_000, cfg.comps)!;
    const fin = fromTipsport(tip({ ended: true, statusOffer: '(1:0, 1:0)', home: '2', away: '0' }), T0 + 6_000_000, cfg.comps)!;
    await upsertState(db, [fin], T0 + 6_000_000);
    await upsertState(db, [live], T0 + 6_100_000); // late delivery of the older snapshot
    const r = (await rows(db))[0];
    expect(r.status).toBe('ft');
    expect(r.sh).toBe(2);
    const newerLive = fromTipsport(tip({ statusOffer: '2.pol. - 85.min', home: '2', away: '0' }), T0 + 7_000_000, cfg.comps)!;
    await upsertState(db, [newerLive], T0 + 7_000_000);
    expect((await rows(db))[0].status).toBe('ft');
  });
  it('a corrected final result updates the score and lastmod', async () => {
    const db = testDb();
    await upsertState(db, [fromTipsport(tip({ ended: true, home: '2', away: '0' }), T0 + 6e6, cfg.comps)!], T0 + 6e6);
    await upsertState(db, [fromTipsport(tip({ ended: true, home: '2', away: '0' }), T0 + 6.2e6, cfg.comps)!], T0 + 6.2e6);
    expect((await rows(db))[0].final_at).toBe(T0 + 6e6); // unchanged result: lastmod stays
    await upsertState(db, [fromTipsport(tip({ ended: true, home: '2', away: '1' }), T0 + 7e6, cfg.comps)!], T0 + 7e6);
    const r = (await rows(db))[0];
    expect(r.sa).toBe(1);
    expect(r.final_at).toBe(T0 + 7e6);
  });
  it('keeps the last valid data on an empty feed / outage', async () => {
    const db = testDb();
    await syncTipsportLive(db, [tip({ statusOffer: '1.pol. - 20.min (1:0)', home: '1', away: '0' })], cfg, T0 + 1_200_000);
    const r = await syncTipsportLive(db, [], cfg, T0 + 1_380_000);
    expect(r.error).toMatch(/empty/);
    const row = (await rows(db))[0];
    expect(row.status).toBe('live');
    expect(row.sh).toBe(1);
    expect((await opsStatus(db, T0 + 1_400_000, 600_000)).lastError?.error).toMatch(/empty/);
  });
  it('a match gone from the feed without "ended" becomes unconfirmed, keeping the last known score', async () => {
    const db = testDb();
    await syncTipsportLive(db, [tip({ statusOffer: '2.pol. - 88.min (1:0, 0:0)', home: '1', away: '0' })], cfg, T0 + 6e6);
    await syncTipsportLive(db, [tip({ id: 77, nameCompetition: '1. kolumbijská liga' })], cfg, T0 + 6e6 + 25 * 60_000);
    const r = (await rows(db))[0];
    expect(r.status).toBe('unconfirmed');
    expect(r.sh).toBe(1);
    // …and a later "ended" from the feed still fixes it
    await syncTipsportLive(db, [tip({ ended: true, statusOffer: '(1:0, 0:1)', home: '1', away: '1' })], cfg, T0 + 6e6 + 30 * 60_000);
    expect((await rows(db))[0].status).toBe('ft');
  });
  it('missing statistics and lineups stay null (no invented zeros)', async () => {
    const db = testDb();
    await syncTipsportLive(db, [tip({ ended: true, home: '0', away: '0', statusOffer: '' })], cfg, T0 + 7e6);
    const r = (await rows(db))[0];
    expect(r.stats).toBeNull();
    expect(r.periods).toBeNull();
    expect(r.sh).toBe(0); // a real 0:0 is kept as 0
  });
  it('team id that changes kind holds the match for review and hides it', async () => {
    const db = testDb();
    await checkTeams(db, [fromTipsport(tip(), T0, cfg.comps)!], T0);
    const odd = fromTipsport(tip({ id: 5, homeParticipant: 'Slavia Praha Ž', homeParticipantId: 11 }), T0, cfg.comps)!;
    odd.review = false;
    await checkTeams(db, [odd], T0);
    expect(odd.review).toBe(true);
    await upsertState(db, [odd], T0);
    expect(await rowByExt(db, 5)).toBeNull();
  });
  it('rowsBetween respects the Prague day and the review flag', async () => {
    const db = testDb();
    const late = Date.UTC(2026, 9, 24, 22, 30); // 24 Oct 22:30 UTC = 25 Oct 00:30 Prague (CEST)
    await syncTipsportSchedule(db, [tip({ id: 1, dateStart: late }), tip({ id: 2, dateStart: late - 3600_000 })], cfg, T0);
    const [a, b] = pragueDay('2026-10-25');
    const day = await rowsBetween(db, a, b, cfg.comps, 16);
    expect(day.map((r) => r.ext_id)).toEqual(['1']);
    expect((await finalsSince(db, 0, cfg.comps))).toHaveLength(0);
  });
  it('scheduled match never seen live becomes unconfirmed long after kick-off', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 60_000 })], cfg, T0);
    expect(await markUnconfirmed(db, 'tipsport', T0 + 5 * 3600_000)).toBe(1);
  });
});

describe('Prague time', () => {
  it('DST change day 25 Oct 2026 is 25 hours long', () => {
    const [a, b] = pragueDay('2026-10-25');
    expect(a).toBe(Date.UTC(2026, 9, 24, 22));
    expect(b).toBe(Date.UTC(2026, 9, 25, 23));
    expect(b - a).toBe(25 * 3600_000);
  });
  it('spring day is 23 hours and winter midnight is UTC+1', () => {
    const [a, b] = pragueDay('2027-03-28');
    expect(b - a).toBe(23 * 3600_000);
    expect(pragueMidnight('2026-12-01')).toBe(Date.UTC(2026, 10, 30, 23));
    expect(dayKey(Date.UTC(2026, 9, 24, 22, 30))).toBe('2026-10-25');
    expect(isDayKey('2026-10-25')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
  });
});

/** Fake api-football: responses are consumed in order. */
const fakeFetch = (...answers: (Response | Error)[]) => {
  const f = vi.fn(async () => {
    const a = answers.shift();
    if (!a || a instanceof Error) throw a ?? new Error('no more answers');
    return a;
  });
  return f as unknown as typeof fetch & { mock: { calls: unknown[][] } };
};
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const opts = (f: typeof fetch, cap = 5) => ({ key: 'SECRET-KEY-123', cap, floor: 20, fetch: f, sleep: async () => {}, now: () => T0 });

describe('api-football client', () => {
  it('stops at the daily budget before calling the provider', async () => {
    const db = testDb();
    const f = fakeFetch(json({ errors: [], response: [] }), json({ errors: [], response: [] }));
    await afGet(db, '/status', {}, opts(f, 2));
    await afGet(db, '/status', {}, opts(f, 2));
    await expect(afGet(db, '/status', {}, opts(f, 2))).rejects.toBeInstanceOf(QuotaError);
    expect(f.mock.calls).toHaveLength(2);
  });
  it('respects the provider-reported remaining quota of a shared key', async () => {
    const db = testDb();
    const f = fakeFetch(json({ errors: [], response: [] }, 200, { 'x-ratelimit-requests-remaining': '20' }));
    await afGet(db, '/status', {}, opts(f, 80));
    await expect(afGet(db, '/status', {}, opts(f, 80))).rejects.toBeInstanceOf(QuotaError);
  });
  it('retries a rate limit and an outage, every attempt is counted', async () => {
    const db = testDb();
    const f = fakeFetch(json({}, 429), new Error('down'), json({ errors: [], response: [1] }));
    const j = await afGet(db, '/status', {}, opts(f, 10));
    expect(j.response).toEqual([1]);
    const u = await db.prepare('SELECT used FROM api_usage').first<{ used: number }>();
    expect(u?.used).toBe(3);
  });
  it('gives up after repeated outages', async () => {
    const db = testDb();
    await expect(afGet(db, '/status', {}, opts(fakeFetch(new Error('a'), new Error('b'), new Error('c')), 10))).rejects.toBeInstanceOf(ProviderError);
  });
  it('treats errors inside an HTTP 200 as a failure and never leaks the key', async () => {
    const db = testDb();
    const f = fakeFetch(json({ errors: { plan: 'Free plans do not have access to this season, try from 2022 to 2024.' }, response: [] }));
    const e = await afGet(db, '/fixtures', { league: '39', season: '2026' }, opts(f, 10)).catch((x) => x);
    expect(e).toBeInstanceOf(ProviderError);
    expect(String(e.message)).toMatch(/Free plans/);
    expect(String(e.message)).not.toContain('SECRET-KEY-123');
    const url = String(f.mock.calls[0][0]);
    expect(url).not.toContain('SECRET-KEY-123');
  });
  it('sync records the provider error and keeps stored data', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ dateStart: T0 - 3 * 3600_000 })], cfg, T0 - 4 * 3600_000);
    const f = fakeFetch(json({ errors: { plan: 'Free plans do not have access to this date' } }));
    const r = await syncApiFootball(db, { ...cfg, apiFootball: true }, opts(f, 10), T0);
    expect(r.error).toMatch(/Free plans/);
    expect(await rows(db)).toHaveLength(1);
    const s = await opsStatus(db, T0, 600_000);
    expect(s.usage[0].used).toBe(1);
    expect(JSON.stringify(s)).not.toContain('SECRET-KEY-123');
  });
});

describe('concurrency', () => {
  it('reservation is atomic: N parallel reservations never exceed the cap', async () => {
    const db = testDb();
    const ok = await Promise.all(Array.from({ length: 20 }, () => reserve(db, 'apifootball', '2026-10-24', 7, 0)));
    expect(ok.filter(Boolean)).toHaveLength(7);
  });
  it('a second run of the same job is skipped while the first holds the lock', async () => {
    const db = testDb();
    expect(await acquire(db, 'tipsport-live', 'a', T0, 60_000)).toBe(true);
    const r = await syncTipsportLive(db, [tip()], cfg, T0 + 1000);
    expect(r.skipped).toBe(true);
    // an expired lease is taken over
    expect((await syncTipsportLive(db, [tip()], cfg, T0 + 61_000)).skipped).toBeUndefined();
  });
  it('runJob releases its lock after an error', async () => {
    const db = testDb();
    await runJob(db, 'x', T0, 60_000, async () => { throw new Error('boom'); });
    expect(await acquire(db, 'x', 'b', T0 + 1, 60_000)).toBe(true);
  });
});

describe('late kick-off and match window', () => {
  it('a bare kick-off time after the scheduled start is a late start, not a result', () => {
    expect(classify({ dateStart: T0, statusOffer: '21:00' }, T0 + 60_000)).toBe('scheduled');
    expect(classify({ dateStart: T0, statusOffer: '2.pol. - 45+2.min (1:0, 0:0)' }, T0 + 1)).toBe('live');
    expect(classify({ dateStart: T0, statusOffer: 'Přestávka (1:0)' }, T0 + 1)).toBe('ht');
    expect(classify({ dateStart: T0, statusOffer: 'Za okamžik' }, T0 + 1)).toBe('scheduled');
    // real texts sampled from the feed 21. 10. 2026
    expect(classify({ dateStart: T0, statusOffer: 'Konec základní hrací doby - 90.min (1:0, 0:1)' }, T0 + 1)).toBe('bt');
    expect(classify({ dateStart: T0, statusOffer: 'Ukončené prodloužení - 120.min (1:0, 0:1, 0:0)' }, T0 + 1)).toBe('bt');
    expect(classify({ dateStart: T0, statusOffer: 'Penalty (1:0, 0:1, 0:0)' }, T0 + 1)).toBe('pens');
    expect(classify({ dateStart: T0, ended: true, statusOffer: '(1:0, 0:1)' }, T0 + 1)).toBe('ft');
  });
});

/** api-football fixture as /fixtures?date= returns it. */
const afx = (p: { id?: number; league?: number; ts?: number; home?: [number, string]; away?: [number, string]; short?: string; goals?: [number | null, number | null]; ht?: [number, number]; pen?: [number, number]; et?: [number, number] } = {}): Raw => ({
  fixture: { id: p.id ?? 501, timestamp: (p.ts ?? T0) / 1000, status: { short: p.short ?? 'NS', long: '', elapsed: null } },
  league: { id: p.league ?? 345, name: 'Czech Liga', season: 2026 },
  teams: { home: { id: (p.home ?? [560, 'Slavia Praha'])[0], name: (p.home ?? [560, 'Slavia Praha'])[1] }, away: { id: (p.away ?? [561, 'Sparta Praha'])[0], name: (p.away ?? [561, 'Sparta Praha'])[1] } },
  goals: { home: p.goals?.[0] ?? null, away: p.goals?.[1] ?? null },
  score: { halftime: { home: p.ht?.[0] ?? null, away: p.ht?.[1] ?? null }, fulltime: { home: p.goals?.[0] ?? null, away: p.goals?.[1] ?? null }, extratime: { home: p.et?.[0] ?? null, away: p.et?.[1] ?? null }, penalty: { home: p.pen?.[0] ?? null, away: p.pen?.[1] ?? null } },
});

describe('api-football as second source', () => {
  it('name similarity', () => {
    expect(nameScore('Viktoria Plzeň', 'Plzen')).toBe(1);
    expect(nameScore('Nottingham', 'Nottingham Forest')).toBe(1);
    expect(nameScore('Hull', 'Hull City')).toBe(1);
    expect(nameScore('Manchester United', 'Manchester City')).toBe(0.5);
    expect(nameScore('Bohemians 1905', 'Bohemians 1905')).toBe(1);
  });
  it('pairs by competition + kick-off + both names, learns team links, confirms a missed final', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip()], cfg, T0 - 86_400_000);
    // Tipsport saw the match live, then lost it: unconfirmed with last known score
    await syncTipsportLive(db, [tip({ statusOffer: '2.pol. - 88.min (1:0, 0:0)', home: '1', away: '0' })], cfg, T0 + 6e6);
    await markUnconfirmed(db, 'tipsport', T0 + 8e6);
    const r = await pairAndApply(db, [afx({ short: 'FT', goals: [1, 1], ht: [1, 0] })], cfg.comps, T0 + 9e6);
    expect(r.applied).toBe(1);
    const row = (await rows(db))[0];
    expect(row).toMatchObject({ status: 'ft', sh: 1, sa: 1, result_src: 'apifootball', af_id: '501', af_status: 'FT' });
    expect(JSON.parse(String(row.periods))).toEqual([[1, 0], [0, 1]]);
    const links = (await db.prepare('SELECT tip_id, af_id FROM team_link ORDER BY tip_id').all()).results;
    expect(links).toEqual([{ tip_id: '11', af_id: '560' }, { tip_id: '12', af_id: '561' }]);
  });
  it('one exact and one half-matching name pair in a busy slot (Sporting Lisboa ~ Sporting CP)', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ id: 1, nameCompetition: 'Liga mistrů', homeParticipant: 'Sporting Lisboa', visitingParticipant: 'LASK Linz', homeParticipantId: 51, visitingParticipantId: 52 }), tip({ id: 2, nameCompetition: 'Liga mistrů', homeParticipant: 'Real Madrid', visitingParticipant: 'RB Leipzig', homeParticipantId: 53, visitingParticipantId: 54 })], cfg, T0 - 86_400_000);
    await pairAndApply(db, [afx({ id: 7, league: 2, home: [228, 'Sporting CP'], away: [1026, 'LASK'] }), afx({ id: 8, league: 2, home: [541, 'Real Madrid'], away: [173, 'RB Leipzig'] })], cfg.comps, T0);
    expect((await rows(db)).map((r) => r.af_id)).toEqual(['7', '8']);
  });
  it('ambiguous slot (two candidates, names do not decide) is not paired', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ id: 1, homeParticipant: 'Manchester United', visitingParticipant: 'Leeds', homeParticipantId: 21, visitingParticipantId: 22, nameCompetition: '1. anglická liga' }), tip({ id: 2, homeParticipant: 'Manchester City', visitingParticipant: 'Leeds', homeParticipantId: 23, visitingParticipantId: 22, nameCompetition: '1. anglická liga' })], cfg, T0 - 86_400_000);
    const r = await pairAndApply(db, [afx({ league: 39, home: [33, 'Manchester'], away: [63, 'Leeds'] })], cfg.comps, T0);
    expect(r.ambiguous).toBe(1);
    expect((await rows(db)).every((x) => x.af_id === null)).toBe(true);
  });
  it('a stored team link that contradicts the fixture blocks the pairing', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip()], cfg, T0 - 86_400_000);
    await db.prepare('INSERT INTO team_link VALUES (?, ?, ?, ?, ?)').bind('11', '999', 'Slavia Praha', 'Slavia B', T0).run();
    await pairAndApply(db, [afx()], cfg.comps, T0);
    expect((await rows(db))[0].af_id).toBeNull();
  });
  it('a different final score is flagged, Tipsport result kept; AET upgrades our "ft"', async () => {
    const db = testDb();
    await syncTipsportLive(db, [tip({ ended: true, home: '2', away: '0' })], cfg, T0 + 6e6);
    const row = (await rowsBetween(db, 0, Infinity, cfg.comps))[0];
    await applyFixture(db, row, afx({ short: 'FT', goals: [2, 1] }), T0 + 7e6);
    let r = (await rows(db))[0];
    expect(r).toMatchObject({ sh: 2, sa: 0, mismatch: 1, result_src: null });
    await applyFixture(db, { ...row, sh: 2, sa: 0 }, afx({ short: 'AET', goals: [2, 0], ht: [0, 0], et: [2, 0] }), T0 + 8e6);
    r = (await rows(db))[0];
    expect(r).toMatchObject({ status: 'aet', mismatch: 0 });
  });
  it('postponed at api-football marks our scheduled match postponed; live states are ignored', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 3600_000 })], cfg, T0);
    const row = (await rowsBetween(db, 0, Infinity, cfg.comps))[0];
    await applyFixture(db, row, afx({ short: '1H', goals: [1, 0] }), T0);
    expect((await rows(db))[0]).toMatchObject({ status: 'scheduled', sh: null });
    await applyFixture(db, row, afx({ short: 'PST' }), T0);
    expect((await rows(db))[0].status).toBe('postponed');
  });
  it('due days: pairing once per 6 h, results after ~100 min, only inside the Free date window', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 3600_000 }), tip({ id: 2, dateStart: T0 + 5 * 86_400_000 })], cfg, T0);
    expect(await dueDays(db, cfg.comps, T0)).toEqual(['2026-10-24']);
    await db.prepare("INSERT INTO af_fetch VALUES ('2026-10-24', ?)").bind(T0).run();
    expect(await dueDays(db, cfg.comps, T0 + 3600_000)).toEqual([]);
    await db.prepare("UPDATE matches SET af_id = '1'").run();
    expect(await dueDays(db, cfg.comps, T0 + 3600_000 + 101 * 60_000)).toEqual(['2026-10-24']);
  });
  it('full run: day list, details and H2H within budget; details are stored compactly', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip()], cfg, T0 - 86_400_000);
    await db.prepare('UPDATE matches SET start_utc = ?').bind(T0 - 4 * 3600_000).run();
    const detail = { ...afx({ id: 501, short: 'FT', goals: [2, 1], ht: [1, 1], ts: T0 - 4 * 3600_000 }), events: [{ time: { elapsed: 45, extra: 2 }, team: { id: 560 }, player: { name: 'Chorý' }, assist: { name: null }, type: 'Goal', detail: 'Normal Goal' }, { time: { elapsed: 60 }, team: { id: 561 }, player: { name: 'Haraslín' }, type: 'Card', detail: 'Red Card' }, { time: { elapsed: 70 }, team: { id: 561 }, player: { name: 'X' }, type: 'subst', detail: 'Substitution 1' }], statistics: [{ team: { id: 560 }, statistics: [{ type: 'Ball Possession', value: '55%' }, { type: 'Total Shots', value: 12 }] }, { team: { id: 561 }, statistics: [{ type: 'Ball Possession', value: '45%' }, { type: 'Total Shots', value: null }] }], lineups: [{ team: { id: 560 }, formation: '3-4-3', coach: { name: 'Trpišovský' }, startXI: [{ player: { name: 'Staněk' } }] }] };
    const f = fakeFetch(
      json({ errors: [], response: [afx({ id: 501, short: 'FT', goals: [2, 1], ht: [1, 1], ts: T0 - 4 * 3600_000 })] }),
      json({ errors: [], response: [detail] }),
    );
    const r = await syncApiFootball(db, { ...cfg, apiFootball: true, stats: true }, opts(f, 80), T0);
    expect(r.error).toBeUndefined();
    const row = (await rows(db))[0];
    expect(row).toMatchObject({ status: 'ft', sh: 2, sa: 1 });
    const st = JSON.parse(String(row.stats));
    expect(st.events).toEqual([{ min: "45+2'", side: 'h', kind: 'goal', player: 'Chorý', assist: null }, { min: "60'", side: 'a', kind: 'red', player: 'Haraslín', assist: null }]);
    expect(st.stats).toEqual([{ key: 'Ball Possession', h: '55%', a: '45%' }, { key: 'Total Shots', h: '12', a: null }]);
    expect(st.lineups[0]).toMatchObject({ side: 'h', formation: '3-4-3', xi: ['Staněk'] });
    expect(f.mock.calls).toHaveLength(2); // H2H not due: the match is in the past
  });
  it('optional data stops when the budget runs low, results still come first', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [tip()], cfg, T0 - 86_400_000);
    await db.prepare('UPDATE matches SET start_utc = ?').bind(T0 - 3 * 3600_000).run();
    const f = fakeFetch(json({ errors: [], response: [afx({ id: 501, short: 'FT', goals: [0, 0], ts: T0 - 3 * 3600_000 })] }, 200, { 'x-ratelimit-requests-remaining': '20' }));
    await syncApiFootball(db, { ...cfg, apiFootball: true, stats: true }, opts(f, 80), T0);
    expect((await rows(db))[0]).toMatchObject({ status: 'ft', sh: 0, sa: 0, stats: null });
    expect(f.mock.calls).toHaveLength(1);
  });
  it('detail without data stays null-safe and meetings keep only finished games', () => {
    expect(detailFrom({ teams: { home: { id: 1 } }, events: [], statistics: [], lineups: [] }, T0)).toBeNull();
    const m = meetingsFrom([{ fixture: { timestamp: 1, status: { short: 'FT' } }, goals: { home: 1, away: 0 }, teams: { home: { name: 'A' }, away: { name: 'B' } }, league: { name: 'L' } }, { fixture: { timestamp: 2, status: { short: 'NS' } }, goals: { home: null, away: null }, teams: {}, league: {} }]);
    expect(m).toHaveLength(1);
  });
  it('H2H uses linked team ids up to 7 days ahead, priority competitions first', async () => {
    const db = testDb();
    await syncTipsportSchedule(db, [
      tip({ id: 1, nameCompetition: '1. španělská liga', homeParticipantId: 31, visitingParticipantId: 32, homeParticipant: 'Real Madrid', visitingParticipant: 'Barcelona', dateStart: T0 + 2 * 86_400_000 }),
      tip({ id: 2, dateStart: T0 + 5 * 86_400_000 }),
      tip({ id: 3, homeParticipantId: 41, visitingParticipantId: 42, homeParticipant: 'Teplice', visitingParticipant: 'Zlín', dateStart: T0 + 9 * 86_400_000 }),
    ], cfg, T0);
    for (const [t, a] of [['11', '560'], ['12', '561'], ['31', '541'], ['32', '529'], ['41', '1'], ['42', '2']]) await db.prepare('INSERT INTO team_link VALUES (?, ?, ?, ?, ?)').bind(t, a, 'x', 'y', T0).run();
    const { needH2h } = await import('../src/lib/results/afstore');
    const list = await needH2h(db, cfg.comps, cfg.priority, T0, 8);
    expect(list.map((r) => [r.ext_id, r.af_h, r.af_a])).toEqual([['2', '560', '561'], ['1', '541', '529']]); // Chance Liga first, 9 days ahead left out
  });
});
