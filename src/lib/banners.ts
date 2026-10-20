/**
 * Partner banners (300×300) picked by page context. Tipsport/Chance ones are their own async scripts that fill
 * `.tipAd<pl>`; the Allwyn one ships as document.write, which async loading ignores, so we render its link + image.
 * Placement ids come from the partner panels (Kenny, 20. 10. 2026).
 */
export type Banner =
  | { kind: 'script'; host: 'ban.tipsport.cz' | 'ban.chance.cz'; pl: number; label: string }
  | { kind: 'static'; go: string; img: string; alt: string; label: string };

export const BANNERS = {
  tipsport1000: { kind: 'script', host: 'ban.tipsport.cz', pl: 140950, label: 'Tipsport 1000 Kč za registraci' },
  esport: { kind: 'script', host: 'ban.tipsport.cz', pl: 140970, label: 'Tipsport – esporty živě' },
  pohary: { kind: 'script', host: 'ban.tipsport.cz', pl: 140971, label: 'Tipsport – české týmy v evropských pohárech' },
  bojove: { kind: 'script', host: 'ban.tipsport.cz', pl: 140951, label: 'Tipsport – bojové sporty' },
  chance200: { kind: 'script', host: 'ban.chance.cz', pl: 140952, label: 'Chance 200 Kč zdarma' },
  chanceFantasy: { kind: 'script', host: 'ban.chance.cz', pl: 140953, label: 'Chance Fantasy' },
  sazkaHokej: { kind: 'static', go: '/go/sazka-ms/', img: 'https://media.sazka.cz/uploads/Kopie_souboru_Masteraffiliate_-_300x300.png', alt: 'SazkaBet – MS v hokeji', label: 'Allwyn – MS v hokeji' },
} satisfies Record<string, Banner>;

const POHARY = new Set(['liga-mistru', 'evropska-liga', 'konferencni-liga']);
const CHANCE_LIGA = new Set(['chance-liga', 'chance-narodni-liga']);

/** Most specific first: competition, then sport, then the 1000 Kč default. */
export function bannerFor(sport?: string, comp?: string): Banner {
  if (comp && POHARY.has(comp)) return BANNERS.pohary;
  if (comp && CHANCE_LIGA.has(comp)) return BANNERS.chanceFantasy;
  if (sport === 'esporty') return BANNERS.esport;
  if (sport === 'bojove-sporty' || sport === 'box') return BANNERS.bojove;
  if (sport === 'hokej') return BANNERS.sazkaHokej;
  return BANNERS.tipsport1000;
}
