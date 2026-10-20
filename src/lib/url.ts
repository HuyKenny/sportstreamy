import type { Match } from './types';
import { slugify } from './text';
import { SPORT_BY_ID } from './sports';
import { competitionSlug } from './competitions';

export const matchTitle = (m: Match) => (m.a ? `${m.h} – ${m.a}` : m.h);
export const matchSlug = (m: Match) => `${m.id}-${slugify(m.a ? `${m.h} ${m.a}` : m.h)}`;
export const matchPath = (m: Match) => `/zapas/${matchSlug(m)}/`;
export const sportPath = (slug: string) => `/${slug}-online/`;
export const leaguePath = (sportSlug: string, lg: string, sp?: number) => `/${sportSlug}-online/${sp ? competitionSlug(sp, lg) : slugify(lg)}/`;
export const leaguePathOf = (m: Match) => leaguePath(SPORT_BY_ID.get(m.sp)?.slug ?? 'sport', m.lg, m.sp);
export const sportOf = (m: Match) => SPORT_BY_ID.get(m.sp);
/** Our own tracked redirect for a click on a match (provider defaults to Tipsport). */
export const goPath = (m: Match | null, placement: string, book: 'tipsport' | 'chance' = 'tipsport') =>
  `/go/${book}/?${m ? `m=${m.id}&` : ''}p=${placement}`;
