import type { Match } from './types';
import { matchPath, matchTitle, sportOf } from './url';
import { competitionOf } from './competitions';

export const SITE = 'https://sportstreamy.cz';
const abs = (p: string) => (p.startsWith('http') ? p : SITE + p);

export interface Crumb { name: string; href?: string }

export const breadcrumbLd = (items: Crumb[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, ...(c.href ? { item: abs(c.href) } : {}) })),
});

export const faqLd = (items: { q: string; a: string }[]) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});

export const itemListLd = (items: Match[], name: string) => ({
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name,
  numberOfItems: items.length,
  itemListElement: items.slice(0, 20).map((m, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(matchPath(m)), name: matchTitle(m) })),
});

export const siteLd = () => [
  { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${SITE}/#web`, name: 'SportStreamy', alternateName: 'sportstreamy.cz', url: `${SITE}/`, inLanguage: 'cs' },
  { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${SITE}/#org`, name: 'SportStreamy', url: `${SITE}/`, logo: `${SITE}/icon-512.png`, founder: { '@type': 'Person', '@id': 'https://huy.cz/#kenny', name: 'Ha Duy Huy', alternateName: 'Kenny', url: 'https://huy.cz/', jobTitle: 'SEO konzultant' } },
];

/** `status` (results pilot) marks postponed/cancelled events and turns the description into a result. */
export function sportsEventLd(m: Match, state: 'live' | 'pre' | 'recent', status?: string, result?: string) {
  const s = sportOf(m);
  const comp = competitionOf(m.sp, m.lg);
  const url = abs(matchPath(m));
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: matchTitle(m),
    description: result ? `${matchTitle(m)} ${result} – ${s?.name ?? 'sport'}, ${comp?.name ?? m.lg}. Výsledek zápasu.` : `${matchTitle(m)} – ${s?.name ?? 'sport'}, ${comp?.name ?? m.lg}. Živý přenos a kurzy.`,
    url,
    startDate: new Date(m.st).toISOString(),
    eventStatus: `https://schema.org/${status === 'postponed' ? 'EventPostponed' : status === 'cancelled' ? 'EventCancelled' : 'EventScheduled'}`,
    eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url },
    image: [abs(`/img/sport/${s?.slug ?? 'stadion'}-1600.jpg`.replace('-1600.jpg', '-800.jpg'))],
    sport: s?.name,
    superEvent: { '@type': 'SportsEvent', name: comp?.name ?? m.lg },
    organizer: { '@type': 'Organization', name: comp?.name ?? m.lg },
    ...(m.a ? { homeTeam: { '@type': 'SportsTeam', name: m.h }, awayTeam: { '@type': 'SportsTeam', name: m.a }, competitor: [{ '@type': 'SportsTeam', name: m.h }, { '@type': 'SportsTeam', name: m.a }] } : {}),
    ...(state === 'live' ? { isAccessibleForFree: true } : {}),
  };
}

/** Trim to a length for titles/descriptions without cutting a word in half. */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}
