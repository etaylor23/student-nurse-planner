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
| 3 | Reflection on practice | Specced — next up |
| 4 | Clinical skills development / skills tracker | **Built** |
| 5 | Weekly shift planner | **Built** |
| 6 | Medication notes | **Built** |
| 7 | Self-care checklist | **Deferred** |
| 8 | Revision timetable | Specced — not built |

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
- **Multi-user ready, auth deferred:** every user-owned row carries `userId`.
  The PoC uses a single local user (`LOCAL_USER_ID`). Per-student login is the
  intended future standard, but **not yet** — the data model is set up so a
  remote DB + auth is a drop-in (`<RepositoryProvider repo={...}>`).
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
  and unknown routes redirect to `/home` (the first enabled item); Reflection,
  Revision and Self-care remain the disabled "Soon" items.

## 6. Build order / roadmap

1. **Core + Placement hours log** — ✅ built & verified.
2. **Weekly shift planner** — the `PLANNED→COMPLETED` flow and the `.ics` feed,
   on top of the same `Shift` entity.
3. **NMC competency tracker** — ✅ built (proficiency master list seeded plus
   `EvidenceLink`).
4. **Reflection on practice** — plugs into `EvidenceLink` (next up).
5. **Clinical skills tracker** — ✅ built (Annexe B baseline **derived** from the
   proficiency seed, plus `EvidenceLink` type `SKILL`).
6. **Medication notes** — ✅ built — + **Revision timetable**.

(**Self-care checklist** is deferred until the rest is in good shape.)

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
npm run test       # vitest run (19 tests)
npm run typecheck
```

Stack: Vite 6, React 18, TypeScript 5, Tailwind v4 (`@tailwindcss/vite`),
react-router-dom 7, Dexie 4, lucide-react, Vitest 2 (+ fake-indexeddb).

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
- [`spec-reflection.md`](./spec/spec-reflection.md) — **next.**
- [`spec-revision-timetable.md`](./spec/spec-revision-timetable.md)
- [`spec-self-care.md`](./spec/spec-self-care.md) — **deferred.**
