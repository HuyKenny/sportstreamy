import type { ResultsEnv } from './config';

/** Bearer check for the ops endpoints; without a configured token they do not exist at all. */
export function authorized(env: ResultsEnv, request: Request): boolean {
  const want = env.RESULTS_ADMIN_TOKEN ?? '';
  if (want.length < 16) return false;
  const got = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

export const PRIVATE = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
