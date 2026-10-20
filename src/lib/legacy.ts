import type { View } from './matches';
import { matchPath, sportOf } from './url';
import { slugify } from './text';
import { COMPETITIONS } from './competitions';
import { leagues } from './page';
import { SPORT_BY_ID, SPORT_BY_SLUG } from './sports';

/**
 * Old WordPress URLs (until 9. 10. 2026) still carry impressions and get crawled daily.
 * /zivy-prenos/{home}-vs-{away}/ → the same pairing if it is on the program again, else gone (410).
 */
export function legacyMatch(v: View, slug: string): { to?: string; sport?: string } {
  const [a, b] = slug.replace(/\/+$/, '').split('-vs-');
  if (!a || !b) return {};
  const all = [...v.live, ...v.upcoming];
  const m = all.find((x) => (slugify(x.h) === a && slugify(x.a) === b) || (slugify(x.h) === b && slugify(x.a) === a));
  if (m) return { to: matchPath(m) };
  // Not on the program: at least tell which sport the old page was about, from any current match of either side.
  const side = all.find((x) => [slugify(x.h), slugify(x.a)].some((s) => s === a || s === b));
  return { sport: side ? sportOf(side)?.slug : undefined };
}

/** /soutez/{slug}/ and /liga/{slug}/ → curated competition by slug overlap, else a live competition, else nothing. */
export function legacyCompetition(v: View, slug: string): string | undefined {
  const s = slug.replace(/\/+$/, '');
  const curated = COMPETITIONS.find((c) => s === c.slug || s.startsWith(`${c.slug}-`) || slugify(c.name) === s);
  if (curated) return `/${SPORT_BY_ID.get(curated.sp)!.slug}-online/${curated.slug}/`;
  const l = leagues(v).find((x) => x.slug === s || s.startsWith(`${x.slug}-`));
  if (l) return `/${SPORT_BY_ID.get(l.sp)!.slug}-online/${l.slug}/`;
  return undefined;
}

/** /sport/{slug}/ → /{slug}-online/ (old taxonomy used the same Czech slugs, plus a few long forms). */
const ALIAS: Record<string, string> = { 'ledni-hokej': 'hokej', 'e-sporty': 'esporty', 'bojove-sporty': 'bojove-sporty' };
export function legacySport(slug: string): string {
  const s = ALIAS[slug] ?? slug;
  return SPORT_BY_SLUG.has(s) ? `/${s}-online/` : '/';
}
