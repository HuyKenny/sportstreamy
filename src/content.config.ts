import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const clanky = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/clanky' }),
  schema: z.object({ title: z.string(), description: z.string(), date: z.coerce.date(), updated: z.coerce.date().optional() }),
});
export const collections = { clanky };
