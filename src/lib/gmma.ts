/**
 * G MMA guide (/jak-sledovat/g-mma/): facts checked 24. 10. 2026 on the organiser's own sites (gmma.cz card, FAQ
 * and promotions; PPV is sold on geckotv.cz) and cross-checked with the Czech MMA press. The PPV price is not
 * published outside the checkout, so the page does not state one. Fight times and odds come live from the feed
 * (competition slug "g-mma") once bookmakers list them. G MMA 1 took place on 31. 10. 2026; `NEXT` describes what is known about G MMA 2 (checked 13. 11. 2026).
 */
export const EVENT = {
  name: 'G MMA 1: Samhain',
  start: '2026-10-31T18:00:00+01:00',
  end: '2026-11-01T00:30:00+01:00',
  venue: 'Nová Spirála, Výstaviště Praha',
  city: 'Praha',
  fights: 13,
  tickets: 1999,
};

/** Official card from gmma.cz (state 24. 10. 2026); `type` is the organiser's own label. */
export const CARD = [
  { a: 'Makhmud „Mach“ Muradov', b: '6 Kotlárů', type: 'Hlavní zápas večera', note: 'Muradov postupně proti šesti členům rodu Kotlárů' },
  { a: 'Jiří Kajínek', b: 'Martin Trnečka (bachař)', type: 'Speciál', note: 'Když Kajínek vyhraje, čeká ho na dalším turnaji Pokoš' },
  { a: 'Miroslav Sládek', b: 'Jiří Ovčáček', type: 'Speciál', note: 'Speciální pravidla, Ovčáček za Jiřího Paroubka' },
  { a: 'Spicy Pája', b: 'Tady Janko', type: 'MMA' },
  { a: 'Sam White', b: 'Martin Pavlíček', type: 'Box' },
  { a: 'Radek Štádler', b: 'Alex Miker a Dominik Smolík', type: 'K1, 1 vs. 2' },
  { a: 'Chuligáni', b: 'policisté', type: '2 vs. 2', note: 'Policisté mají náhradu za zraněného Josefa Ptáčníka' },
  { a: 'Majkl Punk', b: 'Viktor Dufka', type: 'Rytířské brnění' },
  { a: 'Flexy Babka', b: 'Jana Hrušková', type: 'Polštářová bitva' },
  { a: 'Matouš Kaluba', b: 'jeho máma', type: 'Máma vs. syn' },
  { a: 'Jakub Kroka', b: 'Leonardo Hnipalovič', type: 'MMA' },
  { a: 'Tajemný bojovník', b: 'soupeř z řad fanoušků', type: 'K1' },
  { a: 'Karel Horváth', b: 'Kulalo', type: 'Box' },
];

/** PPV promotions run by the organiser (gmma.cz, 24. 10. 2026). */
export const PROMO = {
  jackpot: 111111,
  stage: '10 000 + 5 000 + 3 000 Kč',
  stages: 6,
  until: '31. 10. 2026 v 18:00',
};

/** What is public about the second tournament (13. 11. 2026): no date, no venue, no announced fights. */
export const NEXT = {
  name: 'G MMA 2',
  planned: 'příští rok (2027)',
  matchmaker: 'Martin Kocourek',
};
