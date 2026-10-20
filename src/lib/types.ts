/** Slim match record stored in KV (Tipsport field names expanded). Times are epoch ms. */
export interface Match {
  id: number;
  h: string; // home participant (or whole event name for outrights)
  a: string; // away participant, '' for single-entity events
  sp: number; // idSuperSport
  lg: string; // competition name
  lid: number; // competition id
  st: number; // start, epoch ms
  stream: boolean; // video available on Tipsport
  path: string; // Tipsport matchUrl path
  live: boolean; // Tipsport says it is in play (verify with st <= now)
  sc?: string; // "2:1" when live
  ti?: string; // minute / period text when live
  /** 1/x/2 odds, Tipsport and Chance (null when no market) */
  o?: { t: [number, number | null, number]; c?: [number, number | null, number] };
}

export interface Snapshot<T> {
  at: number; // epoch ms when refreshed
  items: T[];
}

export interface Env {
  DATA: KVNamespace;
  ASSETS: Fetcher;
  CLICKS?: AnalyticsEngineDataset;
  TIPSPORT_CLIENT_ID: string;
  TIPSPORT_CLIENT_SECRET: string;
  CHANCE_API_USER: string;
  CHANCE_API_PASS: string;
  APISPORTS_KEY?: string;
  TIPSPORT_URL: string;
  TIPSPORT_REG_URL: string;
  CHANCE_URL: string;
  SAZKA_URL: string;
  INDEXNOW_KEY?: string;
}
