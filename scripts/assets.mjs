// One-off brand assets from the SVG mark + Archivo: OG image, touch icons. Run: node scripts/assets.mjs
import satori from 'satori';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const f = (n) => readFileSync(require.resolve(`@fontsource/archivo/files/${n}`));
const fonts = [
  { name: 'Archivo', data: f('archivo-latin-800-normal.woff'), weight: 800, style: 'normal' },
  { name: 'ArchivoExt', data: f('archivo-latin-ext-800-normal.woff'), weight: 800, style: 'normal' },
  { name: 'Archivo', data: f('archivo-latin-500-normal.woff'), weight: 500, style: 'normal' },
  { name: 'ArchivoExt', data: f('archivo-latin-ext-500-normal.woff'), weight: 500, style: 'normal' },
];
const h = (type, style, children) => ({ type, props: { style: { display: 'flex', ...style }, children } });
const fam = 'Archivo, ArchivoExt';
const tree = h('div', { width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', background: '#f4f0e6', color: '#15140f', fontFamily: fam }, [
  h('div', { alignItems: 'center', gap: 16, fontSize: 52, fontWeight: 800, letterSpacing: -2 }, [
    h('div', { width: 56, height: 56, borderRadius: 12, background: '#15140f', alignItems: 'center', justifyContent: 'center' }, h('div', { width: 0, height: 0, borderTop: '14px solid transparent', borderBottom: '14px solid transparent', borderLeft: '24px solid #f4f0e6', marginLeft: 6 })),
    h('div', {}, [h('span', {}, 'sport'), h('span', { color: '#0d7a4c' }, 'streamy')]),
  ]),
  h('div', { flexDirection: 'column', gap: 18 }, [
    h('div', { fontSize: 92, fontWeight: 800, lineHeight: 1.0, letterSpacing: -3, maxWidth: 980 }, 'Sport živě. Rovnou na správný zápas.'),
    h('div', { fontSize: 34, fontWeight: 500, color: '#4a473d' }, 'Živé přenosy, program na týden a kurzy – fotbal, hokej, tenis, basketbal'),
  ]),
  h('div', { alignItems: 'center', gap: 14, fontSize: 28, fontWeight: 800 }, [
    h('div', { background: '#0d7a4c', color: '#fff', padding: '10px 22px', borderRadius: 8 }, 'ŽIVĚ PRÁVĚ TEĎ'),
    h('div', { color: '#4a473d', fontWeight: 500 }, 'sportstreamy.cz · 18+'),
  ]),
]);
mkdirSync('public/og', { recursive: true });
const svg = await satori(tree, { width: 1200, height: 630, fonts });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og/default.png');
const mark = readFileSync('public/favicon.svg');
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512], ['favicon-32.png', 32]]) {
  await sharp(mark, { density: 512 }).resize(size, size).png().toFile(`public/${name}`);
}
writeFileSync('public/site.webmanifest', JSON.stringify({ name: 'SportStreamy', short_name: 'SportStreamy', start_url: '/', display: 'standalone', background_color: '#f4f0e6', theme_color: '#f4f0e6', lang: 'cs', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }));
console.log('assets ok');
