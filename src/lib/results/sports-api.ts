import type { Raw } from './normalize';
import type { Status } from './status';
import { AF_STATUS } from './normalize';

/**
 * api-sports, one definition per sport. Every sport is a separate host with its own daily quota (Free: 100/day each,
 * checked 22. 10. 2026), so adding a sport never eats into football's budget. Each item is reduced to `Fx`, the one
 * shape pairing and result handling work with.
 */
export interface Fx {
  id: string;
  ts: number; // kick-off, epoch ms
  league: number;
  leagueName: string;
  short: string; // provider status code
  status?: Status; // undefined = a code we do not act on
  home: { id: string; name: string };
  away: { id: string; name: string };
  sh: number | null;
  sa: number | null;
  periods: [number, number][] | null; // halves / periods / quarters / sets, then overtime
  pen: [number, number] | null; // penalties / shoot-out
}

export interface SportApi {
  slug: string; // our sport slug (sports.ts)
  sport: number; // Tipsport idSuperSport
  provider: string; // api_usage / api_fetch key
  host: string;
  list: '/fixtures' | '/games';
  h2h: { path: '/fixtures/headtohead' | '/games/h2h' | '/games'; param: 'h2h' };
  /** Optional per-match details: football fixture (events, stats, lineups), hockey events. */
  detail?: { path: '/fixtures' | '/games/events'; param: 'id' | 'game' };
  /** Our competition slug → provider league id (verified with /leagues on 21.–22. 10. 2026). */
  leagues: Record<string, number>;
  /** Typical duration: the day list is re-checked for a result only after this many minutes. */
  durationMin: number;
  parse(raw: Raw): Fx | null;
}

/** Codes after which nothing about the result changes any more (all sports). */
export const DONE = ['FT', 'AET', 'PEN', 'PST', 'CANC', 'ABD', 'AWD', 'WO', 'AOT', 'AP', 'POST', 'AW'];

const V1_STATUS: Record<string, Status> = {
  NS: 'scheduled', TBD: 'scheduled',
  P1: 'live', P2: 'live', P3: 'live', Q1: 'live', Q2: 'live', Q3: 'live', Q4: 'live',
  S1: 'live', S2: 'live', S3: 'live', S4: 'live', S5: 'live', '1H': 'live', '2H': 'live', LIVE: 'live',
  HT: 'ht', BT: 'bt', OT: 'et', ET: 'et', PT: 'pens',
  FT: 'ft', AOT: 'aet', AET: 'aet', AP: 'pen',
  POST: 'postponed', CANC: 'cancelled', ABD: 'cancelled', INTR: 'interrupted', SUSP: 'interrupted',
};

const n = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const pairOf = (h: unknown, a: unknown): [number, number] | null => (n(h) != null && n(a) != null ? [n(h)!, n(a)!] : null);
/** Hockey writes periods as "3-1". */
const dashed = (s: unknown): [number, number] | null => {
  const m = /^(\d+)-(\d+)$/.exec(String(s ?? ''));
  return m ? [Number(m[1]), Number(m[2])] : null;
};
const teams = (raw: Raw) => ({
  home: { id: String(raw.teams?.home?.id ?? ''), name: String(raw.teams?.home?.name ?? '') },
  away: { id: String(raw.teams?.away?.id ?? ''), name: String(raw.teams?.away?.name ?? '') },
});

function football(raw: Raw): Fx | null {
  const f = raw?.fixture;
  if (!f?.id || !f.timestamp) return null;
  const sc = raw.score ?? {};
  const both = (x: Raw | undefined) => x && x.home != null && x.away != null;
  const periods: [number, number][] = [];
  if (both(sc.halftime) && both(sc.fulltime)) {
    periods.push([sc.halftime.home, sc.halftime.away], [sc.fulltime.home - sc.halftime.home, sc.fulltime.away - sc.halftime.away]);
    if (both(sc.extratime)) periods.push([sc.extratime.home, sc.extratime.away]);
  }
  const short = String(f.status?.short ?? '');
  return {
    id: String(f.id), ts: Number(f.timestamp) * 1000, league: Number(raw.league?.id), leagueName: String(raw.league?.name ?? ''),
    short, status: AF_STATUS[short], ...teams(raw),
    sh: n(raw.goals?.home), sa: n(raw.goals?.away),
    periods: periods.length ? periods : null,
    pen: both(sc.penalty) ? [sc.penalty.home, sc.penalty.away] : null,
  };
}

/** api-sports v1 game (hockey, basketball, volleyball, handball): same envelope, sport-specific scores. */
function v1(kind: 'hockey' | 'basketball' | 'volleyball' | 'handball') {
  return (raw: Raw): Fx | null => {
    if (!raw?.id || !raw.timestamp) return null;
    const short = String(raw.status?.short ?? '');
    let sh: number | null;
    let sa: number | null;
    let periods: [number, number][] = [];
    let pen: [number, number] | null = null;
    const p = raw.periods ?? {};
    if (kind === 'hockey') {
      sh = n(raw.scores?.home);
      sa = n(raw.scores?.away);
      periods = [p.first, p.second, p.third, p.overtime].map(dashed).filter((x): x is [number, number] => !!x);
      pen = dashed(p.penalties);
    } else if (kind === 'basketball') {
      const h = raw.scores?.home ?? {};
      const a = raw.scores?.away ?? {};
      sh = n(h.total);
      sa = n(a.total);
      periods = ['quarter_1', 'quarter_2', 'quarter_3', 'quarter_4', 'over_time'].map((k) => pairOf(h[k], a[k])).filter((x): x is [number, number] => !!x);
    } else {
      sh = n(raw.scores?.home);
      sa = n(raw.scores?.away);
      const keys = kind === 'volleyball' ? ['first', 'second', 'third', 'fourth', 'fifth'] : ['first', 'second'];
      periods = keys.map((k) => pairOf(p[k]?.home, p[k]?.away)).filter((x): x is [number, number] => !!x);
    }
    return {
      id: String(raw.id), ts: Number(raw.timestamp) * 1000, league: Number(raw.league?.id), leagueName: String(raw.league?.name ?? ''),
      short, status: V1_STATUS[short], ...teams(raw), sh, sa,
      periods: periods.length ? periods : null, pen,
    };
  };
}

export const SPORT_APIS: SportApi[] = [
  {
    slug: 'fotbal', sport: 16, provider: 'apifootball', host: 'v3.football.api-sports.io', list: '/fixtures',
    h2h: { path: '/fixtures/headtohead', param: 'h2h' }, detail: { path: '/fixtures', param: 'id' }, durationMin: 100,
    leagues: {
      'chance-liga': 345, 'chance-narodni-liga': 346, 'liga-mistru': 2, 'evropska-liga': 3, 'konferencni-liga': 848,
      'premier-league': 39, championship: 40, 'la-liga': 140, bundesliga: 78, 'serie-a': 135, 'ligue-1': 61, 'nike-liga': 332,
    },
    parse: football,
  },
  {
    slug: 'hokej', sport: 23, provider: 'apihockey', host: 'v1.hockey.api-sports.io', list: '/games',
    h2h: { path: '/games/h2h', param: 'h2h' }, detail: { path: '/games/events', param: 'game' }, durationMin: 150,
    // Maxa liga has no current season at the provider (22. 10. 2026), so it is not mapped.
    leagues: { nhl: 57, 'tipsport-extraliga': 10, 'slovenska-extraliga': 91 },
    parse: v1('hockey'),
  },
  {
    slug: 'basketbal', sport: 7, provider: 'apibasketball', host: 'v1.basketball.api-sports.io', list: '/games',
    h2h: { path: '/games', param: 'h2h' }, durationMin: 140,
    leagues: { nba: 12, euroliga: 120 },
    parse: v1('basketball'),
  },
  {
    slug: 'volejbal', sport: 47, provider: 'apivolleyball', host: 'v1.volleyball.api-sports.io', list: '/games',
    h2h: { path: '/games/h2h', param: 'h2h' }, durationMin: 130,
    leagues: { 'extraliga-volejbal': 38 },
    parse: v1('volleyball'),
  },
  {
    slug: 'hazena', sport: 20, provider: 'apihandball', host: 'v1.handball.api-sports.io', list: '/games',
    h2h: { path: '/games/h2h', param: 'h2h' }, durationMin: 90,
    leagues: { 'chance-extraliga-hazena': 12 },
    parse: v1('handball'),
  },
];

export const FOOTBALL = SPORT_APIS[0];
export const sportApi = (slug: string) => SPORT_APIS.find((s) => s.slug === slug);
export const sportApiById = (sport: number) => SPORT_APIS.find((s) => s.sport === sport);
