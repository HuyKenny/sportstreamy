import { slugify } from './text';

/**
 * Curated competitions: stable landing pages (exist even when nothing is scheduled, so the URL never 404s)
 * and a whitelist that keeps their matches on the site although Tipsport has no video for them.
 * `match` is tested against Tipsport's nameCompetition.
 */
export interface Competition {
  slug: string;
  name: string; // our display name (what people search for)
  sp: number; // idSuperSport
  match: RegExp;
  short: string; // 2–3 letter badge
  color: string; // badge background
  intro: string;
  top?: boolean; // shown in "Populární soutěže"
  guide?: { href: string; label: string }; // evergreen "how to watch" guide linked from the competition page
}

export const COMPETITIONS: Competition[] = [
  { slug: 'chance-liga', name: 'Chance Liga', sp: 16, match: /^Česká Chance Liga$/, short: 'CL', color: '#1f6f43', top: true,
    intro: 'Chance Liga je nejvyšší česká fotbalová soutěž. Hraje se od pátku do pondělí, nejsledovanější zápasy Slavie, Sparty a Plzně bývají v neděli odpoledne a večer. U každého kola tu najdeš časy výkopů, kurzy a odkaz na zápas.' },
  { slug: 'chance-narodni-liga', name: 'Chance Národní liga', sp: 16, match: /^Česká Chance Národní Liga$/, short: 'CNL', color: '#2d5a3d',
    intro: 'Chance Národní liga je druhá nejvyšší česká fotbalová soutěž. Zápasy se hrají většinou o víkendu dopoledne a odpoledne.' },
  { slug: 'liga-mistru', name: 'Liga mistrů', sp: 16, match: /^Liga mistrů$/, short: 'LM', color: '#1b2a6b', top: true,
    intro: 'Liga mistrů UEFA je nejprestižnější klubová soutěž Evropy. Zápasy ligové fáze se hrají v úterý a ve středu, výkopy jsou v 18:45 a ve 21:00.' },
  { slug: 'evropska-liga', name: 'Evropská liga', sp: 16, match: /^Evropská liga$/, short: 'EL', color: '#b25a00', top: true,
    intro: 'Evropská liga UEFA se hraje ve čtvrtek ve dvou blocích, v 18:45 a ve 21:00. Pravidelně v ní startují i české kluby.' },
  { slug: 'konferencni-liga', name: 'Konferenční liga', sp: 16, match: /^Konferenční liga$/, short: 'KL', color: '#1f7a6d', top: true,
    intro: 'Konferenční liga UEFA je třetí evropský pohár. Hraje se ve čtvrtek a české týmy v ní mají velkou šanci postupovat.' },
  { slug: 'premier-league', name: 'Premier League', sp: 16, match: /^1\. anglická liga$/, short: 'PL', color: '#3d0e4f', top: true,
    intro: 'Premier League je nejsledovanější fotbalová liga světa. Většina kol se hraje v sobotu odpoledne, šlágry v neděli a vybrané zápasy v pondělí večer.' },
  { slug: 'championship', name: 'Championship', sp: 16, match: /^2\. anglická liga$/, short: 'EFL', color: '#3a3f73',
    intro: 'Championship je druhá anglická liga s 24 týmy a nabitým programem včetně středečních kol.' },
  { slug: 'la-liga', name: 'La Liga', sp: 16, match: /^1\. španělská liga$/, short: 'LL', color: '#8a1c1c', top: true,
    intro: 'Španělská La Liga – Real Madrid, Barcelona, Atlético. Zápasy začínají často až ve 21:00 našeho času.' },
  { slug: 'bundesliga', name: 'Bundesliga', sp: 16, match: /^1\. německá liga$/, short: 'BL', color: '#a3141b', top: true,
    intro: 'Německá Bundesliga se hraje hlavně v sobotu v 15:30, šlágr kola začíná v 18:30.' },
  { slug: 'serie-a', name: 'Serie A', sp: 16, match: /^1\. italská liga$/, short: 'SA', color: '#0b4f8a', top: true,
    intro: 'Italská Serie A má zápasy rozložené od pátku do pondělí, večerní utkání startují ve 20:45.' },
  { slug: 'ligue-1', name: 'Ligue 1', sp: 16, match: /^1\. francouzská liga$/, short: 'L1', color: '#24335c',
    intro: 'Francouzská Ligue 1 – PSG, Marseille, Lyon. Hlavní zápasy kola jsou v neděli večer.' },
  { slug: 'nike-liga', name: 'Niké liga', sp: 16, match: /^1\. slovenská liga$/, short: 'NL', color: '#264d8c',
    intro: 'Slovenská Niké liga, nejvyšší fotbalová soutěž na Slovensku.' },
  // Slovak second tier and the Slovak handball/volleyball/hockey leagues: results for ziveprenosy.sk (shared D1).
  { slug: '2-slovenska-liga', name: '2. slovenská liga', sp: 16, match: /^2\. slovenská liga$/, short: '2SK', color: '#3a6fb8',
    intro: 'Druhá nejvyšší slovenská fotbalová soutěž.' },
  { slug: 'nhl', name: 'NHL', sp: 23, match: /^NHL$/, short: 'NHL', color: '#111111', top: true,
    intro: 'NHL je nejlepší hokejová liga světa a hraje v ní řada Čechů. Zápasy začínají u nás obvykle mezi půlnocí a druhou hodinou ranní, víkendové matiné kolem 19:00.' },
  { slug: 'tipsport-extraliga', name: 'Tipsport extraliga', sp: 23, match: /^Česká Tipsport extraliga$/, short: 'TE', color: '#0f3d7a', top: true,
    intro: 'Tipsport extraliga je nejvyšší česká hokejová soutěž. Hraje se v úterý, pátek a neděli, nejčastěji od 17:30 a 18:00.' },
  { slug: 'maxa-liga', name: 'Maxa liga', sp: 23, match: /^Česká Maxa liga$/, short: 'ML', color: '#5b3a8a',
    intro: 'Maxa liga je druhá nejvyšší česká hokejová soutěž.' },
  { slug: 'slovenska-extraliga', name: 'Tipos extraliga', sp: 23, match: /^Slovenská Tipsport liga$/, short: 'SK', color: '#1d4e89',
    intro: 'Nejvyšší slovenská hokejová soutěž.' },
  { slug: 'slovenska-1-liga-hokej', name: '1. slovenská hokejová liga', sp: 23, match: /^Slovensk\S* 1\. ?liga/, short: '1SK', color: '#3a6fb8',
    intro: 'Druhá nejvyšší slovenská hokejová soutěž.' },
  { slug: 'nba', name: 'NBA', sp: 7, match: /^NBA$/, short: 'NBA', color: '#17408b', top: true,
    intro: 'NBA se kvůli časovému posunu hraje v noci našeho času. Program na další den najdeš už večer předem.' },
  { slug: 'euroliga', name: 'Euroliga', sp: 7, match: /^Euroliga$/, short: 'EUR', color: '#e2561b',
    intro: 'Euroliga je nejvyšší evropská basketbalová soutěž, hraje se ve čtvrtek a v pátek večer.' },
  // Grand Slams before ATP/WTA: competitionOf() takes the first match, so their matches land on the tournament page.
  { slug: 'wimbledon', name: 'Wimbledon', sp: 43, match: /Wimbledon/, short: 'W', color: '#2f5d32',
    intro: 'Wimbledon je nejstarší a nejprestižnější tenisový turnaj, hraje se na trávě v Londýně od konce června do poloviny července. Během turnaje tu najdeš všechny zápasy s časem, kurzy a odkazem na přenos.' },
  { slug: 'roland-garros', name: 'Roland Garros', sp: 43, match: /Roland|French Open/, short: 'RG', color: '#b4532a',
    intro: 'Roland Garros (French Open) je grandslam na antuce v Paříži, hraje se od konce května do začátku června.' },
  { slug: 'us-open', name: 'US Open', sp: 43, match: /US Open/, short: 'USO', color: '#1d3f8a',
    intro: 'US Open v New Yorku uzavírá grandslamovou sezónu koncem srpna a v září. Večerní zápasy začínají u nás po půlnoci.' },
  { slug: 'australian-open', name: 'Australian Open', sp: 43, match: /Australian Open/, short: 'AO', color: '#1d76b8',
    intro: 'Australian Open v Melbourne otevírá sezónu v lednu. Kvůli časovému posunu se hraje od noci do odpoledne našeho času.' },
  { slug: 'atp', name: 'ATP', sp: 43, match: /^ATP /, short: 'ATP', color: '#003a70', top: true,
    intro: 'Všechny turnaje ATP na jednom místě – Masters, pětistovky i dvěstěpadesátky. Zápasy běží souběžně na více kurtech.' },
  { slug: 'wta', name: 'WTA', sp: 43, match: /^WTA /, short: 'WTA', color: '#6b2c91', top: true,
    intro: 'Turnaje WTA, ve kterých pravidelně startují české tenistky. Program se sestavuje den předem.' },
  { slug: 'ms-v-hokeji', name: 'MS v hokeji', sp: 23, match: /^(MS 20\d\d|Mistrovství světa)(?!.*U\d\d)/, short: 'MS', color: '#b3122e', top: true,
    intro: 'Mistrovství světa v ledním hokeji se hraje každý rok v květnu. Ročník 2027 hostí Německo. Jakmile budou zápasy v nabídce, najdeš tu celý program s časy, kurzy a odkazem na přenos.' },
  { slug: 'oktagon', name: 'Oktagon', sp: 208, match: /^Oktagon/, short: 'OKT', color: '#8a1414', top: true,
    intro: 'Oktagon MMA je největší organizace MMA ve střední Evropě. Galavečery se konají zhruba jednou měsíčně v Česku, na Slovensku a v Německu, hlavní zápasy začínají ve večerních hodinách.' },
  { slug: 'clash', name: 'Clash MMA', sp: 208, match: /^Clash/, short: 'CL', color: '#3b1d6e', guide: { href: '/jak-sledovat/clash-mma/', label: 'Kde sledovat Clash, cena PPV, karta a historie turnajů' },
    intro: 'Clash MMA pořádá galavečery se známými jmény z českého a slovenského MMA i z influencer zápasů. Program a zápasy s kurzy najdeš tady.' },
  { slug: 'g-mma', name: 'G MMA', sp: 208, match: /^G[ -]?MMA/i, short: 'G', color: '#111111', guide: { href: '/jak-sledovat/g-mma/', label: 'Kde sledovat G MMA, jak koupit PPV a celá karta' },
    intro: 'G MMA je nová česká organizace bizarních zápasů s Jakubem Jírou. První galavečer G MMA 1: Samhain je 31. října 2026 v pražské Nové Spirále. Zápasy s kurzy najdeš tady, jakmile je sázkové kanceláře vypíšou.' },
  { slug: 'ufc', name: 'UFC', sp: 208, match: /^UFC/, short: 'UFC', color: '#b30b0b', top: true,
    intro: 'UFC je nejvyšší soutěž MMA na světě. Hlavní karty se v amerických časech konají u nás v noci a brzy ráno, evropské akce večer. Zápasy s videem u Tipsportu.' },
  { slug: 'chance-extraliga-hazena', name: 'Chance extraliga (házená)', sp: 20, match: /^Česká Chance extraliga$/, short: 'HZ', color: '#7a2f1d',
    intro: 'Nejvyšší česká házenkářská soutěž.' },
  { slug: 'extraliga-volejbal', name: 'Extraliga volejbalu', sp: 47, match: /^Česká extraliga$/, short: 'VB', color: '#8a6d00',
    intro: 'Nejvyšší česká volejbalová soutěž mužů.' },
  // Tipsport's exact names for these were not in the feed on 24. 10. 2026 — kept general (women's leagues excluded).
  { slug: 'slovenska-extraliga-volejbal', name: 'Slovenská extraliga (volejbal)', sp: 47, match: /^Slovensk\S* (extra)?liga(?!.*(Ž|žen))/, short: 'VSK', color: '#3a6fb8',
    intro: 'Nejvyšší slovenská volejbalová soutěž mužů.' },
  { slug: 'slovenska-extraliga-hazena', name: 'Slovenská extraliga (házená)', sp: 20, match: /^Slovensk\S* .*extraliga(?!.*(Ž|žen))/, short: 'HSK', color: '#3a6fb8',
    intro: 'Nejvyšší slovenská házenkářská soutěž mužů.' },
];

const BY_SLUG = new Map(COMPETITIONS.map((c) => [c.slug, c]));
export const competitionBySlug = (slug: string) => BY_SLUG.get(slug);

/** The curated competition a Tipsport match belongs to (null for everything else). */
export function competitionOf(sp: number, lg: string): Competition | null {
  for (const c of COMPETITIONS) if (c.sp === sp && c.match.test(lg)) return c;
  return null;
}

/** URL slug of a competition: curated slug when known, otherwise derived from the Tipsport name. */
export const competitionSlug = (sp: number, lg: string) => competitionOf(sp, lg)?.slug ?? slugify(lg);
