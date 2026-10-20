import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const clanky = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/clanky' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(), // rendered under the article + FAQPage JSON-LD
    related: z.array(z.string()).optional(), // slugs of related articles; falls back to the newest others
  }),
});
/** Previews of big matches, written by scripts/nahledy.py (Claude + validator) a day or two before kick-off. */
const nahledy = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/nahledy' }),
  schema: z.object({
    title: z.string(), // H1 / <title> core, e.g. "Bayern – Arsenal: kde sledovat živě"
    description: z.string(),
    matchId: z.number(), // Tipsport id → live data (odds, stream, state) from KV while the match is in the feed
    home: z.string(),
    away: z.string(),
    league: z.string(),
    sport: z.string(), // sport slug
    start: z.coerce.date(),
    tv: z.string().optional(), // Czech broadcaster, only when verified
    tvSource: z.url().optional(),
    sources: z.array(z.url()).default([]),
    faq: z.array(z.object({ q: z.string(), a: z.string() })).default([]),
    date: z.coerce.date(),
  }),
});
export const collections = { clanky, nahledy };
