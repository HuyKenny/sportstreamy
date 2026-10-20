import { describe, it, expect, vi } from 'vitest';
import { testDb } from './d1';
import { classify, fromTipsport, fromApiFootball, periodsOf, penaltiesOf, score, type Raw } from '../src/lib/results/normalize';
import { upsertState, rowsBetween, rowByExt, markUnconfirmed, opsStatus, finalsSince, checkTeams } from '../src/lib/results/store';
import { syncTipsportLive, syncTipsportSchedule, syncApiFootball } from '../src/lib/results/sync';
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
    await syncTipsportLive(db, [tip({ ended: true, home: '1', away: '0' })], cfg, T0);
    const f = fakeFetch(json({ errors: [], response: [{ seasons: [{ year: 2026, current: true }] }] }), json({ errors: { plan: 'Free plans do not have access to this season' } }));
    const r = await syncApiFootball(db, { ...cfg, comps: ['premier-league'] }, opts(f, 10), T0);
    expect(r.error).toMatch(/Free plans/);
    expect((await rows(db))).toHaveLength(1);
    const s = await opsStatus(db, T0, 600_000);
    expect(s.usage[0].used).toBe(2);
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
  });
  it('the per-minute pass only runs around pilot matches', async () => {
    const { inMatchWindow } = await import('../src/lib/results/store');
    const db = testDb();
    expect(await inMatchWindow(db, T0)).toBe(false);
    await syncTipsportSchedule(db, [tip({ dateStart: T0 + 5 * 60_000 })], cfg, T0);
    expect(await inMatchWindow(db, T0)).toBe(true);
    expect(await inMatchWindow(db, T0 - 3600_000)).toBe(false);
  });
});
