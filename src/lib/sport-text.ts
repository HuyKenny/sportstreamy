import type { Sport } from './sports';

/** Short lead under the H1 of a sport page. */
const LEADS: Record<string, string> = {
  fotbal: 'Fotbal online každý den: Chance Liga, Premier League, Liga mistrů i nižší soutěže z celého světa. Vyber zápas a sleduj ho živě.',
  hokej: 'Hokej online – NHL, Tipsport extraliga, Maxa liga a evropské soutěže. Zápasy NHL začínají u nás kolem půlnoci.',
  tenis: 'Tenis online: všechny turnaje ATP, WTA, Challenger a ITF. Na kurtech se hraje souběžně, takže živě běží i desítky zápasů.',
  basketbal: 'Basketbal online – NBA, Euroliga, EuroCup a domácí ligy. NBA se hraje v noci našeho času.',
  volejbal: 'Volejbal online: extraliga, evropské poháry a zahraniční ligy s živým stavem setů.',
  'stolni-tenis': 'Stolní tenis má v programu nejvíc zápasů – turnaje běží od rána do noci a jeden zápas trvá kolem půl hodiny.',
  esporty: 'E-sporty online – Counter-Strike, League of Legends, Dota 2 a další. Turnajové série běží celý den.',
  hazena: 'Házená online: Chance extraliga, Liga mistrů a zahraniční ligy.',
  florbal: 'Florbal online – česká Superliga a zahraniční soutěže.',
};
export const sportLead = (s: Sport) => LEADS[s.slug] ?? `${s.name} online: zápasy s přenosem a živým skóre. Čas začátku a kurzy najdeš u každého utkání.`;

/**
 * Long SEO copy per main sport (HTML). Written for people, current as of the 2026/27 season,
 * no claims that go stale within weeks.
 */
const BODIES: Record<string, string> = {
  fotbal: `
<h2>Kde sledovat fotbal online</h2>
<p>Většinu zápasů, které tu vidíš, vysílá Tipsport svým registrovaným zákazníkům. Stačí bezplatný účet a přihlášení, vsázet nemusíš. U zápasů bez videa (typicky Chance Liga nebo Premier League, kde práva drží televize) nabízí Tipsport aspoň živé statistiky, průběžné skóre a kurzy – na webu je poznáš podle štítku <em>stats</em>.</p>
<h2>Které soutěže najdeš</h2>
<p>Z českého fotbalu sledujeme <a href="/fotbal-online/chance-liga/">Chance Ligu</a> a <a href="/fotbal-online/chance-narodni-liga/">Chance Národní ligu</a>, z evropských pohárů <a href="/fotbal-online/liga-mistru/">Ligu mistrů</a>, <a href="/fotbal-online/evropska-liga/">Evropskou ligu</a> a <a href="/fotbal-online/konferencni-liga/">Konferenční ligu</a>. Z top lig <a href="/fotbal-online/premier-league/">Premier League</a>, <a href="/fotbal-online/la-liga/">La Ligu</a>, <a href="/fotbal-online/bundesliga/">Bundesligu</a>, <a href="/fotbal-online/serie-a/">Serii A</a> a <a href="/fotbal-online/ligue-1/">Ligue 1</a>. K tomu desítky nižších soutěží, kde je video téměř vždy – anglické nižší ligy, Jižní Amerika, Asie.</p>
<h2>Kdy se hraje</h2>
<p>Evropské poháry mají pevné časy: Liga mistrů úterý a středa, Evropská a Konferenční liga čtvrtek, výkopy v 18:45 a 21:00. Ligy se hrají od pátku do pondělí. Jihoamerické zápasy začínají u nás v noci, asijské dopoledne – proto má fotbal živý přenos skoro v každou denní dobu.</p>
<h3>Jak se dostat k přenosu nejrychleji</h3>
<p>Klikni na „Sledovat“ přímo v řádku zápasu. Otevře se stránka zápasu u Tipsportu, kde po přihlášení spustíš přenos. Pokud účet ještě nemáš, registrace trvá pár minut a noví hráči dostávají bonus.</p>`,
  hokej: `
<h2>Kde sledovat hokej online</h2>
<p>Tipsport vysílá velkou část hokejových zápasů – od zahraničních lig po nižší soutěže. U <a href="/hokej-online/tipsport-extraliga/">Tipsport extraligy</a> a <a href="/hokej-online/nhl/">NHL</a>, kde práva drží televize, najdeš u Tipsportu živé statistiky, průběžné skóre a kurzy.</p>
<h2>NHL v českém čase</h2>
<p>Zápasy NHL začínají u nás většinou mezi 0:00 a 2:00 v noci, víkendová matiné kolem 19:00 a 21:00. Program na noc najdeš už večer v <a href="/program/zitra/">programu na zítřek</a>, časy jsou vždy přepočítané na středoevropský čas.</p>
<h2>Česká a evropská soutěže</h2>
<p>Extraliga se hraje v úterý, pátek a neděli, většinou od 17:30 nebo 18:00. Druhá liga – <a href="/hokej-online/maxa-liga/">Maxa liga</a> – má zápasy ve středu a v sobotu. Ze zahraničí sledujeme švédskou, finskou, švýcarskou a slovenskou ligu, kde je video k dispozici častěji.</p>`,
  tenis: `
<h2>Kde sledovat tenis online</h2>
<p>Tenis je sport s největší nabídkou živého videa. Tipsport vysílá turnaje <a href="/tenis-online/atp/">ATP</a>, <a href="/tenis-online/wta/">WTA</a>, Challengery i ITF – na velkých turnajích běží souběžně desítky zápasů.</p>
<h2>Jak se v programu vyznat</h2>
<p>Turnaje mají v názvu město a povrch (antuka, tvrdý povrch, tráva), čtyřhra je označená „4hra“. Časy jsou orientační: tenisový zápas začíná až po skončení předchozího na stejném kurtu, takže se může posunout. Proto u živých zápasů ukazujeme stav setů a gamů, který se obnovuje každých 30 sekund.</p>
<h3>České tenistky a tenisté</h3>
<p>Zápasy Čechů najdeš nejrychleji přes hledání v hlavičce – napiš příjmení a uvidíš všechny jejich zápasy v nabídce.</p>`,
  basketbal: `
<h2>Kde sledovat basketbal online</h2>
<p>Basketbal má u Tipsportu video hlavně u evropských soutěží – EuroCup, Liga mistrů FIBA, francouzská, španělská a čínská liga. U <a href="/basketbal-online/nba/">NBA</a> najdeš živé skóre po čtvrtinách a kurzy.</p>
<h2>NBA v noci</h2>
<p>Zápasy NBA začínají u nás mezi 1:00 a 4:30 ráno, nedělní utkání občas už večer. Program na noc je k dispozici v <a href="/program/zitra/">programu na zítřek</a>.</p>`,
  volejbal: `
<h2>Kde sledovat volejbal online</h2>
<p>Volejbalové přenosy u Tipsportu pokrývají extraligu, Ligu mistrů a silné zahraniční ligy – Itálii, Polsko, Francii, Brazílii. U živých zápasů vidíš průběžný stav setů.</p>
<p>Zápasy se hrají hlavně ve středu a o víkendu, v Asii a Jižní Americe i v nočních hodinách našeho času.</p>`,
  'stolni-tenis': `
<h2>Stolní tenis online</h2>
<p>Stolní tenis má v programu nejvíc zápasů ze všech sportů. Turnaje Setka Cup, TT Elite Series nebo Czech Liga Pro se hrají nepřetržitě od rána do noci a zápas trvá kolem 30 minut, takže živý přenos najdeš prakticky kdykoli.</p>`,
  esporty: `
<h2>E-sporty online</h2>
<p>E-sportové turnaje v Counter-Strike 2, League of Legends, Dota 2 nebo Valorantu běží v sériích na dvě až pět map. Video bývá u velkých turnajů i u kvalifikací, mezi zápasy jsou krátké pauzy.</p>`,
};
export const sportBody = (s: Sport) => BODIES[s.slug] ?? '';

export const sportFaq = (s: Sport, hasLive: boolean) => [
  { q: `Kde sledovat ${s.name.toLowerCase()} online zdarma?`, a: 'Na této stránce je program i zápasy, které právě běží. Tlačítko „Sledovat“ tě přesune na zápas u Tipsportu, kde po bezplatné registraci a přihlášení spustíš přenos. Vsázet nemusíš.' },
  { q: 'Běží teď nějaký přenos?', a: hasLive ? 'Ano – zápasy s červenou tečkou „Živě“ právě běží. Skóre se obnovuje každých 30 sekund.' : 'Právě teď žádný neběží. Nejbližší začátky jsou v programu, stránka se aktualizuje každých pár minut.' },
  { q: 'Proč má některý zápas štítek „stats“?', a: 'U zápasů, ke kterým má televizní práva někdo jiný, Tipsport video nevysílá, ale nabízí živé statistiky, průběžné skóre a kurzy.' },
  { q: 'Jsou přenosy opravdu zdarma?', a: 'Sledování je pro registrované zákazníky provozovatele bezplatné. Případné sázky jsou dobrovolné a pouze pro osoby od 18 let.' },
];

/** Sports that get a "/{sport}-dnes/" landing page (search demand: hokej dnes 62k, fotbal dnes 45k, tenis dnes 11k…). */
export const TODAY_SPORTS = new Set(['fotbal', 'hokej', 'tenis', 'basketbal', 'volejbal', 'sipky']);

/** When things usually happen on a given day, per sport — evergreen, no dates that go stale. */
const TODAY_LEADS: Record<string, string> = {
  fotbal: 'Všechny dnešní fotbalové zápasy na jednom místě – od dopoledních asijských lig přes evropské večery až po noční Jižní Ameriku. U každého zápasu je čas výkopu, soutěž, kurzy a odkaz na přímý přenos.',
  hokej: 'Dnešní hokej v přehledu: Tipsport extraliga začíná většinou v 17:30 nebo 18:00, evropské ligy odpoledne a večer, NHL v noci našeho času. Klikni na zápas a sleduj ho živě.',
  tenis: 'Dnešní tenisový program ATP, WTA, Challengerů i ITF. Časy jsou orientační – zápas začíná po skončení předchozího na kurtu – a živě běží stav setů.',
  basketbal: 'Dnešní basketbal: evropské poháry a ligy večer, NBA v noci našeho času.',
  volejbal: 'Dnešní volejbalové zápasy – ligy, evropské poháry a reprezentace s průběžným stavem setů.',
  sipky: 'Dnešní šipkařské zápasy – turnaje PDC i ligové večery s živými výsledky.',
};
export const todayLead = (s: Sport) => TODAY_LEADS[s.slug] ?? `${s.name} dnes – zápasy s přenosem a živým skóre.`;

export const todayFaq = (s: Sport, n: number) => [
  { q: `Kde sledovat ${s.genitive === 'fotbalu' ? 'fotbal' : s.name.toLowerCase()} dnes?`, a: n ? `Dnes je v nabídce ${n} zápasů. Klikni na „Sledovat“ u zápasu – přenos se otevře u Tipsportu, kde po bezplatné registraci a přihlášení běží zdarma.` : 'Dnes už žádný zápas nezbývá. Program na zítřek najdeš přes odkaz pod seznamem.' },
  { q: `Dávají dnes ${s.genitive === 'fotbalu' ? 'fotbal' : s.name.toLowerCase()} v televizi?`, a: 'Televizní program nesledujeme. Zápasy na této stránce vysílá online Tipsport svým zákazníkům – sleduješ je v mobilu nebo počítači bez televize.' },
  { q: 'V kolik zápasy začínají?', a: 'Všechny časy jsou v českém čase. U zápasů, které právě běží, svítí červená tečka „Živě“ a skóre se obnovuje každých 30 sekund.' },
];
