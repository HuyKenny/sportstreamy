/**
 * Site navigation in one place (desktop bar, its "Další" panel and the phone menu).
 * Order follows Czech search demand (Marketing Miner, 22. 10. 2026): Premier League 112k, Liga mistrů 60k, NHL 58k,
 * Chance Liga 55k, hokej online 40k… while basketbal/volejbal online are 200–500 — those live under "Další".
 * `k` is the `section` a page passes to Base for the active state.
 */
export interface NavItem { href: string; label: string; k: string; icon?: string }

export const NAV_MAIN: NavItem[] = [
  { href: '/zive/', label: 'Živě', k: 'zive', icon: 'live' },
  { href: '/program/', label: 'Program', k: 'program', icon: 'calendar' },
  { href: '/vysledky/', label: 'Výsledky', k: 'vysledky', icon: 'trophy' },
];
export const NAV_SPORTS: NavItem[] = [
  { href: '/fotbal-online/', label: 'Fotbal', k: 'fotbal', icon: 'fotbal' },
  { href: '/hokej-online/', label: 'Hokej', k: 'hokej', icon: 'hokej' },
  { href: '/tenis-online/', label: 'Tenis', k: 'tenis', icon: 'tenis' },
];
export const NAV_COMPS: NavItem[] = [
  { href: '/fotbal-online/liga-mistru/', label: 'Liga mistrů', k: 'liga-mistru' },
  { href: '/fotbal-online/premier-league/', label: 'Premier League', k: 'premier-league' },
  { href: '/fotbal-online/chance-liga/', label: 'Chance Liga', k: 'chance-liga' },
  { href: '/hokej-online/nhl/', label: 'NHL', k: 'nhl' },
];

/** The "Další" panel (desktop) and the lower part of the phone menu. */
export const NAV_MORE: { title: string; items: NavItem[] }[] = [
  {
    title: 'Další sporty',
    items: [
      { href: '/basketbal-online/', label: 'Basketbal', k: 'basketbal', icon: 'basketbal' },
      { href: '/volejbal-online/', label: 'Volejbal', k: 'volejbal', icon: 'volejbal' },
      { href: '/hazena-online/', label: 'Házená', k: 'hazena', icon: 'hazena' },
      { href: '/florbal-online/', label: 'Florbal', k: 'florbal', icon: 'florbal' },
      { href: '/sipky-online/', label: 'Šipky', k: 'sipky', icon: 'sipky' },
      { href: '/bojove-sporty-online/', label: 'MMA a box', k: 'bojove-sporty', icon: 'bojove-sporty' },
      { href: '/esporty-online/', label: 'E-sporty', k: 'esporty', icon: 'esporty' },
      { href: '/stolni-tenis-online/', label: 'Stolní tenis', k: 'stolni-tenis', icon: 'stolni-tenis' },
    ],
  },
  {
    title: 'Soutěže',
    items: [
      { href: '/hokej-online/tipsport-extraliga/', label: 'Tipsport extraliga', k: 'tipsport-extraliga' },
      { href: '/fotbal-online/evropska-liga/', label: 'Evropská liga', k: 'evropska-liga' },
      { href: '/fotbal-online/konferencni-liga/', label: 'Konferenční liga', k: 'konferencni-liga' },
      { href: '/basketbal-online/nba/', label: 'NBA', k: 'nba' },
      { href: '/fotbal-online/la-liga/', label: 'La Liga', k: 'la-liga' },
      { href: '/fotbal-online/bundesliga/', label: 'Bundesliga', k: 'bundesliga' },
      { href: '/fotbal-online/serie-a/', label: 'Serie A', k: 'serie-a' },
      { href: '/bojove-sporty-online/ufc/', label: 'UFC', k: 'ufc' },
      { href: '/bojove-sporty-online/oktagon/', label: 'Oktagon', k: 'oktagon' },
    ],
  },
  {
    title: 'Kde sledovat',
    items: [
      { href: '/jak-sledovat/', label: 'Kde sledovat velké zápasy', k: 'nahledy', icon: 'tv' },
      { href: '/sazkove-kancelare/tipsport/tv/', label: 'Tipsport TV', k: 'tipsport-tv', icon: 'play' },
      { href: '/clanky/sportovni-kanaly-online/', label: 'Sportovní kanály online', k: 'kanaly', icon: 'tv' },
    ],
  },
  {
    title: 'Sázkové kanceláře',
    items: [
      { href: '/sazkove-kancelare/', label: 'Srovnání a bonusy', k: 'bonusy', icon: 'gift' },
      { href: '/pobocky/', label: 'Pobočky', k: 'pobocky', icon: 'home' },
      { href: '/clanky/', label: 'Články a návody', k: 'clanky', icon: 'arrow' },
    ],
  },
];
