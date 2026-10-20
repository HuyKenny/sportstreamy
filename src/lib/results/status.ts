/** Our match states. The provider's own wording is kept in status_raw; anything we cannot classify is 'unknown'. */
export type Status =
  | 'scheduled' | 'live' | 'ht' | 'et' | 'pens'
  | 'ft' | 'aet' | 'pen'
  | 'postponed' | 'interrupted' | 'cancelled'
  | 'unknown' | 'unconfirmed';

export const FINAL: Status[] = ['ft', 'aet', 'pen'];
export const IN_PLAY: Status[] = ['live', 'ht', 'et', 'pens'];

export const isFinal = (s: string) => (FINAL as string[]).includes(s);
export const isInPlay = (s: string) => (IN_PLAY as string[]).includes(s);

/** Filter groups on the results page ("stav"). Interrupted/cancelled/unknown/unconfirmed only show under "vše". */
export type Group = 'live' | 'final' | 'upcoming' | 'other';
export function group(s: string): Group {
  if (isInPlay(s)) return 'live';
  if (isFinal(s)) return 'final';
  if (s === 'scheduled' || s === 'postponed') return 'upcoming';
  return 'other';
}

/** Human label; never "Konec" for anything that is not a confirmed final state. */
export function statusLabel(s: string, raw?: string | null): string {
  switch (s) {
    case 'scheduled': return 'Nezačalo';
    case 'live': return 'Probíhá';
    case 'ht': return 'Poločas';
    case 'et': return 'Prodloužení';
    case 'pens': return 'Penalty';
    case 'ft': return 'Konec';
    case 'aet': return 'Konec po prodloužení';
    case 'pen': return 'Konec po penaltách';
    case 'postponed': return 'Odloženo';
    case 'interrupted': return 'Přerušeno';
    case 'cancelled': return 'Zrušeno';
    case 'unconfirmed': return 'Výsledek nepotvrzen';
    default: return raw ? `Stav: ${raw}` : 'Neznámý stav';
  }
}

/** Short form for the narrow time column of a row. */
export function statusShort(s: string): string {
  switch (s) {
    case 'live': return 'Živě';
    case 'ht': return 'Poločas';
    case 'et': return 'Prodl.';
    case 'pens': return 'Penalty';
    case 'ft': return 'Konec';
    case 'aet': return 'Po prodl.';
    case 'pen': return 'Po pen.';
    case 'postponed': return 'Odlož.';
    case 'interrupted': return 'Přeruš.';
    case 'cancelled': return 'Zruš.';
    case 'unconfirmed': return 'Nepotvrz.';
    default: return '?';
  }
}
