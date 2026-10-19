/** Bookmaker facts only: no bonus amounts here, they change and must be read from the provider's own page. */
export interface BookInfo {
  slug: 'tipsport' | 'chance' | 'sazka';
  name: string;
  full: string;
  go: string; // /go/<book>/ id
  blurb: string;
  pros: string[];
  watch: string;
  note: string;
}

export const BOOKS: BookInfo[] = [
  {
    slug: 'tipsport', name: 'Tipsport', full: 'Tipsport a.s.', go: 'tipsport',
    blurb: 'Největší česká sázková kancelář s nejširší nabídkou živých přenosů. Právě odtud čerpáme program a živé skóre na SportStreamy.',
    pros: ['Nejvíc zápasů s videem v naší nabídce', 'Fotbal, hokej, tenis, basketbal, volejbal i e-sporty', 'Aplikace pro mobil a živé kurzy u každého zápasu', 'Licence České republiky'],
    watch: 'Přenosy se pouští po přihlášení do účtu. Registrace je bezplatná a trvá několik minut včetně ověření totožnosti.',
    note: 'Přenos se zobrazí u zápasů označených videem; dostupnost se může u konkrétního zápasu změnit.',
  },
  {
    slug: 'chance', name: 'Chance', full: 'Chance a.s.', go: 'chance',
    blurb: 'Druhá velká česká kancelář. Nabídka zápasů je shodná s Tipsportem, proto u zápasů porovnáváme kurzy obou.',
    pros: ['Stejné zápasy a stejné ID jako Tipsport – snadné porovnání kurzů', 'Sponzor Chance Ligy', 'Mobilní aplikace', 'Licence České republiky'],
    watch: 'Stejně jako u Tipsportu se přenos pouští po přihlášení. Pokud už účet máš, nemusíš nic dělat.',
    note: 'Kurzy u zápasů se liší o desetiny; rozdíl vidíš v tabulce na detailu zápasu.',
  },
  {
    slug: 'sazka', name: 'Allwyn (dříve Sazka)', full: 'Allwyn a.s.', go: 'sazka',
    blurb: 'Provozovatel loterií a sázek (dříve Sazka). Hodí se hlavně pro loterie, sázení na zápasy a online hry.',
    pros: ['Loterie (Sportka, Eurojackpot) i sázky na jednom účtu', 'Velká síť prodejních míst i online', 'Licence České republiky'],
    watch: 'U Allwynu nemáme program přenosů; odkaz vede na nabídku provozovatele.',
    note: 'Podmínky nabídky jsou na stránce provozovatele.',
  },
];
export const BOOK_BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));
