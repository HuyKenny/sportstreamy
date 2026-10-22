import type { Db } from './db';

/** Everything the results feature reads from the Worker env (vars in wrangler.jsonc, secrets via wrangler secret). */
export interface ResultsEnv {
  RESULTS?: unknown; // D1 binding
  RESULTS_ENABLED?: string; // public pages and blocks
  RESULTS_SYNC?: string; // writes from the cron
  RESULTS_COMPETITIONS?: string; // comma-separated slugs from competitions.ts
  RESULTS_APIFOOTBALL?: string;
  RESULTS_API_SPORTS?: string; // sports synced from api-sports (sports-api.ts slugs), each with its own daily quota
  RESULTS_API_CAP?: string; // our daily ceiling on the shared api-football quota
  RESULTS_API_RESERVE?: string; // never go below this many requests left at the provider (other users of the key)
  RESULTS_API_KEEP?: string; // requests kept for result checks: optional data (details, H2H) stops above this
  RESULTS_PRIORITY?: string; // competitions that get details and H2H first
  RESULTS_STALE_MIN?: string;
  RESULTS_STATS?: string;
  RESULTS_ADMIN_TOKEN?: string;
  APISPORTS_KEY?: string;
}

export interface ResultsConfig {
  enabled: boolean;
  sync: boolean;
  comps: string[];
  apiFootball: boolean;
  apiSports: string[];
  cap: number;
  reserve: number;
  keep: number;
  priority: string[];
  staleMs: number;
  stats: boolean;
}

const on = (v?: string) => /^(on|1|true|yes)$/i.test(v ?? '');
const num = (v: string | undefined, d: number) => (v && /^\d+$/.test(v) ? Number(v) : d);

export function resultsConfig(env: ResultsEnv): ResultsConfig {
  return {
    enabled: on(env.RESULTS_ENABLED) && !!env.RESULTS,
    sync: on(env.RESULTS_SYNC) && !!env.RESULTS,
    comps: (env.RESULTS_COMPETITIONS ?? 'chance-liga,liga-mistru,evropska-liga,konferencni-liga,premier-league,chance-narodni-liga,nike-liga,la-liga,bundesliga,serie-a,ligue-1,championship').split(',').map((s) => s.trim()).filter(Boolean),
    apiFootball: on(env.RESULTS_APIFOOTBALL) && !!env.APISPORTS_KEY,
    apiSports: (env.RESULTS_API_SPORTS ?? 'fotbal').split(',').map((s) => s.trim()).filter(Boolean),
    cap: num(env.RESULTS_API_CAP, 80),
    reserve: num(env.RESULTS_API_RESERVE, 20),
    keep: num(env.RESULTS_API_KEEP, 25),
    priority: (env.RESULTS_PRIORITY ?? 'chance-liga,premier-league,liga-mistru,evropska-liga,konferencni-liga').split(',').map((s) => s.trim()).filter(Boolean),
    staleMs: num(env.RESULTS_STALE_MIN, 10) * 60_000,
    stats: on(env.RESULTS_STATS),
  };
}

/** D1 for public pages, or null when the feature is off (pages then behave exactly as before). */
export const resultsDb = (env: ResultsEnv): Db | null => (resultsConfig(env).enabled ? (env.RESULTS as Db) : null);
/** D1 for the sync jobs, or null when syncing is off. */
export const resultsSyncDb = (env: ResultsEnv): Db | null => (resultsConfig(env).sync ? (env.RESULTS as Db) : null);
