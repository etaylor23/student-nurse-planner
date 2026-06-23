# Handover — Student Nurse Planner

_Snapshot: 2026-06-22. Branch `master`, in sync with `origin/master`
(`etaylor23/student-nurse-planner`). Working tree clean; everything below is
committed and pushed._

A new agent should be able to pick up from this file alone. Read it, then skim
`spec/spec-architecture.md` (the canonical model + conventions) before touching code.

---

## 1. What this is

A polished PoC **Student Nurse Planner** — a personal study + placement-tracking aid
for a UK pre-registration nursing student. **Local-only** (no backend, no auth):
React 18 + TypeScript + Vite + Tailwind v4, data in IndexedDB via Dexie behind a
storage-agnostic `Repository` interface. Specs in `spec/` are kept in sync with the
code — **update the relevant spec in the same change as the code**.

It is a study/organisation aid, never a clinical system. Medication Notes in
particular is **explicitly a study aid — never a dosing reference — and holds no
patient-identifiable data**. Keep that boundary.

## 2. Run it / quality gate

```
npm run dev         # vite dev server
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm test            # vitest run
npm run build       # tsc --noEmit && vite build
npx prettier --write <files>
```

**Quality gate, run before every commit:** typecheck clean · lint **0 errors**
(3 accepted `react-refresh/only-export-components` warnings — see §5) · tests pass ·
build OK · prettier. Current: **108 tests pass across 16 files.**

Commit style: focused, granular commits; update specs alongside code; end commit
messages with the `Co-Authored-By` trailer used throughout the history. Branch off
`master` only if asked to open a PR — otherwise commit straight to `master` and push
(that's the established rhythm here).

## 3. Architecture & data model (read this before adding data)

**One model, reused everywhere — there are no per-screen data structures.**

- **Types live once** in `src/domain/types.ts`. Every persisted entity composes the
  shared bases: `Entity` (string `id`), `UserOwned` (`userId`), `Created`
  (`createdAt`), `Updated` (`updatedAt`). Create/update payloads are **derived**
  (`Omit<Entity, server-fields>` → `ShiftDraft`, `MedicationDraft`, …), never
  re-declared. Computed/view shapes (`HoursSummary`, `CalcStatsSummary`,
  `TimesheetRow`, `MedFilters`, …) live next to their pure logic in `src/logic/`,
  **not** in the entity model.
- **Schema ↔ type are linked** in `src/data/schema.ts`: `EntityMap` (store name → TS
  type) and `STORE_INDEXES` (store name → Dexie index spec), both keyed by
  `EntityMap`. `src/data/dexie/db.ts` derives its table types and current schema from
  this registry, so the DB and TS can't drift.
- **Entities join by string foreign-key id, never by nesting:** `Shift.placementId`,
  `MedicationLog.shiftId`/`medicationId`, `MedicationCondition.medicationId`,
  `CalcDrill.medicationId`, `LogItem.entityType`+`entityId`.
- **One swap point:** all storage access goes through the `Repository` interface
  (`src/data/repository.ts`); `DexieRepository` (`src/data/dexie/dexieRepository.ts`)
  is the only storage-specific code. Because every row is a **flat record of
  primitives** (string id/FK, ISO-8601 date strings, string-union enums, no nested
  documents), the same shape maps onto a SQL row or a NoSQL document — the backend
  can change without touching features. `spec-architecture.md` carries the canonical
  Prisma (SQL target) schema.
- **Routing is path-based, no query strings.** Views/selections are path segments
  (`/planner/:shiftId`, `/medications/calc/:type`, `/medications/filter/<k>/<v>/…`).
  One-shot, non-shareable prefills (e.g. "Log again") ride React Router `state`.
- **Shared UI furniture** in `src/react/components/ui.tsx`: `PageHero`, `Panel`,
  `StatTile`, `btnPrimary`/`btnGhost`/`btnGhostSm`, `inputCls`, `card`. Reuse these.
- **Audit:** every meaningful action appends a generic `LogItem`
  (entity-agnostic: `entityType`/`entityId`/`entityLabel`/`action`/`summary`/
  `batchId`). The global Activity feed renders all of them. No per-feature history
  tables.

**Reuse-before-you-add rule:** extend an existing entity in `domain/types.ts`,
compose the bases, relate by FK id; add a store only via `schema.ts` + a `db.ts`
`version()` bump. Never create a screen-local copy of shared data. Each spec has a
`Data reuse` section spelling out what it reuses.

## 4. What's built vs. specced

**Built (5 screens + profile, all sharing the data layer above):**

- **Weekly Planner** (`PlannerPage`) — FullCalendar; create/move/resize shifts;
  lock on complete; copy; placement-palette drag-drop; `/planner/:shiftId` opens the
  editor; global Activity feed.
- **Placement Hours Log** (`HoursLogPage`) — timesheet, break rules, per-placement
  breakdown (+ meds-logged-per-ward), pace projection, CSV/`.ics` export. Shares one
  `ShiftsProvider` + `useShiftActions` with the planner (single `Shift` source).
- **Medication Notes** (`MedicationNotesPage`) — reference cards (+ high-alert flag),
  appendable conditions, calc practice with worked steps + exam mode + numeracy
  stats, med log linked to the shift it happened in, path-based list filters,
  clickable class/system chips. Now also surfaces **competency context** (Platform 4
  + which proficiencies a med's logs evidence).
- **NMC Competency Tracker** (`NmcCompetenciesPage` + `components/competencies/*`) —
  PAD-style tracker over the **219** seeded proficiencies (2024 NMC list): searchable
  + status-filtered platform overview (with evidence-count badges), platform/annexe
  detail, proficiency detail (status + dated history + evidence), gaps view.
  Introduced the polymorphic **`EvidenceLink`** — `SHIFT` and `MED_LOG` evidence are
  wired; `REFLECTION`/`SKILL` are **stub pickers**. **Two-way attach**: link a
  proficiency from the shift editor / attach a med log from the medication panel (via
  the shared `ProficiencyPicker`). Drug-calc proficiencies (4.14, B11.4) show
  **numeracy** accuracy; the landing page surfaces **top gaps** (`TopGaps`).
- **Profile** (`ProfilePage`, `/profile`) — edits the single `User`; where
  `currentPart`/`totalParts` (gap surfacing inputs) are set. See `spec-profile.md`.

**Specced, not built:** `spec-clinical-skills.md` (SPECCED), `spec-reflection.md`
(SPECCED), `spec-revision-timetable.md` (SPECCED), `spec-self-care.md` (DEFERRED).
`spec-nmc-foundations.md` is reference only. **`EvidenceLink` is now built**; the
remaining specs plug into it as new evidence sources (Reflection/Skill stub pickers
already exist in the tracker, awaiting those features).

## 5. State of play — things to be aware of

- **Local-only PoC.** All data is in the browser's IndexedDB under one hardcoded
  user (`LOCAL_USER_ID = "local-user"`, seeded in `DexieRepository`). No auth, no
  sync, no server. Clearing site storage wipes everything; data is per-origin (note:
  the preview harness uses a per-port DB).
- **Dexie: rebuild, don't migrate.** `db.ts` now declares the whole current schema at
  a **single `version(1)`** from the `schema.ts` registry — no `.upgrade` transforms,
  no historical chain (collapsed from the old v1–v7). The DB name is **`nurse-planner-v2`**
  so any old `nurse-planner` database is abandoned and a fresh one is built + re-seeded
  (zero manual steps). Schema change = edit `schema.ts`; if it must reset local data,
  bump the DB-name suffix. (Local-only PoC — a real backend would migrate.)
- **3 accepted lint warnings** only: `react-refresh/only-export-components` in
  `RepositoryContext.tsx`, `ShiftsContext.tsx`, `MedicationNotesPage.tsx`. Intentional
  (files export a hook/const beside a component). 0 errors is the bar.
- **Testing is unit + repo round-trip** (Vitest + `fake-indexeddb`); no e2e. Pure
  logic is well covered; UI flows are verified by hand in the browser preview.
- **Verification caveats** (learned the hard way): FullCalendar drag/resize gestures
  can't be auto-driven by synthetic events in the preview; `innerText` upper-cases
  CSS-`uppercase` text (false-negative string matches); transient HMR console errors
  mid-edit with multiple `?t=` timestamps are not real — confirm with a fresh reload.
- **Build emits a chunk-size warning** (FullCalendar bundle > 500 kB). Harmless for a
  PoC; code-split later if it ships for real.
- **Activity feed lists all `LogItem`s unpaginated** — fine now, would want
  date/action filters or "show more" once it grows.

## 6. Recommended next screen — Reflection (Gibbs)

The **NMC Competency Tracker is now built** (with the Profile screen), and it
introduced the polymorphic **`EvidenceLink`** — so the remaining specs no longer have
to de-risk that join; they just plug in as new evidence sources.

Build `spec-reflection.md` next. Why it's the highest-leverage move now:

- **High personal value, mostly self-contained.** Guided Gibbs reflective writing is
  what students reach for around placement; no big seed required.
- **Plugs straight into `EvidenceLink`.** The tracker already ships a **stub
  `REFLECTION` picker** — building Reflection means listing reflections in that picker
  and creating `EvidenceLink{ evidenceType: "REFLECTION", … }`. Additive; the enum and
  join already exist.
- **Then Clinical Skills** is the natural follow-on (Annexe B seed — which can reuse
  the proficiency-seed extraction approach — + the stub `SKILL` picker).

No big new surface: reuse `ui.tsx`, the `Repository`/`schema.ts` pattern, and the
existing `EvidenceLink` store.

## 7. Backwards-compatible integration points

The rule: **data is additive** — don't reshape an existing entity. **Behaviour
changes to a built screen are fine when they genuinely improve it** (e.g. the
competency tracker added "Evidence for N proficiencies" to the shift editor and a
"Competency evidence" panel to the medication detail).

**General backwards-compat rules:**
- New stores: add them to `schema.ts` (the registry drives `db.ts`'s single
  `version().stores(STORE_INDEXES)`). Per the **rebuild-don't-migrate** policy (§5),
  there are no `.upgrade` transforms; if a change must reset local data, bump the DB
  name suffix in `db.ts` rather than adding migration code.
- New fields on an **existing** entity must be **optional** (`?`) so existing rows
  stay valid (that's how `Medication.highAlert` was added). Indexes are query hints in
  `schema.ts`; with the rebuild policy there's no per-field version bump.
- Reference existing rows by **FK id**; never duplicate or restructure `Shift`,
  `Placement`, `Medication`, etc.
- Auditable actions append a `LogItem` (reuse the entity-agnostic shape) rather than
  a new history table; add dot colours in `LogList` (additive map entry).
- New `Repository` methods are additive to the interface; existing methods unchanged.
- Reuse the `ui.tsx` furniture + path-based routing conventions.

**Competency Tracker wiring (now built — the template for the rest):**
1. **→ Shift:** a completed shift attaches as `EvidenceLink` (type `SHIFT`); the shift
   editor surfaces "Evidence for N proficiencies" (`ShiftEvidence.tsx`).
2. **→ MedicationLog:** `EvidenceLink` (type `MED_LOG`) references a med log by id; the
   medication detail surfaces the Platform 4 prompt + linked proficiencies
   (`MedicationCompetency.tsx`).
3. **→ Activity feed:** status changes + evidence link/unlink call
   `repo.createLogItem({ entityType: "PROFICIENCY", … })` → they appear in the global
   feed; dot colours added in `LogList` (`PROFICIENCY_STATUS_CHANGED`,
   `EVIDENCE_LINKED`, `EVIDENCE_UNLINKED`, `PROFILE_UPDATED`).
4. **→ User:** gap surfacing reads `User.currentPart`/`totalParts`, set on the Profile
   screen.
5. **Entities** `Proficiency` (global seed), `ProficiencyProgress`,
   `ProficiencyStatusEvent`, `EvidenceLink` compose the shared bases and register in
   `schema.ts`. Existing stores untouched.

Reflection and Clinical Skills then attach to proficiencies through the **same**
`EvidenceLink` (types `REFLECTION` / `SKILL`) — no per-source link tables.

## 8. Key files

| Concern | File |
| --- | --- |
| Domain types + shared bases | `src/domain/types.ts` |
| Store↔type↔index registry | `src/data/schema.ts` |
| Repository interface (swap point) | `src/data/repository.ts` |
| Dexie binding (rebuild, no migrations) | `src/data/dexie/db.ts`, `src/data/dexie/dexieRepository.ts` |
| Proficiency seed + provenance | `src/data/seed/proficiencies.ts` (generated), `scripts/extract-proficiencies.py` |
| Shared shift state + mutations | `src/react/ShiftsContext.tsx` (`useShifts`, `useShiftActions`) |
| Data hooks | `src/react/hooks.ts` (incl. `useProficiencies`, `useProficiency`) |
| Competency logic | `src/logic/proficiencies.ts` (platform roll-ups, gap surfacing) |
| UI furniture | `src/react/components/ui.tsx` |
| Audit feed | `src/react/components/ActivityLog.tsx`, `LogList.tsx`, `src/logic/logGroups.ts` |
| Screens | `PlannerPage.tsx`, `HoursLogPage.tsx`, `MedicationNotesPage.tsx` (+ `components/medications/*`), `NmcCompetenciesPage.tsx` (+ `components/competencies/*`), `ProfilePage.tsx` |
| Competency↔built-screen bridges | `src/react/components/ShiftEvidence.tsx`, `components/medications/MedicationCompetency.tsx`, `components/competencies/TopGaps.tsx` (landing-page gaps) |
| Shared competency widgets | `components/competencies/ProficiencyPicker.tsx` (attach picker), `NumeracyPanel.tsx`, `shared.tsx` (`StatusPill` / `EvidenceBadge` / `SourceCredit`) |
| Canonical model + conventions | `spec/spec-architecture.md` |

Each `spec/spec-*.md` carries `Decisions (locked)`, `Data model`, `Integrations`, and
`Data reuse` sections — read the relevant one before building its feature.
