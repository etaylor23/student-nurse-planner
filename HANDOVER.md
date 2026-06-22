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
build OK · prettier. Current: **95 tests pass across 14 files.**

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

**Built (3 screens, all sharing the data layer above):**

- **Weekly Planner** (`PlannerPage`) — FullCalendar; create/move/resize shifts;
  lock on complete; copy; placement-palette drag-drop; `/planner/:shiftId` opens the
  editor; global Activity feed.
- **Placement Hours Log** (`HoursLogPage`) — timesheet, break rules, per-placement
  breakdown (+ meds-logged-per-ward), pace projection, CSV/`.ics` export. Shares one
  `ShiftsProvider` + `useShiftActions` with the planner (single `Shift` source).
- **Medication Notes** (`MedicationNotesPage`) — reference cards (+ high-alert flag),
  appendable conditions, calc practice with worked steps + exam mode + numeracy
  stats, med log linked to the shift it happened in, path-based list filters,
  clickable class/system chips.

**Specced, not built:** `spec-competency-tracker.md` (SPECCED),
`spec-clinical-skills.md` (SPECCED), `spec-reflection.md` (SPECCED),
`spec-revision-timetable.md` (SPECCED), `spec-self-care.md` (DEFERRED).
`spec-nmc-foundations.md` is reference only. The polymorphic **`EvidenceLink`** join
those depend on is documented but **not yet built**.

## 5. State of play — things to be aware of

- **Local-only PoC.** All data is in the browser's IndexedDB under one hardcoded
  user (`LOCAL_USER_ID = "local-user"`, seeded in `DexieRepository`). No auth, no
  sync, no server. Clearing site storage wipes everything; data is per-origin (note:
  the preview harness uses a per-port DB).
- **Dexie is at v7 with a 7-step migration chain** in `db.ts`. Fresh installs build
  from the registry; existing browsers migrate forward. The chain **cannot be
  collapsed** without breaking existing local DBs. Schema change = edit `schema.ts` +
  add a `version()` bump.
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

## 6. Recommended next screen — NMC Competency Tracker

Build `spec-competency-tracker.md` next. Why it's the highest-leverage move:

- **It's the spine of a PAD-style tool.** Tracking the NMC proficiencies
  (not-yet-achieved / developing / achieved, with dated history) is the thing a
  student nurse most needs around placement, and it ties the rest together.
- **It establishes `EvidenceLink`** — the polymorphic join (proficiency ←
  reflection | skill | shift | future `MED_LOG`). **Three** other specs
  (clinical-skills, reflection, and the medication evidence route) depend on it, so
  building it first de-risks everything after: each later feature just plugs in as a
  new evidence source.
- **It reuses what already exists.** Gap surfacing reads `User.currentPart` /
  `totalParts` (already on the model); a completed `Shift` is placement evidence; med
  logs were deliberately designed evidence-ready. Heavy reuse, little new surface.

**Caveat / effort note:** it needs the **national proficiency master list** seeded
(transcribing the official NMC statements — see `spec-nmc-foundations.md`). That's
real data-entry grunt work, so budget for it.

**Lighter alternative if a quick standalone win is wanted:** the **Reflection (Gibbs)**
screen — high personal value, no big seed, mostly self-contained. It still wants
`EvidenceLink` for linking, so whichever of the two you build first should be the one
that introduces `EvidenceLink`.

## 7. Backwards-compatible integration points

The golden rule: **everything new is additive.** Don't reshape an existing entity or
change a built screen's behaviour.

**General backwards-compat rules:**
- New stores only via `schema.ts` + a new Dexie `version()` (additive — no `.upgrade`
  transform needed for a brand-new store/index).
- New fields on an **existing** entity must be **optional** (`?`) so existing rows
  stay valid; if the field needs an index, bump a version (additive index, no data
  transform). Non-indexed optional fields need no version bump at all (that's how
  `Medication.highAlert` was added).
- Reference existing rows by **FK id**; never duplicate or restructure `Shift`,
  `Placement`, `Medication`, etc.
- Auditable actions append a `LogItem` (reuse the entity-agnostic shape) rather than
  a new history table; add dot colours in `LogList` (additive map entry).
- New `Repository` methods are additive to the interface; existing methods unchanged.
- Reuse the `ui.tsx` furniture + path-based routing conventions.

**Concrete wiring for the Competency Tracker (all additive):**
1. **→ Shift (existing):** a completed shift is placement evidence. New `EvidenceLink`
   store references `shiftId`. No change to planner/hours.
2. **→ MedicationLog (existing):** `EvidenceLink` with type `MED_LOG` references a med
   log by id. Med logs already exist and carry `shiftId`. No change to Medication
   Notes.
3. **→ Activity feed (existing):** proficiency status changes call
   `repo.createLogItem({ entityType: "PROFICIENCY", … })` → they appear in the global
   feed automatically. Just add dot colours for the new actions in `LogList`.
4. **→ User (existing):** gap surfacing reads `User.currentPart`/`totalParts` — already
   present, no change.
5. **New entities** (`Proficiency`, `ProficiencyProgress`, `ProficiencyStatusEvent`,
   `EvidenceLink`) compose the shared bases and register in `schema.ts` + a new Dexie
   version. Existing stores untouched.

Reflection and Clinical Skills then attach to proficiencies through the **same**
`EvidenceLink` (types `REFLECTION` / `SKILL`) — no per-source link tables.

## 8. Key files

| Concern | File |
| --- | --- |
| Domain types + shared bases | `src/domain/types.ts` |
| Store↔type↔index registry | `src/data/schema.ts` |
| Repository interface (swap point) | `src/data/repository.ts` |
| Dexie binding + migrations | `src/data/dexie/db.ts`, `src/data/dexie/dexieRepository.ts` |
| Shared shift state + mutations | `src/react/ShiftsContext.tsx` (`useShifts`, `useShiftActions`) |
| Data hooks | `src/react/hooks.ts` |
| UI furniture | `src/react/components/ui.tsx` |
| Audit feed | `src/react/components/ActivityLog.tsx`, `LogList.tsx`, `src/logic/logGroups.ts` |
| Screens | `PlannerPage.tsx`, `HoursLogPage.tsx`, `MedicationNotesPage.tsx` (+ `components/medications/*`) |
| Canonical model + conventions | `spec/spec-architecture.md` |

Each `spec/spec-*.md` carries `Decisions (locked)`, `Data model`, `Integrations`, and
`Data reuse` sections — read the relevant one before building its feature.
