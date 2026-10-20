import { dayKey } from '../text';

const TZ = 'Europe/Prague';
const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Prague's UTC offset (ms) at a given instant: +1 h in winter, +2 h in summer. */
function offsetAt(ms: number): number {
  const p = Object.fromEntries(parts.formatToParts(ms).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

const nextKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** UTC instant of local midnight in Prague for YYYY-MM-DD. */
export function pragueMidnight(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return utc - offsetAt(utc - offsetAt(utc));
}

/** [start, end) of a Prague calendar day in UTC ms — 23 or 25 hours long on DST change days. */
export const pragueDay = (key: string): [number, number] => [pragueMidnight(key), pragueMidnight(nextKey(key))];

export const isDayKey = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(pragueMidnight(s) + 3600_000) === s;

/** api-football counts its daily quota per UTC day. */
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
