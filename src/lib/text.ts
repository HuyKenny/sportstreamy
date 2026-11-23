const MAP: Record<string, string> = { ß: 'ss', ł: 'l', đ: 'd', ø: 'o', æ: 'ae', œ: 'oe' };

/** URL slug without diacritics. */
export function slugify(s: string): string {
  return slugify.finish(slugify.fold(s));
}
/** Lowercase, strip diacritics, map the few letters NFD does not decompose. Safe on joined strings (keeps \u0001). */
slugify.fold = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ßłđøæœ]/g, (c) => MAP[c]);
/** Second half of slugify on an already folded string. */
slugify.finish = (s: string): string =>
  s
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);

const TZ = 'Europe/Prague';
const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const longFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('cs-CZ', { timeZone: TZ, day: 'numeric', month: 'numeric' });

/** YYYY-MM-DD in Prague time. */
export const dayKey = (ms: number) => dayFmt.format(ms);
export const hhmm = (ms: number) => timeFmt.format(ms);
export const longDay = (ms: number) => longFmt.format(ms);
export const shortDay = (ms: number) => shortFmt.format(ms);
export const addDays = (ms: number, n: number) => ms + n * 86_400_000;

/** "dnes" / "zítra" / "po 21. 10." relative label. */
export function dayLabel(ms: number, now: number): string {
  const k = dayKey(ms);
  if (k === dayKey(now)) return 'Dnes';
  if (k === dayKey(addDays(now, 1))) return 'Zítra';
  return longFmt.format(ms);
}

/** Czech plural: 1 přenos, 2–4 přenosy, 5+ přenosů. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
