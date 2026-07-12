// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// PlaceMate marketing site — static brochure on the placemate.uk apex.
// See ../spec/spec-corporate-website.md and ../HANDOVER-corporate-website.md.
//
//  - output 'static'        → real pre-rendered HTML in the response (AI crawlers
//                             mostly don't execute JS; also best Core Web Vitals).
//  - build.format 'directory' → /features → dist/features/index.html. The marketing
//                             CloudFront Function maps `/path` → `/path/index.html`.
//  - trailingSlash 'never'  → canonical URLs + sitemap entries are the clean, slash-less
//                             apex form (the single indexed entity; canonical is never www).
export default defineConfig({
  site: "https://placemate.uk",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory" },
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
