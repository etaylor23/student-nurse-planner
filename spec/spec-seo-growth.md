# Spec — SEO & AEO Growth (placemate.uk)

_Status: **PLANNED** (not built). Output of a grill-me design session (2026-07-22)._

_This spec builds on [`spec-corporate-website.md`](./spec-corporate-website.md), which
covers the brochure's on-page SEO + answer-engine optimisation (AEO) and is **BUILT and
live**. That spec deliberately deferred the biggest growth levers (a guides hub, a free
tool, off-site discovery) to "later" (its §9/§11). **This spec turns those deferred levers
into a committed, full-speed plan**, deepens AI discoverability, and adds a measurement
scoreboard. It does not restate the brochure's on-page conventions — see the corporate
spec §5–§8 for those._

---

## 0. Relationship to other specs & ownership key

**Already built (do not re-spec):** the 6-page brochure, per-page titles/meta/canonical/OG,
JSON-LD (Organization / WebSite / WebApplication / FAQPage / BreadcrumbList), `sitemap.xml`,
`robots.txt` (all AI crawlers allowed), `llms.txt`, cookieless Plausible analytics,
`app.placemate.uk` set to `noindex`. See [`spec-corporate-website.md`](./spec-corporate-website.md)
and [`spec-dns-email.md`](./spec-dns-email.md).

**Ownership key** (used throughout):

| Tag | Who | Responsible for |
|---|---|---|
| **[ELLIS]** | Ellis (founder) | Accounts, outreach, launches, sign-off |
| **[NICOLA]** | Nicola (co-founder, **Registered Nurse**) | Clinical accuracy review; named author |
| **[PHARM]** | Qualified pharmacist (available, future) | Drug-calculation / medication-numeracy review |
| **[CLAUDE]** | AI agent | SEO architecture, code (Astro collections, tools, schema, sitemap, IndexNow), content scaffolding + Fable drafting |

---

## 1. Goals & strategy (locked in grill-me)

- **Full speed now**, despite invite-only beta. Rationale: the domain is ~2 weeks old
  (registered 10-Jul-2026) with zero authority; indexing, domain-age trust, and backlinks
  all take **weeks-to-months**. Starting the clock now is the highest-leverage timing call,
  even before self-signup opens.
- **Dual objective:** (a) rank in **Google organic** for student-nurse intent, and (b) be
  **named by AI answer engines** (ChatGPT, Claude, Perplexity, Google AI Overviews) when a
  student asks e.g. "best app for tracking nursing placement hours."
- **Primary guardrail — quality over volume (YMYL).** This is health-adjacent content;
  Google's E-E-A-T bar is high and its scaled-content-abuse policy punishes mass-produced
  pages. Every piece is clinically reviewed and genuinely differentiated, and publishing
  follows a **natural curve** — never a burst dump onto a new domain (§9).

---

## 2. Success metrics — the scoreboard (monthly review)

**Tools (all free):** Google Search Console (GSC), Bing Webmaster Tools, existing Plausible.

**Metrics tracked:**

| Metric | Source | Why |
|---|---|---|
| Pages indexed | GSC + Bing | Baseline: is the site even in the index yet? |
| Impressions + clicks by **query cluster** | GSC | Which topics are gaining traction |
| Target keyword positions | GSC | Movement on the §4 (corporate spec) term map + guide terms |
| Referring domains (esp. **`.ac.uk`**) | GSC links report | Off-site authority growth |
| Brand-search volume ("PlaceMate") | GSC | Awareness → a ranking signal in its own right |
| **AI-citation spot-check** | Manual, monthly | Whether PlaceMate is *named* by AI (see below) |

**AI-citation spot-check (the AEO scoreboard):** once a month, run a **fixed prompt set**
against ChatGPT, Claude, Perplexity, and Google AI Overviews, and log whether PlaceMate is
named. Starter prompts: _"best app for tracking student nurse placement hours", "how do UK
student nurses track NMC proficiencies", "tool to practise nursing drug calculations"_.
This is the only reliable way to measure AEO, and almost nobody does it.

**Cadence:** monthly review. **Owner: [ELLIS]** (data pull) + [CLAUDE] (analysis on request).

**Directional milestones** (validate/reset once real GSC data lands — these are hypotheses,
not promises):

- **~3 months:** all pages + first guides/tools indexed; ranking (any position) for a
  handful of long-tail question terms; first 1–2 referring domains.
- **~6 months:** page-1 for several low-competition long-tail terms; first `.ac.uk` link;
  occasional AI citation on brand/near-brand prompts.
- **~12 months:** ranking for mid-competition category terms; cited by ≥1 AI engine on
  generic prompts; a small but compounding organic channel.

---

## 3. Content hub — `/guides` (pillar + cluster)

The single biggest lever short of paid acquisition, and the main fuel for AI citations.

**Architecture: pillar + cluster.** 4 deep pillar guides, each with 3–5 supporting cluster
articles, richly interlinked (clusters link up to their pillar and out to the relevant app
feature + free tool; pillars link down to clusters). **Launch corpus ~12–16 pieces.**

**The 4 pillars** (mapped to the intent clusters in corporate spec §4):

1. **Placement hours** — pillar: _"Student nurse placement hours, explained"_.
   Clusters: how to track your hours; the 2,300-hour breakdown; the 600-hour simulated-
   learning cap; what counts as practice; per-year expectations.
2. **NMC proficiencies & the PAD** — pillar: _"The NMC proficiencies and your PAD"_.
   Clusters: the 7 platforms explained; Annexe B nursing procedures; how to evidence a
   proficiency; getting assessor sign-off; PAD tips.
3. **Reflective practice** — pillar: _"How to write a nursing reflection"_.
   Clusters: Gibbs cycle with a worked example; Driscoll's model; what to avoid (keeping
   patient-identifiable info out); reflections for future revalidation.
4. **Drug calculations / medication numeracy** — pillar: _"Nursing drug calculations"_.
   Clusters: the core formula; practice questions; common mistakes; unit conversions.
   **All [PHARM]-reviewed** (see §4).

**Production pipeline** (per piece):

1. **[CLAUDE]** builds the SEO architecture + fact scaffold — target query, title/meta,
   H2s that mirror real searches, citations to pull, schema, internal links.
2. **[CLAUDE]** drafts the prose **in Fable mode** (Fable 5 — strongest of the family at
   long-form, human-sounding writing; keeps guides from reading as robotic/mass-produced,
   which matters for dwell time *and* for staying clear of "scaled content" heuristics).
3. **[NICOLA]** (or **[PHARM]** for pillar 4) reviews for clinical accuracy and signs off.
4. Publish. See §9 for the waved cadence.

**Publishing cadence:** waves over ~6 weeks (§9), **not** all at once — burst-publishing on
a 2-week-old domain is a spam signal. Then **2–4 high-quality pieces/month** ongoing.

**Per-guide requirements:** unique `<title>`/meta/canonical/OG (branded per-guide OG image,
§7); one `<h1>` on the primary term; **answer-first intro** (lead with a direct, ~40–60-word
citable answer, then depth); NMC/primary-source citations; `Article` + author (`Person`) +
`reviewedBy` schema, plus `HowTo`/`FAQPage` where the format fits; `BreadcrumbList`;
descriptive internal links; visible published + `dateModified` dates.

**Implementation:** an Astro **content collection** (MDX) at `site/src/content/guides/`,
with a `/guides` index (hub) page and pillar/cluster routing. Fits the existing Astro stack
(corporate spec §3) with ~zero JS.

---

## 4. E-E-A-T & accuracy governance (the YMYL bar)

Health-adjacent content ranks only with strong trust signals. We have a real one.

- **Named author / clinical reviewer: Nicola Nightingale, Registered Nurse** (co-founder).
  Create an **author entity**: a `/about`-linked author bio page + `Person` JSON-LD (`name`,
  `jobTitle: "Registered Nurse"`, `worksFor` → the PlaceMate `Organization`). This gives the
  content a credentialed, verifiable human behind it.
- **`reviewedBy`** on every clinically-substantive article, plus a **visible line**:
  _"Clinically reviewed by Nicola Nightingale, Registered Nurse, on [date]."_
- **Pharmacist reviewer for the drug-calculation / medication-numeracy cluster** ([PHARM]).
  Available now; wire in the byline + `reviewedBy` when the first med-numeracy pieces are
  drafted. Pharmacist sign-off on numeracy content is a genuine trust edge.
- **Cite primary sources** — NMC _Standards of proficiency for registered nurses_ (2024),
  NMC website, and other authoritative bodies — linked inline.
- **Disclaimers (site-wide + per relevant page):** not affiliated with or endorsed by the
  NMC; **educational, not clinical advice**; keep no patient-identifiable information.
  (Extends the footer disclaimer already live.)
- **Freshness:** maintain `dateModified`; re-review the corpus when NMC standards change.

---

## 5. Free interactive tools (both — full build, launch phase)

Standalone, indexable, link-earning, AI-citable assets that each rank for their own query
and route users into the app. Both client-side, **no PII**.

**Tool 1 — Placement-hours calculator.** `/tools/placement-hours-calculator`.
Inputs: total programme practice-hour target (default 2,300), hours completed, simulated
hours used. Outputs: hours remaining, % complete, and a flag against the 600-hour simulated
cap. Targets _"nursing placement hours calculator"_. `SoftwareApplication`/`WebApplication`
+ `HowTo` schema, answer-first copy, CTA → app. **Build: [CLAUDE].**

**Tool 2 — Drug-calculation practice quiz.** `/tools/drug-calculation-practice`.
Generates practice questions, checks working, tracks accuracy over a session. Targets
_"drug calculation practice questions nursing"_. **Content + formulae [PHARM]-reviewed**;
clinically careful framing (**practice only — never for real-world dosing**). Same schema
pattern. **Build: [CLAUDE]; review: [PHARM].**

Both tools link to the relevant `/guides` cluster and to the app, and are the primary
targets for university-resource-page links (§8).

---

## 6. AI / Answer-Engine deepening (beyond corporate spec §7)

- **Keep `llms.txt` current** — add `/guides` and `/tools` entries as they ship.
- **Add `llms-full.txt`** — an expanded, full-text corpus (the emerging companion to the
  `llms.txt` index) that answer engines can ingest wholesale.
- **Structured-data expansion** — `Article` + `Person` (author) + `reviewedBy` on guides;
  `HowTo` on guides/tools where the format fits (§3/§5).
- **Answer-first everywhere** — guides, tools, and FAQ all lead with a self-contained,
  citable answer. This is what assistants lift verbatim.
- **Entity building** — one consistent name/description/NAP; `Organization.sameAs` → the
  live IG/TikTok profiles (§7, unblocked by §8); pursue authoritative third-party mentions.
- **Measure it** — the monthly AI-citation spot-check (§2) is the feedback loop.
- Retain the **AI-crawler-friendly `robots.txt`** posture (already live).

---

## 7. Technical SEO wins (from the 2026-07-22 audit)

Small, mostly one-off — the site's technical base is already excellent.

- **`sameAs`** — `site/src/consts.ts` has `SOCIAL_LINKS` empty and the schema omits it until
  populated. **[ELLIS]** shares IG/TikTok handles → **[CLAUDE]** wires them in. (Depends on §8.)
- **Search Console + Bing** — verify GSC via a **Route 53 TXT record** (verifies apex + all
  subdomains at once) and submit `sitemap-index.xml`; set up Bing Webmaster (import from GSC).
  _(Bing feeds ChatGPT Search + Copilot — an AEO channel, not just a search one.)_ **[ELLIS]** + [CLAUDE].
- **IndexNow** (optional, recommended) — instant-indexing ping to Bing/Yandex on deploy, so
  new guides/tools are discovered in minutes not weeks. **[CLAUDE].**
- **Per-guide/tool OG images** — branded, templated from the existing `og/default.png`
  approach. **[CLAUDE].**
- **Keep `app.placemate.uk` `noindex`** — unchanged. Do not leak app screens into the index.
- **Re-confirm Core Web Vitals green** after guides/tools land (optimised AVIF/WebP images;
  Astro stays static). **[CLAUDE].**
- **Leave meta-description lengths as-is** — running slightly long is harmless (Google just
  truncates). Not worth churn.

---

## 8. Off-site discovery (launch-phase committed levers)

A new domain ranks — and gets named by AI — only with external corroboration. Committed:

1. **University / `.ac.uk` listings.** Direct outreach to nursing departments, student
   unions, and practice-placement-handbook editors asking to be listed on their student-
   resource pages. Highest-authority, most-relevant backlinks for this niche, and doubles
   as the first warm contact for the future B2B/universities motion. **Owner: [ELLIS]/[NICOLA]**
   (Nicola's RN credibility helps the pitch). Deliverables: a target list + an outreach
   template. **The guides + free tools are what make this land — they give departments
   something genuinely worth linking to.**
2. **Instagram + TikTok.** Official PlaceMate accounts where UK student nurses actually are.
   Drives brand awareness → brand searches (a ranking signal) → and feeds `Organization.sameAs`
   (§7). Light content plan: repurpose guide takeaways + short tool demos. **Owner: [ELLIS].**
   **Unblocks the `sameAs` technical win** once handles exist.

**Deferred (logged, not dropped — activate nearer public launch):** LinkedIn (company +
founder, B2B/university angle) and Product Hunt + community seeding (r/StudentNurseUK,
Facebook nursing-student groups) for episodic traffic/backlink spikes.

---

## 9. Phasing & sequencing

"Full speed" — but sequenced to front-load long-lead items and avoid burst-publishing.

- **Phase 0 — foundations (week 1):** GSC + Bing verify + submit sitemap; `llms-full.txt`;
  IndexNow; scaffold `/guides` (content collection) + `/tools`; create IG/TikTok → wire
  `sameAs`; build Nicola's author entity + site-wide disclaimers.
- **Phase 1 — tools (weeks 1–2):** ship **both** free tools (calculator + quiz). Fast,
  high-leverage indexable assets that also anchor the outreach.
- **Phase 2 — guides in waves (weeks 2–6):** Wave 1 = the 4 pillars; Waves 2–3 = clusters.
  Med-numeracy cluster gated on [PHARM] review.
- **Phase 3 — ongoing:** 2–4 guides/month; university outreach; social cadence; the monthly
  scoreboard review (§2).

---

## 10. Definition of done (growth v1)

- `/guides` hub live (Astro content collection); **≥12 pieces** across the 4 pillars,
  published in waves, each with author + `reviewedBy` + schema + citations + disclaimers.
- **Both** free tools live, indexable, schema-marked, with app CTAs; drug-calc quiz
  [PHARM]-reviewed.
- `llms.txt` updated + `llms-full.txt` shipped; `sameAs` populated; per-guide/tool OG images.
- GSC + Bing verified, `sitemap-index.xml` submitted, IndexNow active; Plausible goals set.
- Nicola author-entity page + `Person` schema live; disclaimers site-wide.
- Monthly scoreboard doc started (KPIs §2), with the AI-citation prompt set and 3/6/12-month
  goals recorded.
- University-outreach target list + template ready (first batch contacted); IG/TikTok live.

---

## 11. Risks & guardrails

- **YMYL accuracy** → clinical review is **mandatory** before publish; never give clinical
  advice; practice tools framed as practice only.
- **Scaled-content-abuse** → waved publishing + human review + a real quality bar; never a
  mass AI dump onto the new domain.
- **No fabricated `aggregateRating`/`Review`** until genuine reviews exist (carried over from
  corporate spec §8) — risks a manual action.
- **New-domain patience** → authority compounds over months; judge by leading indicators
  (indexing, impressions, referring domains), not week-one rankings.
- **No app deindex regressions**; avoid duplicate content between guides and the on-page FAQ
  (guides go deeper; FAQ stays summary + `FAQPage`).

---

## 12. Resolved sub-decisions (2026-07-22)

- **Byline / author entity:** **Nicola Nightingale, Registered Nurse.**
- **IndexNow:** **yes** — include (instant Bing/Yandex indexing on deploy).
- **Guide URL shape:** **flat** — `/guides/<slug>` (e.g. `/guides/how-to-write-a-nursing-reflection`).
  Revisit nested-by-pillar only if the corpus grows large.
- **Second-wave off-site levers** (LinkedIn, Product Hunt + community seeding): **trigger at
  public-signup launch.**
- **Wave-1 byline (2026-07-22):** the 4 pillar guides are published under a collective
  **"The PlaceMate team"** byline — schema author = the Organization, **no named person and
  no clinical-review claim** — because Nicola had not yet reviewed them at publish time.
  §4's rule stands for *named* bylines: a guide is flipped to the "Clinically reviewed by
  Nicola Nightingale, Registered Nurse" byline (frontmatter `author: "nicola-nightingale"`)
  only after she has actually reviewed that guide. Flipping wave 1 to reviewed bylines is
  the standing next E-E-A-T action.
