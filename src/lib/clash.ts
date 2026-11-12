/**
 * Clash MMA guide (/jak-sledovat/clash-mma/): facts checked 24. 10. and 13. 11. 2026 against two independent sources each —
 * PPV prices from the organiser's own offer feed on clashmma.com, the card and the event history from the Czech
 * Wikipedia article cross-checked with the Czech MMA press. Fight times and odds are NOT here: they come live
 * from the feed (competition slug "clash"). Update this file after every event.
 */
export interface ClashEvent { n: string; date: string; place: string; main: string; winner?: string }
export interface ClashFight { a: string; b: string; rules: string; note?: string }

export const NEXT = {
  name: 'CLASH 18: Judgement Day',
  short: 'Clash 18',
  // The organiser has not announced a start time yet: `start`/`end` are only the date, `timeKnown` hides the clock.
  start: '2027-02-06T12:00:00+01:00',
  end: '2027-02-07T02:00:00+01:00',
  timeKnown: false,
  venue: 'Sportovní hala Fortuna, Praha',
  city: 'Praha',
  main: 'Tomáš „Linh“ Le Sy vs. Aleš „Psychopat“ Bejr',
  ticketsFrom: 449,
};

/** PPV for the next event on clashmma.com. Empty until the organiser publishes prices (not yet for CLASH 18, 13. 11. 2026). */
export const PPV: { name: string; price: number; quality: string; replay: string }[] = [];

/** Prices of the last event (CLASH 17, valid 23.–24. 10. 2026), shown as orientation while PPV is empty. */
export const LAST_PPV = {
  event: 'Clash 17',
  rows: [
    { name: 'Basic', price: 289, quality: '720p', replay: 'záznam 24 hodin' },
    { name: 'Premium', price: 309, quality: '1080p (Full HD)', replay: 'záznam 7 dní' },
  ],
  early: { basic: 269, premium: 289 },
};

/** Announced fights for CLASH 18 (state 13. 11. 2026); the full card comes at the December press conference. */
export const CARD: ClashFight[] = [
  { a: 'Tomáš „Linh“ Le Sy', b: 'Aleš „Psychopat“ Bejr', rules: 'MMA', note: 'Hlavní zápas' },
  { a: 'René „Rendys“ Blahovský', b: 'Filip Grznár', rules: 'MMA', note: '93 kg, odveta o titul polotěžké váhy' },
  { a: 'Petr „Maniac Cop“ Reif', b: 'Tomáš Podhorný', rules: 'MMA', note: '84 kg, o uvolněný titul střední váhy' },
  { a: 'Tadeáš „Gangstaboy“ Veselý', b: 'Samir Margina', rules: 'Thai box', note: 'bez rukavic' },
  { a: 'Václav „Baba Jaga“ Mikulášek', b: 'soupeř zatím neoznámen', rules: 'zatím neoznámeno' },
  { a: 'Lucie Sedláčková', b: 'soupeř zatím neoznámen', rules: 'Box' },
];

export interface ClashResult { a: string; b: string; rules: string; winner: string; note?: string }
/** Results of CLASH 17: Fight City (24. 10. 2026, Ústí nad Labem), main event first. */
export const RESULTS: ClashResult[] = [
  { a: 'Martin Kocián', b: 'Martin Fenin', rules: 'MMA', winner: 'Fenin', note: 'hlavní zápas' },
  { a: 'Patrik „Žralok“ Hübler', b: 'Pavol „Pali Hari“ Vaško', rules: 'Street fight', winner: 'Hübler', note: 'Vaško utrpěl zlomeninu nohy' },
  { a: 'Karel „Karlos“ Benda', b: 'tým 5 soupeřů', rules: 'MMA', winner: 'Benda', note: 'vyhrál 3 ze 5 zápasů, prohrál s Lysákem a Hořejším' },
  { a: 'Michal Kotalík', b: 'Tomáš „Tommy Polly“ Pollák', rules: 'Cage box', winner: 'Kotalík' },
  { a: 'Gabriela „Playstation Princess“ Žaludová', b: 'Angeli „Angie“ Mangombe', rules: 'K1', winner: 'Žaludová' },
  { a: 'Alexandr „Cverminator“ Cverna', b: 'František Dirda', rules: 'Cage box', winner: 'Cverna' },
  { a: 'Josef „Tyson“ Škop', b: 'Pavel Albrecht', rules: 'Cage box', winner: 'Škop' },
  { a: 'Dominik „Malej Zmijozel“ Radl', b: 'Lukáš „Prcalík“ Přidal', rules: 'MMA', winner: 'Radl', note: 'zápas o Mini belt' },
  { a: 'René „Rendys“ Blahovský', b: 'Patrik Jevický', rules: 'MMA', winner: 'Blahovský' },
  { a: 'Marek „Datel“ Valášek', b: 'Bartoš + Hoffinger', rules: 'Cage box', winner: 'Valášek', note: '1 vs. 2' },
  { a: 'Ivan „Švejk TV“ Diakun', b: 'Marek „Podnikatel“ Bílý', rules: 'MMA', winner: 'Diakun' },
  { a: 'Antonín Hodan', b: 'Jan Rybka', rules: 'Thai box', winner: 'Hodan' },
  { a: 'Rudolf + Drbal', b: 'Dužda, Kalai, Tomanec, Sura', rules: 'Thai box', winner: 'Rudolf + Drbal', note: 'deathmatch dvojic' },
];

/** Reigning champions after CLASH 17 (24. 10. 2026); the middleweight belt is vacant (CLASH 18: Reif vs. Podhorný). */
export const CHAMPIONS = [
  { div: 'Profi belt', who: 'Václav „Baba Jaga“ Mikulášek' },
  { div: 'Těžká váha (93–120 kg)', who: 'Karel „Karlos“ Benda' },
  { div: 'Polotěžká váha (84–93 kg)', who: 'René „Rendys“ Blahovský' },
  { div: 'Střední váha (77–84 kg)', who: 'uvolněný titul, o pás se bojuje na Clash 18' },
  { div: 'Pérová váha (62–66 kg)', who: 'Adam „Bergino“ Berger' },
  { div: 'Mini belt', who: 'Dominik „Malej Zmijozel“ Radl' },
  { div: 'Ženy, bantamová váha (57–61 kg)', who: 'Hana „KrutoHanka“ Gelnarová' },
];

/** Every event, newest first; `winner` = the main event winner. */
export const EVENTS: ClashEvent[] = [
  { n: 'CLASH 18: Judgement Day', date: '2027-02-06', place: 'Sportovní hala Fortuna, Praha', main: 'Le Sy vs. Bejr' },
  { n: 'CLASH 17: Fight City', date: '2026-10-24', place: 'Zimní stadion, Ústí nad Labem', main: 'Kocián vs. Fenin', winner: 'Fenin' },
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
