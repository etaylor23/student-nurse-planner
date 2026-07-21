# Student Nurse Planner — Project Context & Handoff

A planner web app for **adult-field student nurses**, aligned to the NMC
proficiencies. This document is the single source of truth for everything
decided so far. Each feature has its own detailed `spec-*.md` (see the index at
the bottom). Hand this whole folder to Claude Code to continue the build.

---

## 0. How the code got here (read first)

The working app was built and **fully verified in an isolated sandbox** (it
installs, typechecks, passes 19 tests, production-builds, and serves the routes
with HTTP 200). The sandbox has **no access to the local filesystem**, so the
code was delivered as a downloadable zip, not written to
`/Users/ellistaylor/Work/student-nurse-planner` directly.

From here, **Claude Code** is the tool that edits the repo in place. These docs
exist so Claude Code can pick up with full context. The slice already built
(Core + Placement hours log) is in the delivered `student-nurse-planner.zip`;
these specs describe both what's built and what's next.

---

## 1. What this is

- **Product:** A planner for student nurses, structured around the NMC
  proficiencies and the realities of a UK pre-registration programme.
- **Audience:** Built **primarily for other students**, not the author. The
  author already has the domain knowledge and is building the tool for others.
- **Field:** **Adult** nursing (the others — mental health, learning
  disabilities, children's — are future extensions).
- **Programmes:** Must support **all** programme types and years (3-year BSc,
  2-year accelerated MSc, nursing apprenticeship, etc.). The number of
  programme "parts" varies, so it's configurable per user — see below.
- **Platform:** **Both** mobile and desktop — a responsive web app.
- **University-agnostic:** Must **not** mirror any one university's PAD/OAR
  layout. It uses the national NMC framework as the baseline; university-specific
  variation is handled by per-user configuration and custom additions.

## 2. The eight features

| # | Feature | Status |
|---|---------|--------|
| 1 | NMC competency tracker | **Built** (+ Profile screen) |
| 2 | Placement hours log | **Built** |
| 3 | Reflection on practice | **Built** |
| 4 | Clinical skills development / skills tracker | **Built** |
| 5 | Weekly shift planner | **Built** |
| 6 | Medication notes | **Built** |
| 7 | Self-care checklist | **Built** |
| 8 | Revision timetable | **Built** |

A **Profile / Settings** screen (`spec-profile.md`) was built alongside the competency
tracker, since gap surfacing needs the student's current programme part. A **Home /
Today** hub (`spec-home.md`) is the landing page (`/` redirects there) — connective
tissue that mounts the existing screens' hooks/components; it adds no new data.

## 3. Foundational decisions ("Start here")

These ripple across everything:

1. **Field:** Adult.
2. **Programme types:** All of them. The app is for other students across any
   programme, so it can't assume a fixed structure.
3. **Audience:** Primarily other students; the author has the knowledge and is
   building it for them.
4. **Platform:** Both — responsive web.
5. **University-agnostic:** National framework as baseline; no single
   university's PAD/OAR hardcoded.

## 4. Architecture decisions (locked)

Full detail in [`spec-architecture.md`](./spec/spec-architecture.md). Summary:

- **Persistence (PoC):** IndexedDB via **Dexie**, behind a storage-agnostic
  async **`Repository`** interface. The canonical data model is expressed as a
  Prisma schema (the future/remote shape); the PoC stores the same entity shapes
  locally.
- **Multi-user, live in production:** every user-owned row carries `userId`. The
  remote backend (AWS Cognito magic-link + a single owner-partitioned DynamoDB table +
  Amazon Verified Permissions + local-first sync) is built behind the `Repository` seam
  (`<RepositoryProvider repo={...}>`) and **deployed live at
  [https://app.placemate.uk](https://app.placemate.uk)** (CloudFront + ACM cert in
  us-east-1; same-origin `/api`). Magic-link mail sends from **hello@placemate.uk** on a
  Route 53-hosted domain with SPF + DKIM + custom MAIL FROM + DMARC for inbox
  deliverability. Signed-in users run local-first sync over the remote; **guest mode
  stays on Dexie.** See [`infra/`](./infra/README.md), the
  [implementation roadmap](./spec/spec-implementation-roadmap.md), and
  [`HANDOVER-placemate-domain.md`](./HANDOVER-placemate-domain.md) for the domain/SES
  cutover.
- **Reference/seed data is not user-owned:** the NMC proficiency master list,
  the baseline skills list, the baseline revision subjects, and the default
  break-rule table are shared seed data, not per-user.
- **One `Shift` entity, shared by the planner and the hours log.** The planner
  is a calendar *view*; a `PLANNED` shift becomes `COMPLETED` (and counts toward
  hours) only when the supervising registered nurse is named.
- **Polymorphic `EvidenceLink`:** a single table links a proficiency to a
  reflection, a skill, or a shift — so the competency tracker can pull evidence
  from anywhere, and adding a new evidence type later is a one-line change.
- **PAD-style status with dated history:** competency progress is
  not-yet-achieved / developing / achieved, with a status-event history so
  reassessment across programme parts is preserved.
- **Calendar = one-way `.ics` subscription feed for v1** (works on Google /
  Apple / Outlook); true two-way sync (Google Calendar API first) is a later
  phase.
- **Medications are a study/reference tool only** — never a clinical dosing
  reference, no patient-identifiable data, and numeracy drills use illustrative
  numbers, not a named drug's real doses.

## 5. Design decisions

- **Modern and minimal.** Clean white surface, hairline borders, generous
  whitespace, a single restrained accent (emerald), refined type.
- **Ultra-wide layout** with ~**5–6rem side margins** on large screens
  (`lg:px-20 xl:px-24`), smaller on mobile. Content uses a **responsive grid**
  (`grid-cols-12` on `lg`).
- **Left-hand fly-over navigation:** hidden by default; on desktop it **slides
  in and floats over the content** when you hover the left margin strip
  (pure CSS `group-hover`). On mobile (no hover) a slim top bar with a menu
  button opens it as a drawer with a tap-to-close backdrop.
- **Routing:** `react-router-dom` v7. Nav links for all features; **an item is
  disabled until its feature is implemented.** A **Home** hub leads the nav, so `/`
  and unknown routes redirect to `/home` (the first enabled item). All eight feature
  nav items are now enabled.

## 6. Build order / roadmap

1. **Core + Placement hours log** — ✅ built & verified.
2. **Weekly shift planner** — the `PLANNED→COMPLETED` flow and the `.ics` feed,
   on top of the same `Shift` entity.
3. **NMC competency tracker** — ✅ built (proficiency master list seeded plus
   `EvidenceLink`).
4. **Reflection on practice** — ✅ built (Gibbs cycle, lockable, `EvidenceLink`
   type `REFLECTION`; woven into the shift debrief, shift editor, placement
   debrief, evidence suggestions and the activity feed).
5. **Clinical skills tracker** — ✅ built (Annexe B baseline **derived** from the
   proficiency seed, plus `EvidenceLink` type `SKILL`).
6. **Medication notes** — ✅ built — + **Revision timetable** — ✅ built (targets,
   subjects → topics with confidence, spaced-repetition resurfacing, a Pomodoro runner,
   and shift-aware scheduling; numeracy reads `CalcStat`).

7. **Self-care checklist** — ✅ built (gentle, private; flexible rhythm + a post-hard-shift
   debrief nudge; energy note that signposts support when low; no streaks). Brought the
   first slice of **web notifications** — a Profile button that simulates a daily
   check-in reminder (see `spec/notifications.md`).

(All eight features are now built.)

## 7. What's already built (slice 1)

A full **Vite + React 18 + TypeScript + Tailwind v4** app:

- Data layer: `Repository` interface + `DexieRepository` (IndexedDB) with
  self-seeding (`LOCAL_USER_ID`, default break-rule table).
- Domain: `User`, `Placement`, `Shift`, `BreakRule` (+ enums).
- Pure logic (unit-tested): break-band resolution, net-hours calculation,
  the hours summary, timesheet building + CSV.
- React: `RepositoryContext`, hooks (`useBreakRules`, `usePlacements`,
  `useShifts`), and components — `HoursLogPage`, `HoursSummaryPanel`,
  `ShiftForm`, `PlacementManager`, `TimesheetExport`.
- Shell: `AppLayout` (fly-over nav + margins), `SideNav`, `nav.ts` (nav config),
  `App.tsx` (router).
- **19 passing tests**, clean `tsc`, working production build.

Deps added beyond the base stack: `dexie`, `react-router-dom@^7`,
`lucide-react`.

## 8. Cross-cutting guardrails

- **Medication notes are a study aid, not a dosing reference.** No
  patient-identifiable data anywhere; calc drills use generic/illustrative
  numbers only.
- **Reflections are private and sensitive.** Lockable, with a standing reminder
  not to include patient-identifiable information.
- **The PAD/OAR remains the official signed record.** Everything here is a
  personal study/organisation aid; exports (e.g. the timesheet) are for the
  student's own use, not a replacement for formal sign-off.

## 9. Tech stack & running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc --noEmit && vite build
npm run test       # vitest run (190 tests)
npm run typecheck
npm run gen:zod    # regenerate src/domain/schemas.generated.ts from types.ts (ts-to-zod)
```

Stack: Vite 6, React 18, TypeScript 5, Tailwind v4 (`@tailwindcss/vite`),
react-router-dom 7, Dexie 4, lucide-react, Vitest 2 (+ fake-indexeddb), zod (server
input-validation schemas, codegen'd via ts-to-zod).

The remote backend lives in a separate CDK app under [`infra/`](./infra/README.md)
(`cdk synth` / `cdk deploy` — see its README). It is not deployed yet.

### Build & deployment (CI/CD)

**Push to `master`, CI gates it, then the right things ship — by path.** One gated
pipeline (`.github/workflows/pipeline.yml`) runs the CI checks on every push and PR, and
deploys the path-matched deployables **only after every CI check passes** — a red commit
can never reach the live app. Change several deployables at once and each that passed its
filter ships. Everything runs on **GitHub Actions**, **free** on this public repo, via the
GitHub→AWS **OIDC role** `github-actions-deploy` in account `641364901830` — **no stored
secrets, no build servers, no paid CI**.

There is **no GitHub Pages** — it was retired. The single live app is on CloudFront.

**CI (always, on every push + PR):** `ci-app` (typecheck, ESLint, `gen:zod` drift, tests)
and `ci-infra` (`cdk synth`). Both must pass before any deploy job runs.

| Deployable | Build | Deploys (after CI passes) when these change | Lands on |
|------------|-------|---------------------------------------------|----------|
| **App SPA** | `npm run build` | `src/**`, `index.html`, `package*.json`, `vite.config.ts`, `tsconfig*.json` | S3 + CloudFront → **app.placemate.uk** |
| **Backend / CDK** | `cdk deploy` | `infra/**`, **`src/data/**`, `src/domain/**`** (the router Lambda imports these) | AWS (DynamoDB, Cognito, API GW, CloudFront) |
| **Marketing site** | `cd site && npm run build` | `site/**` | S3 + CloudFront → **placemate.uk** |

The backend filter includes `src/data/**` and `src/domain/**` because the router Lambda
bundles that code — a change there redeploys the Lambda too, so the SPA and its backend
never drift out of sync. A push touching only `.github/workflows/**` runs CI and deploys
nothing.

**Target environment.** Deploys target the **`dev`** stack (`NursePlanner-dev`), which is
**promoted-in-place to production** — it _is_ the live env behind app.placemate.uk (custom
domain, verified SES, `retainData`; see [`infra/lib/config.ts`](./infra/lib/config.ts)).
The `prod` config is an unused placeholder. Manual runs pick the env and what to deploy:

```bash
gh workflow run "CI + Deploy" -f environment=dev -f target=frontend
gh workflow run "CI + Deploy" -f environment=dev -f target=backend
gh workflow run "CI + Deploy" -f environment=dev -f target=all
```

**Why it's cheap & fast.** Path filters mean a change builds only what it touches (no
whole-repo rebuilds). Each deploy issues a single `/*` CloudFront invalidation (within the
1,000/month free tier). Per-env `concurrency` groups collapse redundant in-flight runs —
the backend group never cancels an in-flight CloudFormation update.

**Notes.**

- The **first** CDK deploy of an env needs a one-time human `cdk bootstrap` (`dev` is
  already bootstrapped).

### Runbooks

- [`docs/runbooks/erasure.md`](./docs/runbooks/erasure.md) — action a UK GDPR erasure
  request: `scripts/delete-user.ts <email>` (dry-run by default) deletes the user's whole
  DynamoDB partition (incl. tombstones) + cross-partition grants + the Cognito user, plus
  the manual Sentry/inbox tail. Companion beta-operator scripts: `scripts/invite-user.ts`
  (provision + magic link) and `scripts/send-pre-welcome-email.ts`.

## 10. Spec index

- [`spec-architecture.md`](./spec/spec-architecture.md) — data model (full Prisma
  schema), repository pattern, persistence, shared `Shift`, `EvidenceLink`,
  calendar feed, derived logic, seed data, build order.
- [`spec-nmc-foundations.md`](./spec/spec-nmc-foundations.md) — the NMC framework
  facts the app is built on (platforms, annexes, hours), and seeding guidance.
- [`spec-placement-hours-log.md`](./spec/spec-placement-hours-log.md) — **built.**
- [`spec-weekly-planner.md`](./spec/spec-weekly-planner.md) — **built.**
- [`spec-competency-tracker.md`](./spec/spec-competency-tracker.md) — **built.**
- [`spec-profile.md`](./spec/spec-profile.md) — **built.**
- [`spec-medication-notes.md`](./spec/spec-medication-notes.md) — **built.**
- [`spec-clinical-skills.md`](./spec/spec-clinical-skills.md) — **built.**
- [`roadmap-usability.md`](./spec/roadmap-usability.md) — **the current build
  plan**: 11 prioritised usability/interconnectedness items (U1–U11) over the
  built screens, in three waves. Self-contained brief — read it before starting
  new work.
- [`spec-reflection.md`](./spec/spec-reflection.md) — **built.**
- [`spec-revision-timetable.md`](./spec/spec-revision-timetable.md) — **built.**
- [`spec-self-care.md`](./spec/spec-self-care.md) — **built.**
- [`notifications.md`](./spec/notifications.md) — web notifications; the self-care
  check-in "simulate" button is built, shift reminders are specced-not-built.

### Backend migration (auth + DynamoDB) — in progress

- [`spec-implementation-roadmap.md`](./spec/spec-implementation-roadmap.md) — **the build
  playbook**: phases, [AGENT]/[YOU]/[GATE] steps, autonomy rails. Read first.
- [`spec-auth.md`](./spec/spec-auth.md) — Cognito magic-link passwordless auth, token
  handling, provisioning, the fate of local-only affordances.
- [`spec-backend-dynamodb.md`](./spec/spec-backend-dynamodb.md) — single owner-partitioned
  DynamoDB table, RPC API, AVP/Cedar authorisation, local-first sync.
- [`spec-dns-email.md`](./spec/spec-dns-email.md) — **LIVE**: placemate.uk on Route 53,
  `app.placemate.uk` (CloudFront + ACM), and SES sending from `hello@placemate.uk` with
  SPF + DKIM + custom MAIL FROM + DMARC.
- [`spec-corporate-website.md`](./spec/spec-corporate-website.md) — **BUILT**: lean Astro
  brochure on the `placemate.uk` apex, engineered for Google SEO + AI-assistant discovery
  (keyword map, structured data, `llms.txt`, off-site levers). Source in [`site/`](./site);
  deployed by the `NursePlanner-Marketing` CDK stack + `deploy-marketing.yml`. The app SPA
  is `noindex` so the apex is the single indexed entity.
- [`spec-calendar-feed.md`](./spec/spec-calendar-feed.md) · [`spec-notifications-backend.md`](./spec/spec-notifications-backend.md)
  — the two non-JWT surfaces (later phases).
- [`infra/`](./infra/README.md) — the CDK app implementing Phase 0 (scaffolded, synths
  clean, not yet deployed).
