// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// Server-rendered on Workers: the match lists live in KV (refreshed by cron triggers in src/worker.ts)
// and the pages read them per request; the CF edge caches the HTML for a minute.
export default defineConfig({
  site: 'https://sportstreamy.cz',
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  trailingSlash: 'always',
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true,
});
