# Spec — Corporate / Marketing Website (placemate.uk apex)

_Status: **PLANNED** (not built). Output of a grill-me design session (2026-07-12). The
apex `placemate.uk` is reserved for this site; the app lives at `app.placemate.uk`
(see [`spec-dns-email.md`](./spec-dns-email.md)). Goal: a lean brochure with best-in-class
SEO for Google **and** discoverability by AI assistants (ChatGPT, Claude, Perplexity,
Google AI Overviews)._

## 1. Strategy (locked in grill-me)

- **Motion: product-led growth → institutional monetisation.** Win individual UK
  student nurses first with a **free / low-cost** offering and mass uptake; **transition to
  institution-led B2B** (universities pay to roll it out to cohorts) later. The site is
  **student-first now**, with a B2B foundation ("For universities" page) seeded from day one.
- **Primary audience:** UK **adult-field student nurses**. Secondary (later): university
  course leaders / practice-placement educators.
- **Primary CTA: "Sign up free"** (self-signup — the hard near-term push).
  **Secondary CTA: "Try the demo"** (guest/demo mode, no account, kept for friction-free trial).
  - **Dependency:** open self-signup for arbitrary emails only fully works once **SES
    production access** lands (sandbox blocks non-verified recipients) and Cognito
    self-signup is enabled. Until then the app is invite-only; the site can ship the
    signup CTA with a graceful interim (demo + "request access"). See
    [`spec-dns-email.md`](./spec-dns-email.md) §5.

## 2. Scope & information architecture

**Lean brochure — 6 focused pages** (each a distinct, separately-optimisable/citable URL)
plus footer/legal:

| URL | Page | Primary intent |
|---|---|---|
| `/` | Home | Category term + brand; convert to signup/demo |
| `/features` | Features | High-intent feature queries (hours, PAD, revision, calcs) |
| `/for-universities` | For universities | B2B seed (institutional inbound) |
| `/about` | About | Trust / E-E-A-T / entity clarity |
| `/pricing` | Pricing | "is it free" intent |
| `/faq` | FAQ | Question / answer-engine intent (citable Q&A) |
| `/privacy`, `/terms`, `/contact` | Footer/legal | Trust + GDPR |

> **Trade-off acknowledged:** a lean brochure caps the organic/AI-citation ceiling — the
> biggest lever (an evergreen guides hub answering student questions) is deliberately out
> of scope. We compensate with (a) razor-targeted pages, (b) a rich on-page FAQ with
> `FAQPage` schema, and (c) off-site discovery (§9). Revisiting a guides hub is the #1
> future growth option (§11).

## 3. Tech stack & hosting

- **Astro (static site generator).** Ships ~zero JS by default → real pre-rendered HTML in
  the response (critical: **AI crawlers mostly don't execute JS**), top Core Web Vitals,
  first-class SEO (meta, sitemap, structured data), MDX for content. React "islands" only
  if ever needed.
- **Hosting:** static files → **a NEW S3 bucket + its own CloudFront distribution** for the
  apex, kept decoupled from the app's distribution (`E3ROJUBT1ZLKZV`). Manage as IaC in
  `infra/` (new construct/stack, mirroring `web.ts`).
- **DNS (Route 53, zone `Z01422912TXS1SRHFVF2E`):** `placemate.uk` A/AAAA **alias → the new
  marketing distribution**; **`www.placemate.uk` → 301 → apex**.
- **TLS:** reuse the **existing us-east-1 ACM cert** — it already covers `placemate.uk` +
  `*.placemate.uk`, so **no new cert** is needed.
- **App vs marketing SEO separation:** `app.placemate.uk` should be **`noindex, follow`**
  (a client-rendered SPA shouldn't compete with or leak thin pages into the index); the
  **apex is the single indexed marketing entity**. Cross-link: marketing → app (CTAs),
  app → apex (logo/footer).

## 4. Keyword strategy

Home anchors on the **category term**; the sharp feature + question terms live on
Features/FAQ. _(Intent-reasoned candidates — validate volumes in GSC + Bing + a keyword
tool once live.)_

| Page | Primary | Supporting / long-tail |
|---|---|---|
| Home | `student nurse planner` | `student nurse app`, `nursing placement planner`, `student nurse organiser`, brand `PlaceMate` |
| Features | (per-section) | `placement hours tracker`, `clinical/practice hours log student nurse`, `NMC proficiency tracker`, `PAD tracker` (practice assessment document), `nursing revision planner`, `drug calculation / medication numeracy practice`, `nursing reflection template (Gibbs)`, `student nurse shift planner` |
| For universities | `practice placement management software` | `student nurse progress tracking for universities`, `nursing cohort placement tool` |
| Pricing | `free student nurse app` | `PlaceMate pricing`, `is PlaceMate free` |
| FAQ (answer-engine) | question intent | `how many placement hours for a nursing degree UK`, `how to track placement hours`, `what are the NMC proficiencies`, `what is a PAD`, `how to write a nursing reflection`, `how to pass drug calculation tests` |
| About | brand/entity | `PlaceMate`, `who makes PlaceMate` |

## 5. On-page SEO conventions

- **Unique `<title>` (~50–60 chars) + meta description (~150–160)** per page, built around
  that page's primary term. Home e.g. `PlaceMate — the planner for UK student nurses`.
- **One `<h1>` per page** carrying the primary term; logical `<h2>/<h3>`.
- **Semantic HTML5** (`header/nav/main/section/article/footer`), descriptive `alt` text.
- **Canonical tag** on every page (self-referential); apex canonical (never `www`).
- **Open Graph + Twitter Card** tags + a branded OG image per page (social/chat previews).
- **Clean, lowercase, hyphenated URLs** (as §2). `lang="en-GB"`.
- Internal linking between Home ↔ Features ↔ FAQ ↔ Pricing with descriptive anchors.

## 6. Technical SEO

- **`sitemap.xml`** (Astro `@astrojs/sitemap`) + **`robots.txt`** referencing it.
- **Core Web Vitals:** Astro static + self-hosted fonts (`font-display: swap`), optimised
  responsive images (AVIF/WebP), no render-blocking JS. Target all-green CWV.
- **Mobile-first** (audience is overwhelmingly on phones). HTTPS enforced (CloudFront).
- **Structured data (JSON-LD)** — see §8.
- No `hreflang` needed (single `en-GB` locale).

## 7. AI / Answer-Engine Optimisation (AEO)

Posture: **maximise AI discovery** — we want AI assistants to name PlaceMate when asked
e.g. "best app for tracking nursing placement hours."

- **`robots.txt` allows ALL AI crawlers** — retrieval/answer bots (`OAI-SearchBot`,
  `ClaudeBot`, `PerplexityBot`, `Google-Extended`) **and** training bots (`GPTBot`,
  `CCBot`). No proprietary content to protect on a marketing site.
- **`llms.txt`** at the site root: a clean markdown overview — what PlaceMate is, who it's
  for, key features, key facts, links to each page. Cheap; signals AI-friendliness.
- **Answer-first FAQ content:** each FAQ answer is **self-contained, factual, and citable**
  (leads with the direct answer, ~40–60 words, then detail). This is what AI lifts.
- **Entity clarity:** one consistent name ("PlaceMate"), consistent description, `Organization`
  schema with `sameAs` → all social profiles (§8/§9), consistent NAP. Helps AI build a clean,
  confident entity for the brand.
- **Citable facts** stated plainly on-page (e.g. the NMC practice-hours requirement, number
  of NMC proficiencies tracked) so assistants can quote specifics.

## 8. Structured data plan (JSON-LD)

| Schema | Where | Notes |
|---|---|---|
| `Organization` | site-wide (Home) | name, url, logo, `sameAs` socials, `contactPoint` |
| `WebSite` | Home | site name; `SearchAction` only if site search exists (not v1) |
| `WebApplication` | Home + Features | `applicationCategory: EducationalApplication`, `operatingSystem: Web`, `offers` price `0` (free) |
| `FAQPage` | FAQ + on-page FAQ blocks | the citable Q&A |
| `BreadcrumbList` | interior pages | minor for a flat site |
| `Product`/`Offer` | Pricing | free tier |

> **Do NOT** mark up `aggregateRating`/`Review` until real, collected reviews exist —
> fabricated ratings violate Google's guidelines and risk a manual action. Parked until
> genuine testimonials are gathered.

## 9. Off-site discovery levers (all 4 logged; **direct outreach first; all phased LATER**)

Because we skip a content hub, off-site signals + one on-site magnet carry the discovery
load. All four are in the plan for **later**, with **direct outreach as the first approach**:

1. **University / `.ac.uk` backlinks (FIRST / highest ROI).** Direct outreach to nursing
   departments, student unions, and practice-placement handbook editors to get listed on
   resource pages. `.ac.uk` links are authority gold for this niche and trusted by Google +
   AI; the outreach also warms the future B2B pipeline.
2. **One free interactive tool** (the single exception to "lean brochure") — e.g. a
   **placement-hours calculator** (aligned to the ~2,300-hour NMC wedge) or a
   **drug-calculation quiz**. A standalone indexable page that earns links, ranks for its
   own query, and gets cited by AI. Biggest on-site discovery lever short of a blog.
3. **Social presence — Instagram / TikTok.** Where UK student nurses are; drives brand
   searches (which lift rankings), feeds the `Organization.sameAs` entity signal, and is a
   direct top-of-funnel channel.
4. **Community seeding + Product Hunt.** Seed r/StudentNurseUK, Facebook nursing-student
   groups, and a Product Hunt launch for an initial traffic + backlink spike (episodic).

## 10. Measurement & privacy

- **Analytics: privacy-first, cookieless** (Plausible or Fathom) → **no cookie-consent
  banner** (UX + CWV + trust win for a health-adjacent EU audience), lightweight script.
- **Google Search Console** — verify via a **DNS TXT record in the Route 53 zone** (we
  control it; verifies apex + subdomains at once).
- **Bing Webmaster Tools** — essential, because **ChatGPT/Copilot lean on Bing's index**;
  import config from GSC.
- **GDPR:** cookieless analytics avoids a banner; `Privacy` + `Terms` pages; the marketing
  site collects minimal data (only an email if a waitlist/contact form is added). No
  patient-identifiable data ever.

## 11. Open sub-decisions / future

- **Free-tool choice** (placement-hours calculator vs drug-calc quiz) — recommend the
  calculator first (matches the wedge). Build when the "later" phase starts.
- **Brand tagline** — candidate: _"The all-in-one planner for UK student nurses."_
- **Reviews/testimonials** — collect real ones to unlock `aggregateRating` rich results.
- **Guides/content hub** — the #1 future growth lever if the SEO/AI ceiling of a brochure
  proves too low; the Astro stack makes adding an MDX blog trivial.
- **B2B expansion** — grow `/for-universities` into a fuller track (case studies, demo
  booking, Capterra/G2 listings) as the paid motion matures.

## 12. Definition of done (v1 brochure)

- Astro static site, 6 pages + legal, deployed to a new S3 + CloudFront distribution on the
  apex; `www` → 301 → apex; existing ACM cert reused.
- `app.placemate.uk` set to `noindex`; apex is the indexed entity.
- Per-page titles/meta/canonical/OG; `sitemap.xml`; `robots.txt` (AI crawlers allowed);
  `llms.txt`; JSON-LD (§8); all-green Core Web Vitals.
- Plausible/Fathom + GSC (Route 53 TXT) + Bing Webmaster live.
- Primary "Sign up free" + secondary "Try the demo" CTAs to `app.placemate.uk`.
