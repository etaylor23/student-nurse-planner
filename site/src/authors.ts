// Named authors / clinical reviewers for /guides content. YMYL health content ranks on
// E-E-A-T; a real, credentialed, on-site author entity is the strongest signal we have.
// See spec/spec-seo-growth.md §4.
//
// Two kinds of byline:
//  - "placemate-team" (isTeam) — collective authorship, schema author = the Organization.
//    Used for guides published ahead of clinical review. Makes NO clinical-review claim.
//  - A named person (e.g. Nicola, RN) — renders the "Clinically reviewed by …" byline and
//    a Person schema node anchored at /about#<slug>. Flip a guide's frontmatter `author`
//    to "nicola-nightingale" once she has actually reviewed it — never before.
import type { Author } from "./schema";

export const AUTHORS = {
  "nicola-nightingale": {
    name: "Nicola Nightingale",
    slug: "nicola-nightingale",
    credential: "Registered Nurse",
    role: "Co-founder & Clinical Reviewer",
    description:
      "Nicola Nightingale is a Registered Nurse and co-founder of PlaceMate, and leads clinical review of PlaceMate's guides.",
    isTeam: false,
  },
  "placemate-team": {
    name: "The PlaceMate team",
    slug: "placemate-team",
    credential: "",
    role: "",
    description:
      "Guides written by the PlaceMate team, built around the published NMC standards.",
    isTeam: true,
  },
} satisfies Record<string, Author & { role: string; isTeam: boolean }>;

export type AuthorSlug = keyof typeof AUTHORS;

// Safe default: the collective byline. A named clinical byline is opted INTO per guide,
// after the named person has actually reviewed it.
export const DEFAULT_AUTHOR: AuthorSlug = "placemate-team";
