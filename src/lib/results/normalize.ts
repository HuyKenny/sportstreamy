import { slugify } from '../text';
import { competitionOf } from '../competitions';
import type { Status } from './status';

/** One provider observation of one match, ready for store.ts. Scores are null when the provider has none. */
export interface Obs {
  provider: 'tipsport' | 'apifootball';
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
  status: Status;
  status_raw: string | null;
  minute_raw: string | null;
  sh: number | null;
  sa: number | null;
  periods: [number, number][] | null;
  pen_h: number | null;
  pen_a: number | null;
  stream: boolean;
  path: string;
  slug: string;
  src_at: number;
  review: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = Record<string, any>;

/** "3", 3 → 3; "-", "", null → null. A missing score is never a 0. */
export const score = (v: unknown): number | null => {
  const s = String(v ?? '').trim();
  return /^\d{1,3}$/.test(s) ? Number(s) : null;
};

/** Team kind from Tipsport naming: women " Ž"/"(ž)", youth "U19", reserves " II", " B", "rezervy". */
export function teamKind(name: string): 'men' | 'women' | 'youth' | 'reserve' {
  if (/\sŽ$|\(ž\)$/.test(name)) return 'women';
  if (/\bU\s?\d{2}\b|junio|dorost|youth/i.test(name)) return 'youth';
  if (/\s(II|B)$|rezerv/i.test(name)) return 'reserve';
  return 'men';
}

/** Period scores as Tipsport prints them in the last bracket: "2.pol. - 48.min (1:1, 0:1)" → [[1,1],[0,1]]. */
export function periodsOf(text: string): [number, number][] | null {
  const groups = [...text.matchAll(/\(([^()]*)\)/g)];
  const last = groups.at(-1)?.[1];
  if (!last) return null;
  const pairs = [...last.matchAll(/(\d{1,3}):(\d{1,3})/g)].map((x) => [Number(x[1]), Number(x[2])] as [number, number]);
  return pairs.length ? pairs : null;
}

/** Penalty shoot-out score when the status names it ("pen. 4:3", "4:3 pen", "penalty 5:4"). */
export function penaltiesOf(text: string): [number, number] | null {
  const m = /pen[a-z.]*\s*(\d{1,2}):(\d{1,2})|(\d{1,2}):(\d{1,2})\s*pen/i.exec(text);
  if (!m) return null;
  return m[1] ? [Number(m[1]), Number(m[2])] : [Number(m[3]), Number(m[4])];
}

const PEN = /penalt|rozstřel|\bpen\b|pen\./i;
const ET = /prodl|\bpp\b|\baet\b/i;

/**
 * Tipsport live-feed state → our state. Only `ended: true` makes a final result; an unrecognised text is 'unknown'
 * (shown with Tipsport's own words), never "Konec".
 */
export function classify(raw: { ended?: boolean; statusOffer?: string | null; time?: string | null; dateStart: number }, now: number): Status {
  const t = String(raw.statusOffer ?? '').trim();
  if (/odlož/i.test(t)) return 'postponed';
  if (/zruš/i.test(t)) return 'cancelled';
  if (/přeruš|abandon/i.test(t)) return 'interrupted';
  if (raw.ended) return PEN.test(t) ? 'pen' : ET.test(t) ? 'aet' : 'ft';
  if (raw.dateStart > now) return 'scheduled';
  // Seen 21. 10.: "Konec základní hrací doby - 90.min (…)", "Ukončené prodloužení - 120.min (…)".
  if (/konec základní|ukončené prodl/i.test(t)) return 'bt';
  if (/poločas|přestávk/i.test(t)) return 'ht';
  if (PEN.test(t)) return 'pens';
  if (ET.test(t)) return 'et';
  if (/\d\.\s?pol\.|\d+\.\s?min/i.test(t) || /^\d{1,3}'(\+\d+)?$/.test(String(raw.time ?? ''))) return 'live';
  // Past kick-off time but Tipsport still counts down ("Za 5 minut"): a late start, not a result.
  // Same for a bare kick-off time ("21:00").
  if (/^za\s+(\d+|okamžik)/i.test(t) || /^\d{1,2}:\d{2}$/.test(t)) return 'scheduled';
  return 'unknown';
}

const fixName = (s: string) => s.replace(/\sŽ$/, ' (ž)');

/** Tipsport match (live or prematch feed) → observation, or null when it is not in a pilot competition. */
export function fromTipsport(raw: Raw, at: number, comps: string[]): Obs | null {
  if (!raw?.id || !raw.dateStart) return null;
  const comp = competitionOf(raw.idSuperSport, String(raw.nameCompetition ?? ''));
  if (!comp || !comps.includes(comp.slug)) return null;
  const home = fixName(String(raw.homeParticipant ?? '').trim());
  const away = fixName(String(raw.visitingParticipant ?? '').trim());
  if (!home || !away) return null; // outrights and single-entity events are not matches
  const status = classify(raw as { dateStart: number }, at);
  const text = String(raw.statusOffer ?? '');
  const live = status !== 'scheduled';
  const pens = status === 'pen' || status === 'pens' ? penaltiesOf(text) : null;
  const kinds = [teamKind(home), teamKind(away)];
  return {
    provider: 'tipsport',
    sport: Number(raw.idSuperSport),
    ext_id: String(raw.id),
    comp: comp.slug,
    lg: String(raw.nameCompetition ?? ''),
    season: raw.competitionAnnualId ? String(raw.competitionAnnualId) : null,
    home,
    away,
    home_ext: raw.homeParticipantId ? String(raw.homeParticipantId) : null,
    away_ext: raw.visitingParticipantId ? String(raw.visitingParticipantId) : null,
    start_utc: Number(raw.dateStart),
    status,
    status_raw: text.trim() || null,
    minute_raw: live && raw.time ? String(raw.time) : null,
    sh: live ? score(raw.home) : null,
    sa: live ? score(raw.away) : null,
    periods: live ? periodsOf(text) : null,
    pen_h: pens?.[0] ?? null,
    pen_a: pens?.[1] ?? null,
    stream: !!raw.stream,
    path: String(raw.matchUrl ?? ''),
    slug: `${raw.id}-${slugify(`${home} ${away}`)}`,
    src_at: at,
    // Pilot competitions are men's first teams; anything else, or a team without a provider id, waits for a human.
    review: !raw.homeParticipantId || !raw.visitingParticipantId || kinds.some((k) => k !== 'men'),
  };
}

/** api-football fixture status codes (documentation v3, "Fixtures → status"). */
export const AF_STATUS: Record<string, Status> = {
  TBD: 'scheduled', NS: 'scheduled',
  '1H': 'live', '2H': 'live', LIVE: 'live',
  HT: 'ht', BT: 'bt',
  ET: 'et', P: 'pens',
  FT: 'ft', AET: 'aet', PEN: 'pen',
  PST: 'postponed', SUSP: 'interrupted', INT: 'interrupted',
  CANC: 'cancelled', ABD: 'cancelled',
  // AWD (technical loss) and WO (walkover) are results decided off the pitch: shown with the provider's wording.
};

/**
 * api-football fixture → observation. It is stored for pairing only (review = true): our URLs are Tipsport matches,
 * and a fixture is linked to one only through verified team ids, never by name (docs/vysledky-provoz.md).
 */
export function fromApiFootball(fx: Raw, at: number, comp: string): Obs | null {
  const f = fx?.fixture;
  if (!f?.id || !f.timestamp) return null;
  const short = String(f.status?.short ?? '');
  const status = AF_STATUS[short] ?? 'unknown';
  const ht = fx.score?.halftime;
  const ft = fx.score?.fulltime;
  const periods: [number, number][] | null = ht?.home != null && ht?.away != null && ft?.home != null && ft?.away != null
    ? [[ht.home, ht.away], [ft.home - ht.home, ft.away - ht.away]]
    : null;
  const home = String(fx.teams?.home?.name ?? '');
  const away = String(fx.teams?.away?.name ?? '');
  return {
    provider: 'apifootball',
    sport: 16,
    ext_id: String(f.id),
    comp,
    lg: String(fx.league?.name ?? ''),
    season: fx.league?.season != null ? String(fx.league.season) : null,
    home,
    away,
    home_ext: fx.teams?.home?.id != null ? String(fx.teams.home.id) : null,
    away_ext: fx.teams?.away?.id != null ? String(fx.teams.away.id) : null,
    start_utc: Number(f.timestamp) * 1000,
    status,
    status_raw: f.status?.long ? String(f.status.long) : short || null,
    minute_raw: f.status?.elapsed != null ? `${f.status.elapsed}'` : null,
    sh: fx.goals?.home ?? null,
    sa: fx.goals?.away ?? null,
    periods,
    pen_h: fx.score?.penalty?.home ?? null,
    pen_a: fx.score?.penalty?.away ?? null,
    stream: false,
    path: '',
    slug: `af-${f.id}-${slugify(`${home} ${away}`)}`,
    src_at: at,
    review: true,
  };
}
