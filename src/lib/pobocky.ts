import type { Env } from './types';

/** One bookmaker shop. Filled by scripts/pobocky.py into KV `pobocky`. */
export interface Branch {
  name: string; street: string; city: string; citySlug: string; part: string; zip: string; region: string;
  lat: number | null; lon: number | null; // null where the source has no GPS (Tipsport, Chance) note: string; hours: string[]; live: boolean;
}
interface Doc { updated: string; brands: Record<string, Branch[]> }

let memo: { at: number; doc: Doc } | undefined;
export async function loadBranches(env: Env): Promise<Doc> {
  if (memo && Date.now() - memo.at < 600_000) return memo.doc;
  const doc = (await env.DATA.get<Doc>('pobocky', 'json')) ?? { updated: '', brands: {} };
  memo = { at: Date.now(), doc };
  return doc;
}

export interface City { city: string; slug: string; region: string; n: number }
export function citiesOf(rows: Branch[]): City[] {
  const m = new Map<string, City>();
  for (const r of rows) {
    const c = m.get(r.citySlug) ?? { city: r.city, slug: r.citySlug, region: r.region, n: 0 };
    c.n++;
    m.set(r.citySlug, c);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.city.localeCompare(b.city, 'cs'));
}

/** City pages exist only where there is more than one shop (single shops are listed on the brand page). */
export const CITY_MIN = 2;
export const DAY_NAMES = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
export const mapLink = (b: Branch) =>
  b.lat != null && b.lon != null
    ? `https://mapy.com/fnc/v1/showmap?mapset=basic&center=${b.lon},${b.lat}&zoom=17&marker=true`
    : `https://mapy.com/fnc/v1/search?query=${encodeURIComponent(`${b.street}, ${b.zip} ${b.part.split(' – ')[0] || b.city}`)}`;

/** Opening hours as compact ranges: "Po–Pá 7:30–15:00, So zavřeno". */
export function hoursText(h: string[]): string {
  if (!h.some(Boolean)) return '';
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    let j = i;
    while (j + 1 < 7 && h[j + 1] === h[i]) j++;
    const days = i === j ? DAY_NAMES[i] : `${DAY_NAMES[i]}–${DAY_NAMES[j]}`;
    parts.push(`${days} ${h[i] || 'zavřeno'}`);
    i = j + 1;
  }
  return parts.join(', ');
}
