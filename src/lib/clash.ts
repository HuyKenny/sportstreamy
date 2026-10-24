/**
 * Clash MMA guide (/jak-sledovat/clash-mma/): facts checked 24. 10. 2026 against two independent sources each —
 * PPV prices from the organiser's own offer feed on clashmma.com, the card and the event history from the Czech
 * Wikipedia article cross-checked with the Czech MMA press. Fight times and odds are NOT here: they come live
 * from the feed (competition slug "clash"). Update this file after every event.
 */
export interface ClashEvent { n: string; date: string; place: string; main: string; winner?: string }
export interface ClashFight { a: string; b: string; rules: string; note?: string }

export const NEXT = {
  name: 'CLASH 17: Fight City',
  start: '2026-10-24T18:30:00+02:00',
  end: '2026-10-25T00:00:00+02:00',
  venue: 'Zimní stadion Ústí nad Labem',
  city: 'Ústí nad Labem',
  main: 'Martin Kocián vs. Martin Fenin',
};

/** Pay-per-view on clashmma.com (Playlive), prices valid from 23. 10. 2026 until the event. */
export const PPV = [
  { name: 'Basic', price: 289, quality: '720p', replay: 'záznam 24 hodin' },
  { name: 'Premium', price: 309, quality: '1080p (Full HD)', replay: 'záznam 7 dní' },
];
export const PPV_EARLY = { basic: 269, premium: 289 }; // presale prices that ended on 22. 10. 2026

export const CARD: ClashFight[] = [
  { a: 'Martin Kocián', b: 'Martin Fenin', rules: 'MMA', note: 'Hlavní zápas, střední váha do 84 kg' },
  { a: 'Patrik „Žralok“ Hübler', b: 'Pavol „Pali Hari“ Vaško', rules: 'Street fight', note: 'do 120 kg' },
  { a: 'Karel „Karlos“ Benda', b: 'tým 5 soupeřů', rules: 'MMA', note: '1 vs. 5, každý soupeř jde zvlášť' },
  { a: 'Gabriela „Playstation Princess“ Žaludová', b: 'Angeli „Angie“ Mangombe', rules: 'K1', note: '61 kg, za nemocnou Terezu Osladilovou' },
  { a: 'František Dirda', b: 'Alexandr „Cverminator“ Cverna', rules: 'Cage box' },
  { a: 'Michal Kotalík', b: 'Tomáš „Tommy Polly“ Pollák', rules: 'Cage box' },
  { a: 'Lukáš „Prcalík“ Přidal', b: 'Dominik „Malej Zmijozel“ Radl', rules: 'MMA', note: 'Zápas o Mini belt' },
  { a: 'Lukáš „Král Pablo“ Bartoš + Milan „Bourák“ Hoffinger', b: 'Marek „Datel“ Valášek', rules: 'Cage box', note: '2 vs. 1, náhrada za Kotlára a Marcońa' },
  { a: 'Kalai + Dužda', b: 'Rudolf + Drbal · Sura + Tomanec', rules: 'Thai box', note: '2 vs. 2 vs. 2' },
  { a: 'René „Rendys“ Blahovský', b: 'Patrik Jevický', rules: 'MMA', note: '95 kg' },
  { a: 'Josef „Tyson“ Škop', b: 'Pavel Albrecht', rules: 'Cage box', note: '77 kg' },
  { a: 'Antonín Hodan', b: 'Jan Rybka', rules: 'Thai box', note: '100 kg' },
  { a: 'Ivan „Švejk TV“ Diakun', b: 'Marek „Podnikatel“ Bílý', rules: 'MMA', note: '100 kg' },
];

/** Reigning champions after CLASH 16 (6. 6. 2026). */
export const CHAMPIONS = [
  { div: 'Profi belt', who: 'Václav „Baba Jaga“ Mikulášek' },
  { div: 'Těžká váha (93–120 kg)', who: 'Karel „Karlos“ Benda' },
  { div: 'Polotěžká váha (84–93 kg)', who: 'René „Rendys“ Blahovský' },
  { div: 'Střední váha (77–84 kg)', who: 'Tomáš „Dynamo“ Křižan' },
  { div: 'Pérová váha (62–66 kg)', who: 'Adam „Bergino“ Berger' },
  { div: 'Ženy, bantamová váha (57–61 kg)', who: 'Hana „KrutoHanka“ Gelnarová' },
];

/** Every event, newest first; `winner` = the main event winner. */
export const EVENTS: ClashEvent[] = [
  { n: 'CLASH 17: Fight City', date: '2026-10-24', place: 'Zimní stadion, Ústí nad Labem', main: 'Kocián vs. Fenin' },
  { n: 'CLASH 16: Evil', date: '2026-06-06', place: 'Ostravar Aréna, Ostrava', main: 'Mikulášek vs. Benda', winner: 'Mikulášek' },
  { n: 'CLASH 15: Bloody Valentines', date: '2026-02-07', place: 'Winning Group Arena, Brno', main: 'Mikulášek vs. Vaško', winner: 'Mikulášek' },
  { n: 'CLASH 14: Last Man Standing', date: '2025-12-06', place: 'Sportovní hala Fortuna, Praha', main: 'Benda vs. Enžl', winner: 'Benda' },
  { n: 'CLASH 13: Stranger', date: '2025-09-27', place: 'Enteria Arena, Pardubice', main: 'Kotlár vs. Beránek', winner: 'Kotlár' },
  { n: 'CLASH 12: Revenge', date: '2025-06-07', place: 'TIPOS Aréna, Bratislava', main: 'Benda vs. Kotlár', winner: 'Benda' },
  { n: 'CLASH 11: Stronger Than Ever', date: '2025-03-01', place: 'Sportovní hala Fortuna, Praha', main: 'Enžl vs. Valášek', winner: 'Enžl' },
  { n: 'Clash of the Stars 10: The End', date: '2024-11-23', place: 'Winning Group Arena, Brno', main: 'Benda vs. Hübler', winner: 'Benda' },
  { n: 'Clash of the Stars 9: Skandál', date: '2024-09-07', place: 'Sportovní hala Fortuna, Praha', main: 'Gelnarová vs. Mangombe', winner: 'Gelnarová' },
  { n: 'Clash of the Stars 8: Ostrava', date: '2024-06-22', place: 'Ostravar Aréna, Ostrava', main: 'Křižan vs. Grznár', winner: 'Křižan' },
  { n: 'Clash of the Stars 7: Seven Sins', date: '2024-01-27', place: 'Sportovní hala Fortuna, Praha', main: 'Soukup vs. Bejr', winner: 'Soukup' },
  { n: 'Clash of the Stars 6: One Night in Bangkok', date: '2023-10-28', place: 'O2 universum, Praha', main: 'Grznár vs. Tůma', winner: 'Grznár' },
  { n: 'Clash of the Stars 5: The Champ is Here', date: '2023-06-10', place: 'O2 universum, Praha', main: 'Křižan vs. Valášek', winner: 'Křižan' },
  { n: 'Clash of the Stars: Episode IV', date: '2023-03-11', place: 'O2 universum, Praha', main: 'Kotlár vs. Procházka', winner: 'Kotlár' },
  { n: 'Clash of the Stars: Room 3', date: '2022-10-29', place: 'Hala Královka, Praha', main: 'Grznár vs. Bejr', winner: 'Grznár' },
  { n: 'Clash of the Stars: Round 2', date: '2022-06-25', place: 'Hala Královka, Praha', main: 'Valášek vs. Smrek', winner: 'Valášek' },
  { n: 'Clash of the Stars 1', date: '2022-01-22', place: 'Český Těšín', main: 'Valášek vs. Vyšata', winner: 'Valášek' },
];
