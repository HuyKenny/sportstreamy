/**
 * Bookmakers. Partners (Tipsport, Chance, Allwyn, MerkurXtip) have affiliate links through /go/; the others (Fortuna, Betano,
 * Synot Tip) get honest pages that link to them without affiliate (nofollow) and steer the main CTA to Tipsport —
 * swap `site` for an affiliate /go/ id once Kenny has a programme with them.
 * Facts only, checked on the operators' own sites (20. 10. 2026); no bonus amounts except where Kenny confirmed them.
 */
import { BONUS } from './bonus';

export type BookSlug = 'tipsport' | 'chance' | 'sazka' | 'merkurxtip' | 'fortuna' | 'betano' | 'synottip' | 'betx';
export type Topic = 'tv' | 'aplikace' | 'kontrola-tiketu' | 'bonus' | 'registrace' | 'prihlaseni' | 'kurzy';

export interface BookInfo {
  slug: BookSlug;
  name: string;
  short: string; // bare brand in running text
  gen: string; // genitive: "u Tipsportu", "hráči Allwynu"
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
  more?: string; // optional editorial paragraph (HTML, one external link at most)
}

export const BOOKS: BookInfo[] = [
  {
    slug: 'tipsport', name: 'Tipsport', short: 'Tipsport', gen: 'Tipsportu', full: 'Tipsport a.s.', partner: true, go: 'registrace', site: 'https://www.tipsport.cz', bonus: '1000 Kč', color: '#0b4ea2',
    blurb: 'Největší česká sázková kancelář a největší nabídka živých přenosů. Přenosy jsou po registraci zdarma.',
    pros: ['Nejvíc zápasů s videem (Tipsport TV) – fotbal, hokej, tenis, basketbal, e-sporty', 'Bonus 1000 Kč pro nové hráče', 'Mobilní aplikace a hustá síť poboček', 'Česká licence'],
    cons: ['Video jen po registraci a ověření totožnosti', 'U části zápasů (Chance Liga, NHL) jen statistiky, ne video'],
    watch: 'Přenosy (Tipsport TV) se pouští po přihlášení do účtu. Registrace je bezplatná a trvá několik minut včetně ověření totožnosti.',
    streams: true, branches: true, topics: ['tv', 'aplikace', 'kontrola-tiketu', 'bonus', 'registrace', 'prihlaseni', 'kurzy'],
    more: 'Jak Tipsport obstál v delším testu – od registrace přes výběry po zákaznickou podporu – rozebírá <a href="https://kratkerecenze.cz/recenze-tipsport-cz-nejvetsi-sazkova-kancelar-v-ceske-republice/">nezávislá recenze Tipsportu na KrátkéRecenze.cz</a>.',
  },
  {
    slug: 'chance', name: 'Chance', short: 'Chance', gen: 'Chance', full: 'Chance a.s.', partner: true, go: 'chance', site: 'https://www.chance.cz', bonus: '200 Kč', color: '#0f7a3c',
    blurb: 'Druhá velká česká kancelář na stejné platformě jako Tipsport – stejné zápasy a v našich datech prakticky shodné kurzy na výsledek zápasu. Generální partner Chance Ligy.',
    pros: ['Stejné zápasy a kurzy na výsledek zápasu jako Tipsport', 'Bonus 200 Kč za registraci', 'Mobilní aplikace, pobočky', 'Česká licence'],
    cons: ['Menší síť poboček než Tipsport'],
    watch: 'Stejně jako u Tipsportu se přenos pouští po přihlášení do účtu.',
    streams: true, branches: true, topics: ['tv', 'aplikace', 'kontrola-tiketu', 'bonus', 'registrace', 'prihlaseni', 'kurzy'],
    more: 'Pokud tě u Chance víc zajímá casino, podmínky a free spiny Chance Vegas s datem ověření najdeš na <a href="https://freespiny.eu/casino/chance/">sesterském webu FreeSpiny.eu</a>.',
  },
  {
    slug: 'sazka', name: 'Allwyn (SazkaBet)', short: 'Allwyn', gen: 'Allwynu', full: 'Allwyn a.s. (dříve Sazka)', partner: true, go: 'sazka', site: 'https://www.allwyn.cz', bonus: '500 Kč', color: '#1d6b4f',
    blurb: 'Provozovatel loterií a sázek (dříve Sazka a SazkaBet). Sportka, Eurojackpot i kurzové sázky na jednom účtu.',
    pros: ['Bonus 500 Kč pro nové hráče', 'Loterie a sázky na jednom účtu', 'Největší síť prodejních míst v Česku', 'Česká licence'],
    cons: ['Menší nabídka živých přenosů než Tipsport'],
    watch: 'Program přenosů od Allwynu nemáme; pro sledování zápasů doporučujeme Tipsport.',
    streams: false, branches: true, topics: ['aplikace', 'kontrola-tiketu', 'bonus', 'registrace', 'prihlaseni'],
  },
  {
    slug: 'merkurxtip', name: 'MerkurXtip', short: 'MerkurXtip', gen: 'MerkurXtipu', full: 'MerkurXTip a.s.', partner: true, go: 'merkurxtip', site: 'https://www.merkurxtip.cz', bonus: '500 Kč', color: '#d4001a',
    blurb: 'Online sázková kancelář a casino MerkurXTip a.s. (skupina Merkur), licence MF ČR. Kurzové a live sázky i automaty na jednom účtu.',
    pros: ['Bonus 500 Kč za registraci', 'Kurzové a live sázky i casino na jednom účtu', 'Česká licence'],
    cons: ['Bez přenosů zápasů – pro sledování doporučujeme Tipsport', 'Bez poboček, jen online'],
    watch: 'Program přenosů od MerkurXtipu nemáme; pro sledování zápasů doporučujeme Tipsport.',
    streams: false, branches: false, topics: ['bonus', 'registrace', 'prihlaseni'],
    more: 'Pokud tě u MerkurXtipu víc zajímá casino, aktuální free spiny a bonusy s datem platnosti sleduje <a href="https://spinydnes.cz/casino/merkurxtip/">přehled MerkurXtip casina na SpinyDnes</a>.',
  },
  {
    slug: 'fortuna', name: 'Fortuna', short: 'Fortuna', gen: 'Fortuny', full: 'FORTUNA GAME a.s.', partner: false, site: 'https://www.ifortuna.cz', color: '#f6c400',
    blurb: 'Tradiční česká sázková kancelář (FORTUNA GAME a.s., licence MF ČR) s webem ifortuna.cz, aplikací a zhruba čtyřmi sty prodejnami.',
    pros: ['Velká nabídka kurzových sázek a live sázek', 'Mobilní aplikace', 'Přes 400 prodejen po celé republice'],
    cons: ['Její přenosy a bonusy na SportStreamy nezprostředkujeme – pro sledování zápasů zdarma s bonusem doporučujeme Tipsport'],
    watch: 'Fortuna nabízí živé sázení; pro přehled přenosů a sledování zápasů zdarma používej program na SportStreamy (Tipsport).',
    streams: false, branches: true, topics: ['aplikace', 'kontrola-tiketu', 'bonus', 'registrace', 'prihlaseni'],
  },
  {
    slug: 'betano', name: 'Betano', short: 'Betano', gen: 'Betana', full: 'Betano (betano.cz)', partner: false, site: 'https://www.betano.cz', color: '#ff6a00',
    blurb: 'Mezinárodní sázková značka, v Česku na betano.cz. Známá „Betano žolíky“ a sponzoringem fotbalu.',
    pros: ['Široká nabídka trhů včetně sázek na hráče', 'Akce typu Betano žolík na vybrané zápasy'],
    cons: ['Bez poboček', 'Její bonusy na SportStreamy nezprostředkujeme – alternativou je Tipsport s bonusem 1000 Kč'],
    watch: 'Pro sledování zápasů zdarma používej program na SportStreamy – přenosy vedou k Tipsportu.',
    streams: false, branches: false, topics: ['aplikace', 'bonus', 'registrace', 'prihlaseni'],
  },
  {
    slug: 'synottip', name: 'Synot Tip', short: 'Synot Tip', gen: 'Synot Tipu', full: 'SYNOT TIP, a.s.', partner: false, site: 'https://www.synottip.cz', color: '#c4161c',
    blurb: 'Česká sázková kancelář SYNOT TIP, a.s. z Uherského Hradiště – kurzové a live sázky, casino a mobilní aplikace.',
    pros: ['Kurzové i live sázky', 'Mobilní aplikace'],
    cons: ['Menší nabídka přenosů – pro sledování zápasů doporučujeme Tipsport'],
    watch: 'Pro sledování zápasů zdarma používej program na SportStreamy – přenosy vedou k Tipsportu.',
    streams: false, branches: false, topics: ['aplikace', 'bonus', 'registrace', 'prihlaseni'],
  },
  {
    slug: 'betx', name: 'BetX', short: 'BetX', gen: 'BetXu', full: 'EVONA ELECTRONIC, spol. s r.o. (BetX)', partner: false, site: 'https://bet-x.cz', color: '#6a2cff',
    blurb: 'Česká online kancelář a casino BetX, provozuje EVONA ELECTRONIC, spol. s r.o. (licence MF ČR). Casino a sázky na jednom webu, ověření účtu přes BankID.',
    pros: ['Casino a sázky na jednom webu', 'Ověření účtu přes BankID', 'Česká licence'],
    cons: ['Bez mobilní aplikace, funguje v mobilním prohlížeči', 'Bez přenosů zápasů – pro sledování doporučujeme Tipsport', 'Jen online, bez poboček sázkové kanceláře'],
    watch: 'Program přenosů od BetX nemáme; pro sledování zápasů zdarma používej program na SportStreamy – přenosy vedou k Tipsportu.',
    streams: false, branches: false, topics: ['bonus', 'registrace', 'prihlaseni'],
    more: 'Pokud tě u BetX víc zajímá casino, aktuální bonusy a free spiny s datem ověření sleduje <a href="https://spinydnes.cz/casino/betx/">přehled BetX casina na SpinyDnes</a>.',
  },
];
export const BOOK_BY_SLUG = new Map(BOOKS.map((b) => [b.slug, b]));

/** Bonus small print for a bookmaker (the shared BONUS.terms text is Tipsport's). */
export const bonusTerms = (b: BookInfo) =>
  b.slug === 'tipsport' ? BONUS.terms : `Bonus pro nové hráče ${b.gen} po registraci a ověření účtu. Podmínky stanoví provozovatel. Pouze 18+.`;

/** Where the main CTA of a page about this bookmaker goes. */
export const ctaFor = (b: BookInfo) => (b.partner ? `/go/${b.go}/` : '/go/registrace/');
