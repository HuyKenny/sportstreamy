import type { Db } from './db';
import { reserve, reportRemaining, refund } from './budget';
import { utcDay } from './time';
import { FOOTBALL, type SportApi } from './sports-api';

/**
 * api-football v3 client. Server-side only: the key comes from the Worker secret, is sent as a header and never
 * appears in a URL, log line or error message. Every attempt (including retries) is reserved in the quota ledger
 * first. Only fixed endpoints are exposed — there is no generic proxy.
 */
const FOOTBALL_HOST = 'v3.football.api-sports.io';

export class QuotaError extends Error {}
export class ProviderError extends Error {}

export interface AfOptions {
  key: string;
  cap: number;
  floor: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  attempts?: number;
  /** Minimum spacing between requests (default MIN_GAP_MS; tests pass 0). */
  gapMs?: number;
  /** api-sports host and ledger key of the sport (default football). Each host has its own quota. */
  host?: string;
  provider?: string;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Per-minute limit. The plan says 10/min, but in production (21. 10.) it refused the 5th–6th request within about
 * a minute even at 10 s spacing while still reporting 6 left. So: 10 s between requests, and a full minute's pause
 * once the reported per-minute allowance drops to 5. Refused requests are not counted by the provider (refunded).
 */
export const MIN_GAP_MS = 10_000;
/** Per host: when it was last called and how many requests the provider said are left in the current minute. */
const lastCall = new Map<string, number>();
const minuteLeftOf = new Map<string, number | null>();
const PATHS = new Set(['/status', '/leagues', '/fixtures', '/fixtures/headtohead', '/games', '/games/h2h', '/games/events']);

/** True when api-football reported errors inside a 200 response (`errors` is [] or {} when all is well). */
export const hasErrors = (e: unknown) => (Array.isArray(e) ? e.length > 0 : !!e && typeof e === 'object' && Object.keys(e).length > 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function afGet(db: Db, path: string, params: Record<string, string>, o: AfOptions): Promise<any> {
  if (!PATHS.has(path)) throw new ProviderError(`endpoint not allowed: ${path}`);
  const host = o.host ?? FOOTBALL_HOST;
  const PROVIDER = o.provider ?? 'apifootball';
  let minuteLeft = minuteLeftOf.get(host) ?? null;
  const f = o.fetch ?? fetch;
  const sleep = o.sleep ?? wait;
  const now = o.now ?? Date.now;
  const attempts = o.attempts ?? 3;
  const url = `https://${host}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`;
  let last = 'no attempt';
  for (let i = 0; i < attempts; i++) {
    const day = utcDay(now());
    if (!(await reserve(db, PROVIDER, day, o.cap, o.floor))) throw new QuotaError(`daily budget reached (${o.cap}) or provider quota at reserve`);
    const pause = minuteLeft !== null && minuteLeft <= 5 ? 61_000 : (o.gapMs ?? MIN_GAP_MS) - (Date.now() - (lastCall.get(host) ?? 0));
    if (pause > 0 && o.gapMs !== 0) await sleep(pause);
    if (pause > 0 && o.gapMs !== 0 && minuteLeft !== null && minuteLeft <= 5) { minuteLeft = null; minuteLeftOf.set(host, null); }
    lastCall.set(host, Date.now());
    let res: Response;
    try {
      res = await f(url, { headers: { 'x-apisports-key': o.key, Accept: 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) });
    } catch (e) {
      last = `network: ${e instanceof Error ? e.name : 'error'}`;
      if (i < attempts - 1) await sleep(2_000 * (i + 1));
      continue;
    }
    // One line per request for the Workers log (no key, no query values beyond the path).
    console.log(PROVIDER, path, res.status, `minute-left=${res.headers.get('x-ratelimit-remaining')}`, `day-left=${res.headers.get('x-ratelimit-requests-remaining')}`);
    const ml = res.headers.get('x-ratelimit-remaining');
    minuteLeft = ml !== null && Number.isFinite(Number(ml)) ? Number(ml) : minuteLeft;
    minuteLeftOf.set(host, minuteLeft);
    const rem = Number(res.headers.get('x-ratelimit-requests-remaining'));
    if (res.headers.has('x-ratelimit-requests-remaining') && Number.isFinite(rem)) await reportRemaining(db, PROVIDER, day, rem);
    if (res.status === 429 || res.status >= 500) {
      last = `HTTP ${res.status}`;
      // Per-minute limit: wait out the window (Retry-After when given), then try again.
      const ra = Number(res.headers.get('retry-after'));
      if (i < attempts - 1) await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 6_000 * (i + 1));
      continue;
    }
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`);
    const j = (await res.json().catch(() => null)) as { errors?: unknown; response?: unknown } | null;
    if (!j || typeof j !== 'object') throw new ProviderError('invalid JSON');
    if (hasErrors(j.errors)) {
      const text = JSON.stringify(j.errors).slice(0, 240);
      // Per-minute limit hit anyway: not counted by the provider, so not by us either; wait out the minute once.
      if (/ratelimit|too many/i.test(text)) {
        await refund(db, PROVIDER, day);
        minuteLeft = null;
        minuteLeftOf.set(host, null);
        if (i < attempts - 1) { last = text; await sleep(61_000); continue; }
      }
      throw new ProviderError(text);
    }
    return j;
  }
  throw new ProviderError(`gave up after ${attempts} attempts: ${last}`);
}

export const AF_LEAGUE: Record<string, number> = FOOTBALL.leagues;

const forSport = (def: SportApi, o: AfOptions): AfOptions => ({ ...o, host: def.host, provider: def.provider });

/**
 * All games of one Prague day in one request (no league/season filter — on the Free plan the season filter
 * is limited to 2022–2024, the date query is not, but only for yesterday…tomorrow).
 */
export async function listOnDate(db: Db, def: SportApi, date: string, o: AfOptions) {
  const j = await afGet(db, def.list, { date, timezone: 'Europe/Prague' }, forSport(def, o));
  return (j.response ?? []) as Record<string, unknown>[];
}

/** Football: one fixture with events, lineups, statistics (`ids` is not on Free). Hockey: the game's events. */
export async function detailFor(db: Db, def: SportApi, id: string, o: AfOptions) {
  if (!def.detail) return null;
  const j = await afGet(db, def.detail.path, { [def.detail.param]: id }, forSport(def, o));
  const r = (j.response ?? []) as Record<string, unknown>[];
  return def.detail.path === '/fixtures' ? r[0] ?? null : r;
}

export async function h2hFor(db: Db, def: SportApi, a: string, b: string, o: AfOptions) {
  const j = await afGet(db, def.h2h.path, { [def.h2h.param]: `${a}-${b}` }, forSport(def, o));
  return (j.response ?? []) as Record<string, unknown>[];
}

/** Football wrappers (kept for the existing call sites and tests). */
export const fixturesOnDate = (db: Db, date: string, o: AfOptions) => listOnDate(db, FOOTBALL, date, o);
export const fixtureDetail = (db: Db, id: string, o: AfOptions) => detailFor(db, FOOTBALL, id, o) as Promise<Record<string, unknown> | null>;
export const headToHead = (db: Db, a: string, b: string, o: AfOptions) => h2hFor(db, FOOTBALL, a, b, o);
