import type { Match } from './types';
import { SKIP_SPORT_IDS } from './sports';

const UA = 'Mozilla/5.0 (compatible; SportStreamy/2.0; +https://sportstreamy.cz)';

interface Session { host: string; token: string; cookie: string }

/** Tipsport and Chance share the platform: POST token → access_token + JSESSIONID; both are needed on every call. */
export async function login(host: string, id: string, secret: string): Promise<Session> {
  const res = await fetch(`https://${host}/rest/external/v2/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`${host} oauth ${res.status}`);
  const j = (await res.json()) as { access_token?: string };
  const cookie = /JSESSIONID=[^;]+/.exec(res.headers.get('set-cookie') ?? '')?.[0];
  if (!j.access_token || !cookie) throw new Error(`${host} oauth: no token/session`);
  return { host, token: j.access_token, cookie };
}

async function get<T>(s: Session, path: string): Promise<T> {
  const res = await fetch(`https://${s.host}${path}`, {
    headers: { Authorization: `Bearer ${s.token}`, Cookie: s.cookie, 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${s.host}${path.split('?')[0]} ${res.status}`);
  return (await res.json()) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);

// No stream=true filter: top competitions without video (Chance Liga, Premier League…) are kept by keep() in refresh.ts.
export const liveMatches = (s: Session) => get<{ matches: Raw[] }>(s, '/rest/external/offer/v2/live/matches').then((r) => r.matches ?? []);
export const upcomingMatches = (s: Session, days = 7) => {
  const from = Date.now() - 3 * 3600_000;
  return get<{ matches: Raw[] }>(s, `/rest/external/offer/v1/matches?fromDate=${iso(from)}&toDate=${iso(from + days * 86_400_000)}`).then((r) => r.matches ?? []);
};

/** 1/x/2 odds from the main market, matched by opp type (array order is not 1,x,2). */
export function odds(raw: Raw): [number, number | null, number] | undefined {
  const opps: Raw[] = raw.mainEvent?.opps ?? [];
  const by = (t: string) => opps.find((o) => String(o.type).toLowerCase() === t)?.odd;
  const one = by('1');
  const two = by('2');
  if (typeof one !== 'number' || typeof two !== 'number') return undefined;
  const x = by('x');
  return [one, typeof x === 'number' ? x : null, two];
}

export function toMatch(raw: Raw): Match | null {
  if (!raw?.id || SKIP_SPORT_IDS.has(raw.idSuperSport) || raw.ended) return null;
  let h = String(raw.homeParticipant ?? '').trim();
  const a = String(raw.visitingParticipant ?? '').trim();
  if (!h && !a) h = String(raw.nameFull ?? raw.name ?? '').trim(); // outright / single entity: do not fake "A vs B"
  if (!h) return null;
  // Tipsport marks women's teams with a trailing " Ž"; as a bare capital it reads like a typo.
  const fix = (s: string) => s.replace(/\sŽ$/, ' (ž)');
  h = fix(h);
  const st = Number(raw.dateStart);
  if (!st) return null;
  const m: Match = {
    id: raw.id,
    h,
    a: fix(a),
    sp: raw.idSuperSport ?? 0,
    lg: String(raw.nameCompetition ?? ''),
    lid: raw.idCompetition ?? 0,
    st,
    stream: !!raw.stream,
    path: String(raw.matchUrl ?? ''),
    live: String(raw.matchType ?? '').toUpperCase().includes('LIVE'),
  };
  if (m.live) {
    if (raw.home !== undefined && raw.away !== undefined && raw.home !== '' && raw.away !== '') m.sc = `${raw.home}:${raw.away}`;
    if (raw.statusOffer) m.ti = String(raw.statusOffer);
  }
  const t = odds(raw);
  if (t) m.o = { t };
  return m;
}
