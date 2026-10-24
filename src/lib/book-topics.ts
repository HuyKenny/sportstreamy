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
  prihlaseni: 'Přihlášení',
  kurzy: 'Kurzy dnes',
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
          { h: `Přihlas se u ${b.slug === 'chance' ? 'Chance' : 'Tipsportu'}`, p: 'Bez účtu přenos nespustíš – provozovatel s českou licencí smí vysílat jen ověřeným zákazníkům starším 18 let.' },
          { h: 'Spusť přenos', p: 'Na stránce zápasu klikni na přehrávač. Video běží v prohlížeči i v mobilní aplikaci.' },
        ],
        body: [
          { h: 'Co je potřeba', p: `Bezplatný účet u ${b.slug === 'chance' ? 'Chance' : 'Tipsportu'} s ověřenou totožností. Některé zápasy vyžadují kladný zůstatek na účtu nebo vsazení – podmínky konkrétního přenosu ukáže přehrávač.` },
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
        lead: `Oficiální aplikace ${b.gen} pro Android a iPhone: sázení, live sázky${b.streams ? ', živé přenosy' : ''} a správa účtu v telefonu.`,
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
        lead: `Jak zjistit, jestli tiket ${b.gen} vyhrál – online tiket v účtu i papírový tiket z pobočky.`,
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
          { q: 'Musí se výhra danit?', a: 'U kurzových sázek je osvobozený roční rozdíl výher a vkladů do 50 000 Kč; co je nad, uvádíš v daňovém přiznání. Podrobnosti v článku Daň z výhry ze sázek.' },
        ],
      };
    case 'bonus':
      return {
        title: b.bonus ? `${n} bonus ${b.bonus} – jak ho získat` : `${n} promo kód a bonus – jak to funguje`,
        h1: b.bonus ? `${n} bonus ${b.bonus}` : `${n} promo kód a bonus`,
        lead: b.bonus
          ? `Noví hráči ${b.gen} dostanou po registraci a ověření účtu bonus ${b.bonus}. ${b.slug === 'tipsport' ? bonusTerms(b) : 'Podmínky stanoví provozovatel. Pouze 18+.'}`
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
          { q: b.bonus ? `Kolik je bonus u ${b.gen}?` : `Kde najdu ${n} promo kód?`, a: b.bonus ? `${b.bonus} pro nové hráče po registraci a ověření účtu. Podmínky stanoví provozovatel.` : `Aktuální promo kód zveřejňuje ${n} na svém webu a v aplikaci. Pozor na weby, které nabízejí „tajné“ kódy – často neplatí.` },
          { q: 'Můžu bonus vybrat hned?', a: 'Ne, bonus je potřeba nejdřív protočit podle podmínek provozovatele.' },
        ],
      };
    case 'prihlaseni': {
      const dom = b.site.replace('https://www.', '').replace('https://', '');
      const reg = b.partner ? `Nemáš účet? Registrace trvá pár minut${b.bonus ? ` a noví hráči dostanou bonus ${b.bonus}` : ''}.` : `Nemáš účet? ${n} bonus přes SportStreamy nezprostředkujeme, nejbližší alternativou je Tipsport s bonusem ${BONUS.amount}.`;
      const app = b.topics.includes('aplikace');
      return {
        title: `${n} přihlášení – postup a když nejde přihlásit`,
        h1: `${n} přihlášení do účtu`,
        lead: `Jak se přihlásit do ${b.gen} na webu${app ? ' i v mobilní aplikaci' : ''}, co dělat se zapomenutým heslem a proč přihlášení někdy nejde. ${reg}`,
        steps: [
          { h: 'Otevři oficiální web', p: `Zadej adresu ${dom} přímo do prohlížeče nebo použij odkaz „Web ${n}“ na této stránce. Nepřihlašuj se přes odkazy z reklam, e-mailů nebo SMS od neznámých odesílatelů.` },
          { h: 'Klikni na Přihlásit', p: 'Tlačítko je v horní liště webu. Zadej přihlašovací údaje, které jsi zvolil při registraci.' },
          { h: 'Potvrď ověření, pokud o něj web žádá', p: 'Má-li účet zapnuté dvoufázové ověření nebo web zjistí nové zařízení, zadej kód z SMS nebo z aplikace.' },
          ...(app ? [{ h: 'V aplikaci stejné údaje', p: 'Do oficiální aplikace se přihlásíš stejným jménem a heslem jako na webu. Účet je jeden, jen ho otevřeš na dvou zařízeních.' }] : []),
        ],
        body: [
          { h: 'Zapomenuté heslo', p: 'Na přihlašovací obrazovce použij odkaz pro obnovení hesla. Pokyny dorazí na e-mail nebo telefon uvedený u účtu. Pokud k nim už přístup nemáš, napiš zákaznické podpoře provozovatele a připrav si doklad totožnosti.' },
          { h: 'Nejde se přihlásit: špatné údaje', p: 'Nejčastější příčina jsou překlepy, zapnutý Caps Lock nebo staré heslo uložené v prohlížeči. Zkus údaje zadat ručně, případně si nech poslat nové heslo.' },
          { h: 'Nejde se přihlásit: nedokončená registrace', p: `Účet bez ověřené totožnosti má omezené funkce. ${n} je jako provozovatel s českou licencí povinen ověřit věk a totožnost hráče, bez toho nelze sázet ani sledovat přenosy.` },
          { h: 'Nejde se přihlásit: blokovaný nebo uzavřený účet', p: 'Účet může být dočasně omezen kvůli bezpečnosti, nastavené pauze nebo sebevyloučení. Kdo je zapsán v rejstříku vyloučených osob Ministerstva financí, nesmí u licencovaných provozovatelů hrát. O stavu účtu rozhoduje provozovatel, napiš jeho podpoře.' },
          { h: 'Nejde se přihlásit: výpadek nebo údržba', p: 'Web i aplikace mají občas plánovanou údržbu nebo krátký výpadek. Zkus jiný prohlížeč, anonymní okno nebo za chvíli aplikaci znovu. Pomůže i aktualizace aplikace.' },
          { h: 'Bezpečné přihlášení', p: `Přihlašuj se jen na oficiální doméně ${dom}. Podvodné stránky napodobují vzhled sázkových kanceláří a vylákají heslo. Nikdy nikomu nesděluj heslo ani kód z SMS, ani když se někdo představí jako podpora.` },
        ],
        faq: [
          { q: `Jak se přihlásím do ${b.gen}?`, a: `Na webu ${dom}${app ? ' nebo v oficiální aplikaci' : ''} klikni na Přihlásit a zadej údaje z registrace. Bez dokončeného ověření účtu budou funkce omezené.` },
          { q: 'Zapomněl jsem heslo, co teď?', a: 'Na přihlašovací obrazovce zvol obnovení hesla. Odkaz nebo kód přijde na e-mail či telefon uvedený u účtu.' },
          { q: `Proč se nemůžu přihlásit do ${b.gen}?`, a: 'Nejčastěji jde o překlep v údajích, nedokončené ověření účtu, omezení účtu nebo krátký výpadek webu. Zkus obnovit heslo a jiný prohlížeč, a pokud problém trvá, kontaktuj podporu provozovatele.' },
          { q: `Dá se do ${b.gen} přihlásit bez registrace?`, a: 'Ne. Přihlásit se lze jen do existujícího účtu. Nabídku kurzů si obvykle prohlédneš i bez účtu, ale vsadit nebo sledovat přenos můžeš až po registraci a ověření totožnosti.' },
          { q: 'Je přihlášení na tomto webu bezpečné?', a: `Na SportStreamy se do ${b.gen} nepřihlašuješ a hesla od nás nikdo nechce. Odkaz „Web ${n}“ tě pošle na oficiální stránku provozovatele.` },
        ],
      };
    }
    case 'kurzy': {
      const chance = b.slug === 'chance';
      return {
        title: `${n} kurzy dnes – fotbal, hokej, tenis`,
        h1: `${n} kurzy dnes`,
        lead: `Aktuální kurzy ${b.gen} na dnešní a nejbližší zápasy: fotbal, hokej, tenis, basketbal a další sporty. U každého zápasu kurz na výhru domácích (1), remízu (X) a výhru hostů (2).`,
        steps: [
          { h: 'Vyber zápas', p: 'Pod tímto textem jsou zápasy seřazené podle sportu a času. Kurzy se načítají z nabídky kanceláře a během dne se mění.' },
          { h: `Otevři zápas u ${b.gen}`, p: 'Tlačítko Sledovat nebo Statistiky tě přesune na zápas v nabídce. Konečný kurz platí ten, který vidíš v účtu v okamžiku vsazení.' },
          { h: 'Zvol tip a vklad', p: 'Kurz vynásob vkladem a dostaneš celkovou výplatu: při kurzu 2,50 a vkladu 100 Kč je to 250 Kč (výhra 150 Kč). Vsázej jen to, co si můžeš dovolit prohrát.' },
        ],
        body: [
          { h: 'Jak číst kurzy', p: 'Kurz 1 platí na výhru domácího týmu, X na remízu a 2 na výhru hosta. U sportů bez remízy, třeba u tenisu, jsou jen kurzy 1 a 2. Čím nižší kurz, tím větší favorit podle kanceláře.' },
          { h: 'Jak z kurzu poznat šanci', p: 'Převrácená hodnota kurzu je implikovaná pravděpodobnost: kurz 2,00 odpovídá 50 %, kurz 4,00 odpovídá 25 %. Součet všech tří kurzů vyjde nad 100 % a ten přebytek je marže kanceláře. Podrobně v článku o kurzech 1X2.' },
          { h: chance ? 'Chance a Tipsport' : 'Tipsport a Chance', p: 'Obě kanceláře jsou na stejné platformě. V našich datech jsou kurzy na výsledek zápasu u drtivé většiny zápasů shodné, rozdíl bývá u speciálních sázek, bonusů a podmínek. Proto má smysl porovnávat spíš nabídku, přenosy a bonus než kurz 1X2.' },
          { h: 'Kdy se kurzy mění', p: 'Kurzy se upravují podle zájmu sázejících, zranění, sestav nebo počasí. Před zápasem se hýbou pomalu, během zápasu (live sázky) vteřinu po vteřině. Naše tabulka je přehled, rozhodující je vždy kurz v tiketu.' },
        ],
        faq: [
          { q: `Kde najdu aktuální kurzy ${b.gen}?`, a: `Na této stránce vidíš kurzy na dnešní zápasy, kompletní nabídku najdeš po přihlášení na ${b.site.replace('https://www.', '').replace('https://', '')} nebo v aplikaci.` },
          { q: 'Proč se kurzy během dne mění?', a: 'Kanceláře kurzy průběžně upravují podle sázek, zpráv o týmech a vývoje zápasu. Na tiketu platí kurz z okamžiku, kdy ho podáš.' },
          { q: `Jsou kurzy u ${b.gen} stejné jako u ${chance ? 'Tipsportu' : 'Chance'}?`, a: 'Na výsledek zápasu (1X2) jsou u našich zápasů téměř vždy shodné, protože obě kanceláře používají stejnou platformu. Liší se bonusy, aplikace a doplňkové sázky.' },
          { q: 'Co znamená kurz 1,50?', a: 'Při vkladu 100 Kč a výhře dostaneš zpět 150 Kč, tedy 50 Kč čistého zisku. Kurz 1,50 odpovídá zhruba 67 % šanci podle kanceláře.' },
        ],
      };
    }
    case 'registrace':
      return {
        title: `${n} registrace a ověření účtu – postup`,
        h1: `Registrace u ${b.gen}`,
        lead: `Jak si založit účet u ${b.gen} a ověřit totožnost – zabere to pár minut.${alt}`,
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
