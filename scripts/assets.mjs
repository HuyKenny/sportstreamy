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
// Stadium photo behind the OG card (from the Pexels set), darkened like the site's photo scrims.
const bg = await sharp('public/img/sport/stadion-1600.avif').resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toBuffer();
const bgUrl = `data:image/jpeg;base64,${bg.toString('base64')}`;
const mark = (size) => h('div', { width: size, height: size, borderRadius: size * 0.2, background: '#ffd23f', border: `${Math.round(size / 14)}px solid #000`, alignItems: 'center', justifyContent: 'center' },
  h('div', { width: 0, height: 0, borderTop: `${size * 0.22}px solid transparent`, borderBottom: `${size * 0.22}px solid transparent`, borderLeft: `${size * 0.36}px solid #080b0a`, marginLeft: size * 0.1 }));
const tree = h('div', { width: 1200, height: 630, position: 'relative', background: '#080b0a', color: '#eef1ec', fontFamily: fam }, [
  h('img', { position: 'absolute', left: 0, top: 0, width: 1200, height: 630 }, undefined),
  h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 630, background: 'linear-gradient(90deg, rgba(8,11,10,.96) 0%, rgba(8,11,10,.82) 55%, rgba(8,11,10,.45) 100%)' }),
  h('div', { position: 'absolute', left: 0, top: 0, width: 1200, height: 630, flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px' }, [
    h('div', { alignItems: 'center', gap: 18, fontSize: 50, fontWeight: 800, letterSpacing: -1 }, [mark(60), h('div', {}, [h('span', {}, 'SPORT'), h('span', { color: '#ffd23f' }, 'STREAMY')])]),
    h('div', { flexDirection: 'column', gap: 18 }, [
      h('div', { fontSize: 88, fontWeight: 800, lineHeight: 0.98, letterSpacing: -2, maxWidth: 900, flexDirection: 'column' }, [h('span', {}, 'ŽIVÉ PŘENOSY'), h('span', { color: '#ffd23f' }, 'ZDARMA')]),
      h('div', { fontSize: 32, fontWeight: 500, color: '#c9d1cb' }, 'Fotbal, hokej, tenis, NBA i Chance Liga – program a kurzy'),
    ]),
    h('div', { fontSize: 24, fontWeight: 500, color: '#a3ada6' }, 'sportstreamy.cz · pouze 18+'),
  ]),
]);
tree.props.children[0].props.src = bgUrl;
mkdirSync('public/og', { recursive: true });
const svg = await satori(tree, { width: 1200, height: 630, fonts });
await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og/default.png');
// Tab icon = public/favicon.svg (transparent corners). App icons are full-bleed: dark field, the yellow mark centred,
// because iOS/Android crop their own corners and a transparent edge would render white.
const fav = readFileSync('public/favicon.svg');
await sharp(fav, { density: 512 }).resize(32, 32).png().toFile('public/favicon-32.png');
const app = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#080b0a"/><rect x="12" y="12" width="40" height="40" rx="8" fill="#ffd23f"/><path d="M27 22v20l15-10z" fill="#080b0a"/></svg>');
for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
  await sharp(app, { density: 600 }).resize(size, size).png().toFile(`public/${name}`);
}
writeFileSync('public/site.webmanifest', JSON.stringify({ name: 'SportStreamy – živé přenosy zdarma', short_name: 'SportStreamy', start_url: '/', display: 'standalone', background_color: '#080b0a', theme_color: '#080b0a', lang: 'cs', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }));
console.log('assets ok');
