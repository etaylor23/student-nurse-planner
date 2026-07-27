# HANDOVER — build & deploy the PlaceMate corporate/marketing website

You are picking up a **decisions-locked** task: build the lean marketing brochure for
**PlaceMate** on the **`placemate.uk` apex** and deploy it, engineered for Google SEO **and**
AI-assistant discovery. The strategy, IA, keyword map, structured-data plan, AEO posture,
measurement and off-site levers are already resolved in
**[`spec/spec-corporate-website.md`](./spec/spec-corporate-website.md)** — read it first; it is
the source of truth for *what* to build. This handover adds the *execution/deployment*
specifics the spec doesn't carry. Don't re-litigate the locked decisions.

---

## 0. Context — what already exists

- **App is LIVE** at `https://app.placemate.uk` (a Vite/React SPA on CloudFront). SES sends
  magic links from `hello@placemate.uk` with SPF/DKIM/DMARC verified. DNS + email are done —
  see [`spec/spec-dns-email.md`](./spec/spec-dns-email.md). The apex `placemate.uk` is reserved
  for THIS marketing site and is currently unconfigured (only NS/SOA in the zone).
- **Repo:** `/Users/ellistaylor/Work/student-nurse-planner`. Work on **`master`**; commit +
  push straight to it (`git checkout master` first — repo is detached-HEAD-prone).
- **Gates to keep green:** `npm run typecheck`, `npm test` (279), `npm run lint`
  (`eslint . --quiet`), `npm run format:check`, and `cd infra && npx cdk synth`.

## 🔴 HARD RULE (non-negotiable)
**NEVER take ANY action in the `ellis.taylor@optimalcompliance.com` / "Novel App LTD"
account (`987960985651`).** ALL work is in the **personal** account **`641364901830`**
(CLI profile **`personal`**, region **`eu-west-2`**). The connected browser may be signed
into the corporate account — do not use it for AWS actions unless the console badge reads
`641364901830`. Every `aws`/`cdk` command uses `--profile personal`.

## 1. Locked AWS / DNS facts (use verbatim)

| Thing | Value |
|---|---|
| AWS account / region / profile | `641364901830` / `eu-west-2` / `personal` |
| Route 53 hosted zone (`placemate.uk`) | `Z01422912TXS1SRHFVF2E` |
| ACM cert to **reuse** (us-east-1, covers `placemate.uk` + `*.placemate.uk`) | `arn:aws:acm:us-east-1:641364901830:certificate/433e1f50-cfd9-45e0-960b-a9e0ca3b66b6` |
| App CloudFront distribution (**do NOT touch** except §4.D noindex) | `E3ROJUBT1ZLKZV` (`app.placemate.uk`) |
| CDK app | `/infra` (TypeScript); stacks in `bin/app.ts`; constructs in `infra/lib/constructs/` |
| Apex / www records | none yet (clean to add) |

## 2. Locked execution decisions (made in this thread; change only with good reason)

1. **Framework:** **Astro (static)**, `output: 'static'`, `build.format: 'directory'`,
   `site: 'https://placemate.uk'`. Tailwind (match the app's clean aesthetic), `@astrojs/sitemap`.
2. **Repo layout:** Astro source in a **new top-level `site/`** dir in THIS repo. The
   deploy **infra lives in `/infra`** (unified CDK app already owns the zone + app dist).
   **Add `site/` to `.eslintignore` + `.prettierignore`** (Astro has its own conventions) so
   the app's root gates stay green.
3. **Deploy infra:** a **new, separate CDK stack `NursePlanner-Marketing`** (eu-west-2) —
   keep it OUT of `NursePlanner-dev` so marketing deploys never risk the live app/data stack.
   Instantiate it in `bin/app.ts`. Contents:
   - **S3 bucket** (private, OAC) for the static build.
   - **CloudFront distribution**, `domainNames: ['placemate.uk', 'www.placemate.uk']`,
     `certificate: Certificate.fromCertificateArn(this, 'Cert', '<the ARN above>')` — a plain
     ARN import (cert is already in us-east-1), **no `crossRegionReferences` needed**.
   - **CloudFront Function (viewer-request)** doing two jobs: (a) if `Host` is
     `www.placemate.uk`, return **301 → `https://placemate.uk` + same path**; (b) otherwise
     rewrite extensionless/directory paths to `…/index.html` (Astro `directory` format →
     `/features` must serve `/features/index.html`). Model it on the existing
     `web.ts` `spaRouter` function, but this one is directory-index + host-redirect, **not**
     SPA-catch-all.
   - **`ResponseHeadersPolicy`** with security headers + a CSP suited to a marketing site:
     `default-src 'self'`; allow the analytics vendor (`script-src`/`connect-src`
     `https://plausible.io`); `img-src 'self' data:`; HSTS; `X-Content-Type-Options`;
     `frame-ancestors 'none'`.
   - **Route 53** in zone `Z01422912TXS1SRHFVF2E`: `A` + `AAAA` **alias** for `placemate.uk`
     **and** `www.placemate.uk`, both → this distribution (the CF Function 301s www→apex).
4. **Analytics:** **Plausible Cloud** (cookieless → **no consent banner**). Add its script;
   allow `plausible.io` in the CSP. (Fathom is an equivalent fallback.)
5. **App `noindex`:** the SPA must not compete/leak. Add `X-Robots-Tag: noindex, follow` to
   `NursePlanner-dev`'s app distribution via the `web.ts` `ResponseHeadersPolicy`
   (`customHeadersBehavior`). Small, in-place change to the app stack; `cdk diff` to confirm
   nothing else changes.
6. **CI/CD:** new `.github/workflows/deploy-marketing.yml` (OIDC, mirrors
   `deploy-frontend.yml`): build Astro → `aws s3 sync site/dist` to the marketing bucket
   (hashed assets `immutable`, HTML `no-cache`) → CloudFront invalidation. **Extend the
   `github-actions-deploy` IAM role** (`perms.json`) to the new bucket + distribution.

## 3. On-page build (per `spec-corporate-website.md`)

- **Pages:** `/` (Home — anchor **"student nurse planner"**), `/features`, `/for-universities`,
  `/about`, `/pricing`, `/faq`, plus `/privacy`, `/terms`, `/contact`. CTAs: **"Sign up free"**
  (primary → `app.placemate.uk`) + **"Try the demo"** (secondary → guest mode).
- **Per page:** unique `<title>` + meta description, one `<h1>`, canonical (apex, never www),
  Open Graph + Twitter cards + branded OG image, semantic HTML, `lang="en-GB"`.
- **Keyword map:** §4 of the spec (Home = category term; Features = feature terms; FAQ =
  question/answer-engine terms; For-universities = B2B terms).
- **JSON-LD (spec §8):** `Organization`, `WebSite`, `WebApplication`
  (`EducationalApplication`, free `offers`), `FAQPage`, `BreadcrumbList`. **No
  `aggregateRating`** until real reviews exist.
- **AEO (spec §7):** `robots.txt` **allows all AI crawlers** (`GPTBot`, `OAI-SearchBot`,
  `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `CCBot`) + references the sitemap; add
  **`llms.txt`** (markdown overview + page links); write FAQ answers **answer-first,
  self-contained, citable**; state citable facts plainly (NMC practice-hours figure, number
  of proficiencies tracked). Verify against the app's real numbers before publishing.

## 4. Ordered plan

- **A. Scaffold** `site/` (Astro + Tailwind + sitemap); add ignores (decision §2.2).
- **B. Build** the 9 routes with all on-page SEO + JSON-LD + `robots.txt` + `llms.txt` +
  sitemap (spec §§4–8).
- **C. Infra** — add `NursePlanner-Marketing` stack (§2.3); `cdk diff` (must be **purely
  additive**, zero changes to `NursePlanner-dev`) → `cdk deploy NursePlanner-Marketing`.
- **D. App noindex** — edit `web.ts` header policy (§2.5); `cdk diff NursePlanner-dev`
  (only the header changes) → deploy.
- **E. CI/CD** — `deploy-marketing.yml` + extend the OIDC role; run it to publish.
- **F. Verify** (agent): `https://placemate.uk` returns **200 with real HTML content in
  view-source** (not an empty shell); `www` → **301** → apex; valid cert; robots.txt /
  sitemap.xml / llms.txt reachable; JSON-LD passes Google's Rich Results Test; Core Web
  Vitals green (Lighthouse); `app.placemate.uk` now returns `X-Robots-Tag: noindex`.

## 5. Human [YOU] steps (flag as you reach them)

- **Google Search Console** — verify the domain property via a **DNS TXT record in the zone**
  (the agent can add the TXT once you paste the token, since we control Route 53).
- **Bing Webmaster Tools** — verify (import from GSC); matters because ChatGPT/Copilot use Bing.
- **Plausible** — create the account + `placemate.uk` site; paste the script snippet/domain.
- **Social profiles** (Instagram/TikTok) — create + supply URLs for `Organization.sameAs`.
- **Off-site discovery (all LATER; direct outreach FIRST)** — the four levers in spec §9:
  university/`.ac.uk` outreach first, then a free interactive tool, social, community/Product Hunt.
- **SES production access** (unrelated to this site but gates open self-signup) — reply to
  case `178367384100078` from a browser signed into `641364901830` (draft already prepared).

## 6. Gotchas
- CloudFront viewer certs must be us-east-1 — we **reuse** the existing one by ARN (no new
  cert, no cross-region machinery).
- Astro `directory` format needs the CF Function to map `/path` → `/path/index.html`, and a
  `404.html`. Don't reuse the app's SPA catch-all rewrite (different behaviour).
- Keep `NursePlanner-dev` untouched by the marketing stack — `cdk diff` both stacks before
  deploying; the only intended app-stack change is the `noindex` header (§4.D).
- Don't fabricate reviews/ratings or stats — cite the app's real figures.

## 7. Definition of done
Matches `spec-corporate-website.md` §12: Astro static site (6 pages + legal) live on the
apex via the new S3+CloudFront stack; `www`→301→apex; existing cert reused; app `noindex`;
per-page titles/meta/canonical/OG + `sitemap.xml` + `robots.txt` (AI crawlers allowed) +
`llms.txt` + JSON-LD; green CWV; Plausible + GSC + Bing live; CTAs to `app.placemate.uk`.
Docs (`README.md` spec index already links the spec) updated in the same commit as the code.
