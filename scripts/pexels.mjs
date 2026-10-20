#!/usr/bin/env node
// Sport photos from Pexels. Two steps so a human picks the shots:
//   node scripts/pexels.mjs search            → contact sheets in $OUT (default /tmp) per sport, ids printed
//   node scripts/pexels.mjs fetch             → downloads ids listed in PICKS below into public/img/sport/, writes src/data/photos.json
// Key: PEXELS_API_KEY from ~/ai/credentials/.sportstreamy-credentials.env (never committed).
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const KEY = readFileSync('/home/kenny/ai/credentials/.sportstreamy-credentials.env', 'utf8').match(/^PEXELS_API_KEY="?([^"\n]+)/m)?.[1];
if (!KEY) throw new Error('PEXELS_API_KEY missing');
const OUT = process.env.OUT ?? '/tmp';

/** Search query per sport slug (English queries give far better Pexels results). */
const QUERIES = {
  stadion: 'football stadium night lights crowd',
  fotbal: 'football soccer match players',
  hokej: 'ice hockey game arena',
  tenis: 'tennis player match court',
  basketbal: 'basketball game arena',
  volejbal: 'volleyball match indoor',
  hazena: 'handball game',
  florbal: 'floorball',
  futsal: 'futsal indoor soccer',
  'stolni-tenis': 'table tennis match',
  esporty: 'esports tournament gaming',
  snooker: 'snooker table',
  sipky: 'darts board',
  'bojove-sporty': 'mma fight cage',
  box: 'boxing match ring',
  motorsport: 'formula racing car track',
  'americky-fotbal': 'american football game',
  baseball: 'baseball game',
  rugby: 'rugby match',
};

/** Chosen photo id per slug (filled after looking at the contact sheets). */
const PICKS = {
  stadion: 35898730, fotbal: 32285228, hokej: 6468928, tenis: 18421042, basketbal: 31177171, volejbal: 31044958,
  hazena: 25048028, florbal: 9708234, futsal: 37097046, 'stolni-tenis': 38446269, esporty: 9072212, snooker: 11354500,
  sipky: 12150231, 'bojove-sporty': 28560751, box: 31485125, motorsport: 30054776,
  // second shots for the busiest sports, so a carousel of five tennis matches does not repeat one picture
  'fotbal-2': 32285161, 'hokej-2': 6847914, 'tenis-2': 36231026, 'basketbal-2': 30555514, 'volejbal-2': 34544419, 'stolni-tenis-2': 13699258, 'esporty-2': 9072275,
};

const api = (path) => fetch(`https://api.pexels.com/v1${path}`, { headers: { Authorization: KEY } }).then((r) => {
  if (!r.ok) throw new Error(`pexels ${r.status} ${path}`);
  return r.json();
});

async function search() {
  for (const [slug, q] of Object.entries(QUERIES)) {
    const d = await api(`/search?query=${encodeURIComponent(q)}&per_page=8&orientation=landscape`);
    const tiles = await Promise.all(d.photos.map(async (p) => sharp(Buffer.from(await (await fetch(p.src.medium)).arrayBuffer())).resize(320, 180, { fit: 'cover' }).png().toBuffer()));
    const sheet = sharp({ create: { width: 320 * 4, height: 180 * 2, channels: 3, background: '#000' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 320, top: Math.floor(i / 4) * 180 })));
    await sheet.jpeg({ quality: 70 }).toFile(`${OUT}/pexels-${slug}.jpg`);
    console.log(slug, d.photos.map((p) => p.id).join(' '));
  }
}

async function fetchPicks() {
  mkdirSync('public/img/sport', { recursive: true });
  const meta = {};
  let old = {};
  try { old = JSON.parse(readFileSync('src/data/photos.json', 'utf8')); } catch { /* first run */ }
  for (const [slug, id] of Object.entries(PICKS)) {
    if (old[slug]?.id === id && !process.env.FORCE) { meta[slug] = old[slug]; continue; }
    const p = await api(`/photos/${id}`);
    const buf = Buffer.from(await (await fetch(p.src.original)).arrayBuffer());
    const base = sharp(buf).rotate();
    // 16:9 crops; attention keeps the action in frame.
    for (const w of [1600, 800]) {
      if (w === 1600 && slug.endsWith('-2')) continue; // seconds are only used in cards
      const img = base.clone().resize(w, Math.round((w * 9) / 16), { fit: 'cover', position: sharp.strategy.attention });
      await img.clone().avif({ quality: 48 }).toFile(`public/img/sport/${slug}-${w}.avif`);
      if (w === 800) await img.clone().jpeg({ quality: 72, mozjpeg: true }).toFile(`public/img/sport/${slug}-${w}.jpg`); // fallback only
    }
    meta[slug] = { id, author: p.photographer, authorUrl: p.photographer_url, url: p.url, alt: p.alt || '' };
    console.log(slug, id, p.photographer);
  }
  mkdirSync('src/data', { recursive: true });
  writeFileSync('src/data/photos.json', JSON.stringify(meta, null, 1) + '\n');
}

const cmd = process.argv[2];
if (cmd === 'search') await search();
else if (cmd === 'fetch') await fetchPicks();
else console.log('usage: pexels.mjs search|fetch');
