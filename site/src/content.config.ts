// Content collections (Astro 5 Content Layer). The `guides` collection is the /guides hub
// content engine from spec/spec-seo-growth.md §3 — a pillar+cluster set of Markdown guides.
//
// Guides are authored via the pipeline in §3 (SEO scaffold → Fable draft → clinical review)
// and MUST be clinically reviewed before publish. `draft: true` keeps a piece out of the
// build entirely, so nothing unreviewed ever ships. Flat URLs: /guides/<file-slug>.
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { DEFAULT_AUTHOR } from "./authors";

const PILLARS = ["placement-hours", "proficiencies-pad", "reflections", "drug-calculations"] as const;

const guides = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/guides" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pillar: z.enum(PILLARS),
    // Is this piece the pillar's cornerstone (vs a supporting cluster article)?
    isPillar: z.boolean().default(false),
    draft: z.boolean().default(false),
    datePublished: z.coerce.date(),
    dateModified: z.coerce.date().optional(),
    author: z.string().default(DEFAULT_AUTHOR),
    // Optional branded per-guide OG image (site-relative). Falls back to /og/default.png.
    ogImage: z.string().optional(),
  }),
});

export const collections = { guides };
