import { bonusTerms, type BookInfo, type Topic } from './books';
import { BONUS } from './bonus';

/**
 * Copy for /sazkove-kancelare/{book}/{topic}/ — the task people search for ("tipsport tv" 11k, "tipsport aplikace" 7.8k,
 * "betano promo kód" 3.3k, "tipsport kontrola tiketu" 1.6k…). Written generically enough to stay true when an operator
 * redesigns its app, specific enough to answer the query. No invented promo codes or amounts.
 */
export interface TopicPage {
  title: string; // <title> without the brand suffix
  h1: string;
  lead: string;
  steps?: { h: string; p: string }[];
  body: { h: string; p: string }[];
  faq: { q: string; a: string }[];
}

export const TOPIC_LABEL: Record<Topic, string> = {
  tv: 'TV a přenosy',
  aplikace: 'Aplikace',
  'kontrola-tiketu': 'Kontrola tiketu',
  bonus: 'Bonus',
  registrace: 'Registrace',
};

export function topicPage(b: BookInfo, t: Topic): TopicPage {
  const n = b.short;
  const alt = b.partner ? '' : ` Pokud chceš bonus přes SportStreamy, nejbližší alternativou je Tipsport s bonusem ${BONUS.amount}.`;
  switch (t) {
    case 'tv':
      return {
        title: `${n} TV – živé přenosy zdarma, jak sledovat`,
        h1: `${n} TV: jak sledovat přenosy zdarma`,
        lead: `${n} vysílá živé přenosy svým registrovaným zákazníkům – fotbal, hokej, tenis, basketbal, e-sporty a desítky dalších soutěží. Sledování je zdarma, vsázet nemusíš.`,
        steps: [
          { h: 'Vyber zápas', p: 'Níže jsou zápasy, které mají právě teď nebo dnes video. Celý program najdeš v sekci Program.' },
          { h: `Přihlas se u ${n === 'Chance' ? 'Chance' : 'Tipsportu'}`, p: 'Bez účtu přenos nespustíš – provozovatel s českou licencí smí vysílat jen ověřeným zákazníkům starším 18 let.' },
          { h: 'Spusť přenos', p: 'Na stránce zápasu klikni na přehrávač. Video běží v prohlížeči i v mobilní aplikaci.' },
        ],
        body: [
          { h: 'Co je potřeba', p: `Bezplatný účet u ${n === 'Chance' ? 'Chance' : 'Tipsportu'} s ověřenou totožností. Některé zápasy vyžadují kladný zůstatek na účtu nebo vsazení – podmínky konkrétního přenosu ukáže přehrávač.` },
          { h: 'Které zápasy jsou s videem', p: 'Nejvíc videa je u tenisu, nižších fotbalových soutěží, evropského hokeje, basketbalu a e-sportů. Zápasy, ke kterým drží práva televize (Chance Liga, Premier League, NHL), mají jen živé statistiky – u nás je poznáš podle štítku „stats“.' },
          { h: 'Na čem to funguje', p: 'V prohlížeči na počítači i v mobilu a v oficiální aplikaci. Na televizi lze přenos zrcadlit z telefonu nebo počítače.' },
        ],
        faq: [
          { q: `Je ${n} TV zdarma?`, a: 'Pro registrované zákazníky ano. Účet je bezplatný, sázení je dobrovolné a jen pro osoby od 18 let.' },
          { q: `Proč mi ${n} TV nejde přehrát?`, a: 'Nejčastěji chybí přihlášení nebo dokončené ověření účtu. U některých zápasů se video nevysílá kvůli televizním právům.' },
          { q: 'Kde najdu dnešní zápasy s videem?', a: 'Na této stránce a v Programu na SportStreamy – každý zápas s videem má tlačítko Sledovat.' },
        ],
      };
    case 'aplikace':
      return {
        title: `${n} aplikace – stažení pro Android a iOS`,
        h1: `${n} aplikace pro mobil`,
        lead: `Oficiální aplikace ${n === 'Allwyn' ? 'Allwynu' : n} pro Android a iPhone: sázení, live sázky${b.streams ? ', živé přenosy' : ''} a správa účtu v telefonu.`,
        steps: [
          { h: 'Stáhni aplikaci', p: `Na iPhonu z App Store, na Androidu z Google Play nebo přímo z webu ${b.site.replace('https://', '')}. Instaluj jen oficiální aplikaci provozovatele.` },
          { h: 'Přihlas se nebo se zaregistruj', p: 'Přihlašovací údaje jsou stejné jako na webu. Nový účet je potřeba ověřit (totožnost, věk 18+).' },
          { h: 'Zapni oznámení', p: 'Aplikace umí upozornit na začátek zápasu nebo na vyhodnocený tiket.' },
        ],
        body: [
          { h: 'Co aplikace umí', p: `Kurzové a live sázky, vklady a výběry, historie tiketů${b.streams ? ', živé přenosy zápasů' : ''} a nastavení limitů zodpovědného hraní.` },
          { h: 'Bezpečnost', p: 'Stahuj jen z oficiálních obchodů nebo webu provozovatele. Aplikace z neznámých zdrojů mohou být podvržené.' },
        ],
        faq: [
          { q: `Je ${n} aplikace zdarma?`, a: 'Ano, stažení i používání aplikace je zdarma.' },
          { q: 'Funguje aplikace i bez registrace?', a: 'Prohlížet nabídku obvykle jde, sázet a sledovat přenosy jen s ověřeným účtem.' },
        ],
      };
    case 'kontrola-tiketu':
      return {
        title: `${n} kontrola tiketu – jak zkontrolovat tiket`,
        h1: `Kontrola tiketu ${n}`,
        lead: `Jak zjistit, jestli tiket ${n === 'Allwyn' ? 'Allwynu' : n} vyhrál – online tiket v účtu i papírový tiket z pobočky.`,
        steps: [
          { h: 'Online tiket', p: 'Přihlas se na webu nebo v aplikaci a otevři historii tiketů. Vyhodnocené tikety mají stav výhra/prohra a výhra se připíše na účet.' },
          { h: 'Tiket z pobočky', p: `Na webu ${b.site.replace('https://', '')} najdeš formulář pro kontrolu tiketu – zadej číslo tiketu (případně kontrolní kód z tiketu). Výhru vyzvedneš na pobočce.` },
          { h: 'Výhra', p: 'Výhry z online tiketů jdou na účet automaticky, papírové tikety se vyplácejí na pobočce podle pravidel provozovatele.' },
        ],
        body: [
          { h: 'Kdy se tiket vyhodnotí', p: 'Obvykle krátce po skončení posledního zápasu na tiketu. U odložených nebo zrušených zápasů platí pravidla provozovatele (často kurz 1,00).' },
        ],
        faq: [
          { q: 'Jak dlouho mám na vyzvednutí výhry?', a: 'Lhůtu určují herní pravidla provozovatele – najdeš je na jeho webu v sekci pravidel.' },
          { q: 'Musí se výhra danit?', a: 'Výhry nad 50 000 Kč od jednoho provozovatele za rok podléhají dani z příjmů. Podrobnosti v článku Daň z výhry ze sázek.' },
        ],
      };
    case 'bonus':
      return {
        title: b.bonus ? `${n} bonus ${b.bonus} – jak ho získat` : `${n} promo kód a bonus – jak to funguje`,
        h1: b.bonus ? `${n} bonus ${b.bonus}` : `${n} promo kód a bonus`,
        lead: b.bonus
          ? `Noví hráči ${n === 'Tipsport' ? 'Tipsportu' : n === 'Allwyn' ? 'Allwynu' : n} dostanou po registraci a ověření účtu bonus ${b.bonus}. ${bonusTerms(b)}`
          : `${n} nabízí novým i stávajícím hráčům bonusy a akce, které se často mění. Aktuální promo kód a podmínky najdeš vždy na webu ${b.site.replace('https://', '')} – žádné vymyšlené kódy tu neuvádíme.${alt}`,
        steps: b.bonus
          ? [
              { h: 'Registrace přes náš odkaz', p: 'Bonus je navázaný na registraci nového účtu přes partnerský odkaz.' },
              { h: 'Ověření totožnosti', p: 'Bonus se aktivuje po ověření účtu – trvá obvykle pár minut.' },
              { h: 'Splň podmínky', p: 'Podmínky (protočení, lhůta) stanoví provozovatel a mohou se měnit; vždy si je přečti na jeho stránce.' },
            ]
          : [
              { h: 'Zjisti aktuální akci', p: `Na webu ${n} v sekci akcí/bonusů je aktuální vstupní bonus a případný promo kód.` },
              { h: 'Zadej kód při registraci', p: 'Promo kód se většinou zadává do registračního formuláře nebo v profilu do určité lhůty.' },
              { h: 'Přečti si podmínky', p: 'Bonusy mají podmínky protočení a lhůty – bez jejich splnění nejde bonus vybrat.' },
            ],
        body: [
          { h: 'Na co si dát pozor', p: 'Bonus je určený jen novým hráčům starším 18 let a jeden člověk ho může získat jen jednou. Nesázej víc, než si můžeš dovolit prohrát.' },
        ],
        faq: [
          { q: b.bonus ? `Kolik je bonus u ${n === 'Tipsport' ? 'Tipsportu' : n}?` : `Kde najdu ${n} promo kód?`, a: b.bonus ? `${b.bonus} pro nové hráče po registraci a ověření účtu. Podmínky stanoví provozovatel.` : `Aktuální promo kód zveřejňuje ${n} na svém webu a v aplikaci. Pozor na weby, které nabízejí „tajné“ kódy – často neplatí.` },
          { q: 'Můžu bonus vybrat hned?', a: 'Ne, bonus je potřeba nejdřív protočit podle podmínek provozovatele.' },
        ],
      };
    case 'registrace':
      return {
        title: `${n} registrace a ověření účtu – postup`,
        h1: `Registrace u ${n === 'Allwyn' ? 'Allwynu' : n}`,
        lead: `Jak si založit účet u ${n === 'Allwyn' ? 'Allwynu' : n} a ověřit totožnost – zabere to pár minut.${alt}`,
        steps: [
          { h: 'Vyplň registraci', p: 'Jméno, rodné číslo, adresa, e-mail a telefon. Registrace je jen pro osoby starší 18 let.' },
          { h: 'Ověř totožnost', p: 'Nejrychleji přes bankovní identitu, případně nahráním dokladu nebo ověřovací platbou z vlastního účtu.' },
          { h: 'Nastav limity', p: 'Zákon vyžaduje nastavení limitů sázek a vkladů – zvol rozumné hodnoty.' },
        ],
        body: [
          { h: 'Proč je ověření povinné', p: 'Provozovatelé s českou licencí musí ze zákona ověřit totožnost a věk hráče. Bez ověření nelze sázet ani sledovat přenosy.' },
        ],
        faq: [
          { q: 'Je registrace zdarma?', a: 'Ano. Vklad není při registraci povinný.' },
          { q: 'Můžu mít účet u více kanceláří?', a: 'Ano, u každé licencované kanceláře si můžeš založit vlastní účet.' },
        ],
      };
  }
}
