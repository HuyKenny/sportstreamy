/**
 * Bookmakers. Partners (Tipsport, Chance, Allwyn) have affiliate links through /go/; the others (Fortuna, Betano,
 * Synot Tip) get honest pages that link to them without affiliate (nofollow) and steer the main CTA to Tipsport —
 * swap `site` for an affiliate /go/ id once Kenny has a programme with them.
 * Facts only, checked on the operators' own sites (20. 10. 2026); no bonus amounts except where Kenny confirmed them.
 */
export type BookSlug = 'tipsport' | 'chance' | 'sazka' | 'fortuna' | 'betano' | 'synottip';
export type Topic = 'tv' | 'aplikace' | 'kontrola-tiketu' | 'bonus' | 'registrace';

export interface BookInfo {
  slug: BookSlug;
  name: string;
  short: string; // name in running text ("u Tipsportu" is in the copy, this is the bare brand)
  full: string; // operator
  partner: boolean;
  go?: string; // /go/<id>/ for partners
  site: string; // operator's site (non-partners link here, nofollow)
  bonus?: string; // headline amount, only where Kenny confirmed it
  color: string;
  blurb: string;
  pros: string[];
  cons: string[];
  watch: string;
  streams: boolean; // live video for registered customers
  branches: boolean; // network of shops (pages under /pobocky/)
  topics: Topic[];
}

export const BOOKS: BookInfo[] = [
  {
    slug: 'tipsport', name: 'Tipsport', short: 'Tipsport', full: 'Tipsport a.s.', partner: true, go: 'registrace', site: 'https://www.tipsport.cz', bonus: '1000 Kč', color: '#0b4ea2',
    blurb: 'Největší česká sázková kancelář a největší nabídka živých přenosů. Právě z jejího programu čerpá SportStreamy.',
    pros: ['Nejvíc zápasů s videem (Tipsport TV) – fotbal, hokej, tenis, basketbal, e-sporty', 'Bonus 1000 Kč pro nové hráče', 'Mobilní aplikace a hustá síť poboček', 'Česká licence'],
    cons: ['Video jen po registraci a ověření totožnosti', 'U části zápasů (Chance Liga, NHL) jen statistiky, ne video'],
    watch: 'Přenosy (Tipsport TV) se pouští po přihlášení do účtu. Registrace je bezplatná a trvá několik minut včetně ověření totožnosti.',
    streams: true, branches: true, topics: ['tv', 'aplikace', 'kontrola-tiketu', 'bonus', 'registrace'],
  },
  {
    slug: 'chance', name: 'Chance', short: 'Chance', full: 'Chance a.s.', partner: true, go: 'chance', site: 'https://www.chance.cz', color: '#0f7a3c',
    blurb: 'Druhá velká česká kancelář na stejné platformě jako Tipsport – stejné zápasy, jiné kurzy. Generální partner Chance Ligy.',
    pros: ['Stejné zápasy jako Tipsport – snadné porovnání kurzů', 'Bonus 200 Kč za registraci', 'Mobilní aplikace, pobočky', 'Česká licence'],
    cons: ['Menší síť poboček než Tipsport'],
    watch: 'Stejně jako u Tipsportu se přenos pouští po přihlášení do účtu.',
    streams: true, branches: true, topics: ['tv', 'aplikace', 'kontrola-tiketu', 'bonus', 'registrace'],
  },
  {
    slug: 'sazka', name: 'Allwyn (SazkaBet)', short: 'Allwyn', full: 'Allwyn a.s. (dříve Sazka)', partner: true, go: 'sazka', site: 'https://www.allwyn.cz', color: '#1d6b4f',
    blurb: 'Provozovatel loterií a sázek (dříve Sazka a SazkaBet). Sportka, Eurojackpot i kurzové sázky na jednom účtu.',
    pros: ['Loterie a sázky na jednom účtu', 'Největší síť prodejních míst v Česku', 'Česká licence'],
    cons: ['Menší nabídka živých přenosů než Tipsport'],
    watch: 'Program přenosů od Allwynu nemáme; pro sledování zápasů doporučujeme Tipsport.',
    streams: false, branches: true, topics: ['aplikace', 'kontrola-tiketu', 'bonus', 'registrace'],
  },
  {
    slug: 'fortuna', name: 'Fortuna', short: 'Fortuna', full: 'FORTUNA GAME a.s.', partner: false, site: 'https://www.ifortuna.cz', color: '#f6c400',
    blurb: 'Tradiční česká sázková kancelář (FORTUNA GAME a.s., licence MF ČR) s webem ifortuna.cz, aplikací a zhruba čtyřmi sty prodejnami.',
    pros: ['Velká nabídka kurzových sázek a live sázek', 'Mobilní aplikace', 'Přes 400 prodejen po celé republice'],
    cons: ['Její přenosy a bonusy na SportStreamy nezprostředkujeme – pro sledování zápasů zdarma s bonusem doporučujeme Tipsport'],
    watch: 'Fortuna nabízí živé sázení; pro přehled přenosů a sledování zápasů zdarma používej program na SportStreamy (Tipsport).',
    streams: false, branches: true, topics: ['aplikace', 'kontrola-tiketu', 'bonus', 'registrace'],
  },
  {
    slug: 'betano', name: 'Betano', short: 'Betano', full: 'Betano (betano.cz)', partner: false, site: 'https://www.betano.cz', color: '#ff6a00',
    blurb: 'Mezinárodní sázková značka, v Česku na betano.cz. Známá „Betano žolíky“ a sponzoringem fotbalu.',
    pros: ['Široká nabídka trhů včetně sázek na hráče', 'Akce typu Betano žolík na vybrané zápasy'],
    cons: ['Bez poboček', 'Její bonusy na SportStreamy nezprostředkujeme – alternativou je Tipsport s bonusem 1000 Kč'],
    watch: 'Pro sledování zápasů zdarma používej program na SportStreamy – přenosy vedou k Tipsportu.',
    streams: false, branches: false, topics: ['aplikace', 'bonus', 'registrace'],
  },
  {
    slug: 'synottip', name: 'Synot Tip', short: 'Synot Tip', full: 'SYNOT TIP, a.s.', partner: false, site: 'https://www.synottip.cz', color: '#c4161c',
    blurb: 'Česká sázková kancelář SYNOT TIP, a.s. z Uherského Hradiště – kurzové a live sázky, casino a mobilní aplikace.',
    pros: ['Kurzové i live sázky', 'Mobilní aplikace'],
    cons: ['Menší nabídka přenosů – pro sledování zápasů doporučujeme Tipsport'],
    watch: 'Pro sledování zápasů zdarma používej program na SportStreamy – přenosy vedou k Tipsportu.',
    streams: false, branches: false, topics: ['aplikace', 'bonus', 'registrace'],
  },
];
export const BOOK_BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));

/** Where the main CTA of a page about this bookmaker goes. */
export const ctaFor = (b: BookInfo) => (b.partner ? `/go/${b.go}/` : '/go/registrace/');
