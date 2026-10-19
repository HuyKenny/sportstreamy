/** Tipsport idSuperSport → our section. Order = menu order. `main` ones are shown in the top navigation. */
export interface Sport { id: number; slug: string; name: string; genitive: string; main: boolean }

export const SPORTS: Sport[] = [
  { id: 16, slug: 'fotbal', name: 'Fotbal', genitive: 'fotbalu', main: true },
  { id: 23, slug: 'hokej', name: 'Hokej', genitive: 'hokeje', main: true },
  { id: 43, slug: 'tenis', name: 'Tenis', genitive: 'tenisu', main: true },
  { id: 7, slug: 'basketbal', name: 'Basketbal', genitive: 'basketbalu', main: true },
  { id: 47, slug: 'volejbal', name: 'Volejbal', genitive: 'volejbalu', main: true },
  { id: 20, slug: 'hazena', name: 'Házená', genitive: 'házené', main: false },
  { id: 14, slug: 'florbal', name: 'Florbal', genitive: 'florbalu', main: false },
  { id: 17, slug: 'futsal', name: 'Futsal', genitive: 'futsalu', main: false },
  { id: 40, slug: 'stolni-tenis', name: 'Stolní tenis', genitive: 'stolního tenisu', main: false },
  { id: 188, slug: 'esporty', name: 'E-sporty', genitive: 'e-sportů', main: false },
  { id: 37, slug: 'snooker', name: 'Snooker', genitive: 'snookeru', main: false },
  { id: 42, slug: 'sipky', name: 'Šipky', genitive: 'šipek', main: false },
  { id: 208, slug: 'bojove-sporty', name: 'Bojové sporty', genitive: 'bojových sportů', main: false },
  { id: 11, slug: 'box', name: 'Box', genitive: 'boxu', main: false },
  { id: 26, slug: 'motorsport', name: 'Motorsport', genitive: 'motorsportu', main: false },
  { id: 2, slug: 'americky-fotbal', name: 'Americký fotbal', genitive: 'amerického fotbalu', main: false },
  { id: 6, slug: 'baseball', name: 'Baseball', genitive: 'baseballu', main: false },
  { id: 31, slug: 'rugby', name: 'Rugby', genitive: 'rugby', main: false },
  { id: 88, slug: 'badminton', name: 'Badminton', genitive: 'badmintonu', main: false },
  { id: 169, slug: 'kriket', name: 'Kriket', genitive: 'kriketu', main: false },
  { id: 41, slug: 'sachy', name: 'Šachy', genitive: 'šachů', main: false },
  { id: 35, slug: 'alpske-lyzovani', name: 'Alpské lyžování', genitive: 'alpského lyžování', main: false },
];

export const SPORT_BY_ID = new Map(SPORTS.map((s) => [s.id, s]));
export const SPORT_BY_SLUG = new Map(SPORTS.map((s) => [s.slug, s]));
/** Outright / social-betting markets are not matches to watch. */
export const SKIP_SPORT_IDS = new Set([25]);
