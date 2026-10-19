import type { Sport } from './sports';

/** Hand-written lead per main sport; the rest get a neutral one built from the name. */
const LEADS: Record<string, string> = {
  fotbal: 'Fotbal je nejširší část nabídky: od českých a slovenských soutěží přes evropské ligy po zápasy národních týmů a nižší ligy z celého světa. Většinu duelů pokrývá video přenos, u zbytku aspoň živé skóre a kurzy.',
  hokej: 'Hokej online zahrnuje NHL, extraligu, KHL i evropské soutěže. Večerní zápasy NHL začínají kvůli časovému posunu zpravidla až po půlnoci, proto se vyplatí podívat se do programu předem.',
  tenis: 'Tenisové turnaje ATP a WTA běží téměř celý rok a na kurtech se hraje paralelně, takže se v jednu chvíli dá sledovat i několik zápasů. U každého utkání vidíš čas, turnaj a kurzy na oba hráče.',
  basketbal: 'Basketbal online – NBA, Euroliga, domácí ligy i univerzitní soutěže. Zápasy NBA se kvůli rozdílu časových pásem hrají v noci, program na zítřek proto najdeš už od večera.',
  volejbal: 'Volejbalové přenosy zahrnují ligy, evropské poháry i reprezentaci. U zápasů vidíš čas začátku a soutěž, u běžících i průběžný stav setů.',
  'stolni-tenis': 'Stolní tenis má v nabídce nejvíc zápasů v celém programu – turnaje se hrají od rána do noci a jeden zápas trvá jen kolem půl hodiny.',
  esporty: 'E-sporty – Counter-Strike, League of Legends, Dota a další. Přenosy turnajů běží po celý den a zápasy se hrají v krátkých sériích map.',
};

export const sportLead = (s: Sport) => LEADS[s.slug] ?? `${s.name} online: přehled zápasů s přenosem a živým skóre. Čas začátku a kurzy najdeš u každého utkání.`;

export const sportFaq = (s: Sport, hasLive: boolean) => [
  { q: `Kde sledovat ${s.name.toLowerCase()} online zdarma?`, a: `Na stránce máš aktuální program i zápasy, které právě běží. Tlačítko u zápasu tě přesune na přenos u licencované sázkové kanceláře. Ke sledování obvykle stačí bezplatná registrace, vsázet nemusíš.` },
  { q: `Běží teď nějaký ${s.slug === 'fotbal' || s.slug === 'hokej' ? 'zápas' : 'přenos'}?`, a: hasLive ? 'Ano, v tabulce nahoře jsou zápasy označené červenou tečkou „Živě“. Skóre se obnovuje každých 30 sekund.' : 'Právě teď žádný neběží. Nejbližší starty jsou v programu níže, stránka se průběžně aktualizuje.' },
  { q: 'Jsou přenosy opravdu zdarma?', a: 'Videa nevysíláme my, zpřístupňují je provozovatelé. Sledování bývá bezplatné po registraci. Případné sázky jsou vždy dobrovolné a určené osobám starším 18 let.' },
];
