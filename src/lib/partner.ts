import type { Env } from './types';

const BOOKS = {
  tipsport: { public: 'https://www.tipsport.cz', urlKey: 'TIPSPORT_URL' },
  chance: { public: 'https://www.chance.cz', urlKey: 'CHANCE_URL' },
} as const;
export type Book = keyof typeof BOOKS;

/** Tracking parameters (pid/sid/bid/tid) are lifted from the partner link Kenny registered, so there is one source of truth. */
function trackingParams(env: Env, book: Book): URLSearchParams {
  const u = new URL(env[BOOKS[book].urlKey]);
  const out = new URLSearchParams();
  for (const k of ['pid', 'sid', 'bid', 'tid']) {
    const v = u.searchParams.get(k);
    if (v) out.set(k, v);
  }
  return out;
}

/** Deeplink to a match on the bookmaker with our tracking parameters appended (same method as the old plugin). */
export function deeplink(env: Env, book: Book, path: string): string {
  const u = new URL(BOOKS[book].public + (path.startsWith('/') ? path : '/' + path));
  for (const [k, v] of trackingParams(env, book)) u.searchParams.set(k, v);
  return u.toString();
}

/** Where /go/<book>/ sends people when there is no specific match: the registered partner redirect. */
export function generic(env: Env, book: Book | 'sazka' | 'sazka-ms' | 'merkurxtip' | 'tipsport-reg'): string {
  if (book === 'merkurxtip') return env.MERKURXTIP_URL;
  if (book === 'sazka') return env.SAZKA_URL;
  if (book === 'sazka-ms') return env.SAZKA_MS_URL;
  if (book === 'tipsport-reg') return env.TIPSPORT_REG_URL;
  return env[BOOKS[book].urlKey];
}
