/**
 * Sister site kurzovyradar.cz (odds comparison and odds history, same owner). Links go only where the topic is the same
 * and the target exists (checked 24. 10. 2026): league page → competition page, match page → match page via the Tipsport id.
 */
export const KURZOVYRADAR = 'https://kurzovyradar.cz';

/** Competition slug here → /souteze/<slug>/ there (same slug unless listed). */
const SAME = new Set(['chance-liga', 'chance-narodni-liga', 'liga-mistru', 'evropska-liga', 'konferencni-liga', 'premier-league', 'championship', 'la-liga', 'bundesliga', 'serie-a', 'ligue-1', 'nike-liga', 'tipsport-extraliga', 'maxa-liga', 'nhl']);
export const kurzyCompetitionUrl = (slug: string): string | null =>
  SAME.has(slug) ? `${KURZOVYRADAR}/souteze/${slug}/` : slug === 'slovenska-extraliga' ? `${KURZOVYRADAR}/souteze/tipos-extraliga/` : null;

/**
 * Slovak sister site ziveprenosy.sk (same owner, Kenny 24. 10. 2026): only the Slovak competitions link there, in the
 * text of the competition page. ziveprenosy.sk links back from different pages (no page-to-page pair).
 */
export const ZIVEPRENOSY = 'https://ziveprenosy.sk';
const ZIVE: Record<string, string> = { 'nike-liga': '/futbal/nike-liga/', 'slovenska-extraliga': '/hokej/tipsport-liga/', '2-slovenska-liga': '/futbal/2-liga/' };
export const ziveCompetitionUrl = (slug: string): string | null => (ZIVE[slug] ? ZIVEPRENOSY + ZIVE[slug] : null);

/** Match page there, found by Tipsport's match id (301 to the canonical page, or to the odds overview if it is not listed). */
export const kurzyMatchUrl = (tipsportId: number) => `${KURZOVYRADAR}/tipsport-zapas/${tipsportId}/`;

/**
 * alkoholicky.cz (same owner, 29. 10. 2026): one body link from the Czech extraliga page to the non-alcoholic beer category
 * (watching hockey at home). alkoholicky.cz links back to this page from a different article, not from that category.
 */
export const ALKOHOLICKY = 'https://alkoholicky.cz';
export const alkoholickyCompetitionUrl = (slug: string): string | null => (slug === 'tipsport-extraliga' ? `${ALKOHOLICKY}/nealkoholicka-piva/` : null);

/**
 * kouzelnydeda.cz (same owner, 3. 11. 2026, Kenny): trips with tickets to the matches of the big leagues. One body sentence on
 * the competition page and two guides; kouzelnydeda.cz links back only from its articles, to different pages (no page-to-page pair).
 */
export const KOUZELNYDEDA = 'https://kouzelnydeda.cz';
const TRIPS: Record<string, string> = { 'premier-league': 'zajezdy-na-premier-league', 'liga-mistru': 'zajezdy-na-ligu-mistru', 'evropska-liga': 'zajezdy-na-evropskou-ligu', 'la-liga': 'zajezdy-na-la-ligu', bundesliga: 'zajezdy-na-bundesligu', 'serie-a': 'zajezdy-na-serii-a', 'ligue-1': 'zajezdy-na-ligue-1', nhl: 'zajezdy-na-nhl', 'ms-v-hokeji': 'zajezdy-na-ms-v-hokeji' };
export const tripsCompetitionUrl = (slug: string): string | null => (TRIPS[slug] ? `${KOUZELNYDEDA}/${TRIPS[slug]}/` : null);
