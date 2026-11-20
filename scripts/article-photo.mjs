#!/usr/bin/env node
// Feature photo for one article: node scripts/article-photo.mjs <slug> <pexels-id> "<czech alt>"
// Writes public/img/clanky/<slug>-{800,1280}.{avif,jpg} + <slug>-og.jpg (1200x630) and src/data/article-photos.json.
// Key: PEXELS_API_KEY from ~/ai/credentials/.sportstreamy-credentials.env (never committed).
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const KEY = readFileSync('/home/kenny/ai/credentials/.sportstreamy-credentials.env', 'utf8').match(/^PEXELS_API_KEY="?([^"\n]+)/m)?.[1];
if (!KEY) throw new Error('PEXELS_API_KEY missing');
const [slug, id, alt] = process.argv.slice(2);
if (!slug || !id || !alt) throw new Error('usage: article-photo.mjs <slug> <pexels-id> "<alt>"');
const p = await (await fetch(`https://api.pexels.com/v1/photos/${id}`, { headers: { Authorization: KEY } })).json();
const buf = Buffer.from(await (await fetch(p.src.large2x)).arrayBuffer());
mkdirSync('public/img/clanky', { recursive: true });
for (const w of [800, 1280]) {
  const img = sharp(buf).resize(w, Math.round((w * 9) / 16), { fit: 'cover' });
  await img.clone().avif({ quality: 55 }).toFile(`public/img/clanky/${slug}-${w}.avif`);
  await img.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(`public/img/clanky/${slug}-${w}.jpg`);
}
await sharp(buf).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80, mozjpeg: true }).toFile(`public/img/clanky/${slug}-og.jpg`);
const f = 'src/data/article-photos.json';
const meta = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
meta[slug] = { id: Number(id), author: p.photographer, authorUrl: p.photographer_url, url: p.url, alt };
writeFileSync(f, JSON.stringify(meta, null, 1) + '\n');
console.log(slug, id, p.photographer);
