import type { Db } from './db';
import { reserve, reportRemaining } from './budget';
import { utcDay } from './time';

/**
 * api-football v3 client. Server-side only: the key comes from the Worker secret, is sent as a header and never
 * appears in a URL, log line or error message. Every attempt (including retries) is reserved in the quota ledger
 * first. Only fixed endpoints are exposed — there is no generic proxy.
 */
const BASE = 'https://v3.football.api-sports.io';
const PROVIDER = 'apifootball';

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
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** True when api-football reported errors inside a 200 response (`errors` is [] or {} when all is well). */
export const hasErrors = (e: unknown) => (Array.isArray(e) ? e.length > 0 : !!e && typeof e === 'object' && Object.keys(e).length > 0);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function afGet(db: Db, path: '/status' | '/leagues' | '/fixtures' | '/standings', params: Record<string, string>, o: AfOptions): Promise<any> {
  const f = o.fetch ?? fetch;
  const sleep = o.sleep ?? wait;
  const now = o.now ?? Date.now;
  const attempts = o.attempts ?? 3;
  const url = `${BASE}${path}${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ''}`;
  let last = 'no attempt';
  for (let i = 0; i < attempts; i++) {
    const day = utcDay(now());
    if (!(await reserve(db, PROVIDER, day, o.cap, o.floor))) throw new QuotaError(`daily budget reached (${o.cap}) or provider quota at reserve`);
    let res: Response;
    try {
      res = await f(url, { headers: { 'x-apisports-key': o.key, Accept: 'application/json' }, signal: AbortSignal.timeout(o.timeoutMs ?? 10_000) });
    } catch (e) {
      last = `network: ${e instanceof Error ? e.name : 'error'}`;
      if (i < attempts - 1) await sleep(2_000 * (i + 1));
      continue;
    }
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
      if (/ratelimit|too many/i.test(text) && i < attempts - 1) { last = text; await sleep(6_000 * (i + 1)); continue; }
      throw new ProviderError(text);
    }
    return j;
  }
  throw new ProviderError(`gave up after ${attempts} attempts: ${last}`);
}

/** Our competition slug → api-football league id (checked against /leagues). */
export const AF_LEAGUE: Record<string, number> = { 'chance-liga': 345, 'premier-league': 39 };

/** The current season as the provider defines it — not guessed from the calendar year. */
export async function currentSeason(db: Db, league: number, o: AfOptions): Promise<number | null> {
  const j = await afGet(db, '/leagues', { id: String(league), current: 'true' }, o);
  const seasons: { year: number; current: boolean }[] = j.response?.[0]?.seasons ?? [];
  return seasons.find((s) => s.current)?.year ?? null;
}

/** All fixtures of one league on one Prague day: one request covers the whole round (no per-match calls). */
export async function fixturesOn(db: Db, league: number, season: number, date: string, o: AfOptions) {
  const j = await afGet(db, '/fixtures', { league: String(league), season: String(season), date, timezone: 'Europe/Prague' }, o);
  return (j.response ?? []) as Record<string, unknown>[];
}
