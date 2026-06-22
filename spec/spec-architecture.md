# Spec — Architecture

Cross-cutting technical design. Every feature spec references entities and
patterns defined here.

## Principles

- **Storage-agnostic core.** All features talk to an async `Repository`
  interface, never to Dexie/IndexedDB directly. The PoC binds it to
  `DexieRepository`; a later phase binds the same interface to a REST/Prisma
  backend with no change to features or UI.
- **Multi-user ready, auth deferred.** Every user-owned entity has `userId`.
  The PoC uses one local user (`LOCAL_USER_ID`); per-student login is the
  intended future standard but is not implemented yet.
- **Reference/seed data is global**, not user-owned: the proficiency master
  list, baseline skills, baseline subjects, and the default break-rule table.
- **The canonical model is relational** (expressed below as a Prisma schema —
  the target/remote shape). The PoC persists these same entity shapes in
  IndexedDB.
- **PoC DB policy: rebuild, don't migrate.** `db.ts` declares the whole current
  schema at a single `version()` from the `schema.ts` registry — no `.upgrade`
  transforms or historical version chain. A schema change that must reset local data
  bumps the Dexie **database name** (currently `nurse-planner-v2`) so a fresh DB is
  built and re-seeded; the old one is abandoned. (This is a local-only PoC; a real
  backend would migrate, not rebuild.)

## Repository interface (the swap point)

The interface for slice 1 (extend per feature):

```ts
interface Repository {
  getCurrentUser(): Promise<User>;
  updateUser(patch): Promise<User>;
  getBreakRules(userId): Promise<BreakRule[]>; // user rules, else defaults
  saveBreakRules(userId, rules): Promise<BreakRule[]>; // replace user band table
  resetBreakRules(userId): Promise<void>;              // revert to the defaults
  listPlacements(userId): Promise<Placement[]>;
  createPlacement(input): Promise<Placement>;
  updatePlacement(id, patch): Promise<Placement>;
  deletePlacement(id): Promise<void>;
  listShifts(userId): Promise<Shift[]>;
  getShift(id): Promise<Shift | undefined>;
  createShift(input): Promise<Shift>;
  updateShift(id, patch): Promise<Shift>;
  deleteShift(id): Promise<void>;
  createLogItem(input): Promise<LogItem>;                 // append an audit entry
  listLogItems(userId, filter?): Promise<LogItem[]>;      // newest first; filter by entity
}
```

`RepositoryProvider` supplies a single instance + the current user via React
context. To move to a backend: implement `Repository` against the API and pass
`<RepositoryProvider repo={new RestRepository(...)}>`.

`ShiftsProvider` holds the one in-memory `Shift` list (plus the derived hours
summary and pace projection) shared by every view via `useShifts()`, so a change
in the hours log or the planner reflects in both — one fetch, no drift.
`useShiftActions()` centralises the shift mutations (create / update / delete /
mark-worked / reactivate, with the duplicate-shift guard) so those flows can't
diverge between views — and it's the single place that appends `LogItem` audit
entries (see `spec-activity-log.md`). (Placements and break rules use their own
hooks the same way.)

## Canonical data model (Prisma — target/remote shape)

```prisma
// ---------- Enums ----------
enum NursingField        { ADULT } // extend: MENTAL_HEALTH, LEARNING_DISABILITIES, CHILDREN
enum ProgrammeType       { BSC_3YR MSC_2YR APPRENTICE OTHER }
enum Annexe              { NONE A B }
enum ProficiencyStatus   { NOT_YET_ACHIEVED DEVELOPING ACHIEVED }
enum EvidenceType        { REFLECTION SKILL SHIFT MED_LOG }
enum ShiftType           { EARLY LATE NIGHT LONG_DAY OTHER }
enum HoursEntryMode      { NET RAW }
enum ShiftStatus         { PLANNED COMPLETED }
enum ReflectionModel     { GIBBS } // extend: DRISCOLL, BORTON, KOLB
enum GibbsStage          { DESCRIPTION FEELINGS EVALUATION ANALYSIS CONCLUSION ACTION_PLAN }
enum SkillSource         { ANNEXE_B CUSTOM }
enum SkillStage          { OBSERVED ASSISTED PERFORMED_UNDER_SUPERVISION }
enum MedLogType          { OBSERVED ADMINISTERED }
enum CalcType            { TABLET_DOSE LIQUID_DOSE IV_RATE WEIGHT_BASED }
enum RevisionTargetType  { EXAM ASSIGNMENT OSCE }
enum RevisionMethod      { SPACED_REPETITION FIXED_BLOCK POMODORO }

// ---------- Core ----------
model User {
  id                     String        @id @default(cuid())
  displayName            String
  field                  NursingField  @default(ADULT)
  programmeType          ProgrammeType @default(BSC_3YR)
  currentPart            Int           @default(1)   // student's current stage
  totalParts             Int           @default(3)   // varies by programme
  startDate              DateTime?
  targetRegistrationDate DateTime?
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
}

// ---------- Activity log (generic audit trail) ----------
model LogItem {                // entity-agnostic; v1 logs shifts, extends later
  id          String   @id @default(cuid())
  userId      String
  entityType  String          // "SHIFT" today; e.g. PLACEMENT / REFLECTION later
  entityId    String          // kept even if the entity is later deleted
  entityLabel String?         // human label at action time ("Ward 7 · Thu 18 Jun")
  action      String          // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary     String          // human line shown in the history
  batchId     String?         // groups the entries written in one save event
  createdAt   DateTime @default(now())
  @@index([userId, createdAt])
  @@index([entityType, entityId])
}

// ---------- Competency tracker ----------
model Proficiency {           // reference data — national, shared, seeded
  id            String  @id @default(cuid())
  platform      Int             // 1..7
  platformTitle String
  annexe        Annexe  @default(NONE) // A / B for annexe items
  code          String  @unique        // e.g. "1.1", "A1.2", "B2.4"
  statement     String
  orderIndex    Int
}
model ProficiencyProgress {
  id            String            @id @default(cuid())
  userId        String
  proficiencyId String
  status        ProficiencyStatus @default(NOT_YET_ACHIEVED)
  targetPart    Int?              // optional: sharpens gap warnings
  updatedAt     DateTime          @updatedAt
  @@unique([userId, proficiencyId])
}
model ProficiencyStatusEvent {  // history → reassessment across parts
  id           String   @id @default(cuid())
  progressId   String
  status       ProficiencyStatus
  partIndex    Int
  assessorName String?
  note         String?
  occurredAt   DateTime
  createdAt    DateTime @default(now())
}
model EvidenceLink {            // polymorphic: proficiency <- reflection|skill|shift|med log
  id            String       @id @default(cuid())
  userId        String
  proficiencyId String
  evidenceType  EvidenceType
  evidenceId    String        // Reflection.id | SkillProgress.id | Shift.id | MedicationLog.id
  createdAt     DateTime     @default(now())
  @@index([evidenceType, evidenceId])
}

// ---------- Placement hours log ----------
model Placement {
  id          String    @id @default(cuid())
  userId      String
  name        String
  settingType String?
  startDate   DateTime?
  endDate     DateTime?
  createdAt   DateTime  @default(now())
}
model Shift {                  // shared by hours log AND weekly planner
  id                String         @id @default(cuid())
  userId            String
  placementId       String?
  date              DateTime
  startTime         DateTime?
  endTime           DateTime?
  shiftType         ShiftType      @default(LONG_DAY)
  entryMode         HoursEntryMode @default(RAW)
  rawDurationMins   Int?           // when entryMode = RAW
  breakMins         Int?           // resolved from band table; override allowed
  netHours          Float          // stored countable hours (derived on write)
  isSimulated       Boolean        @default(false) // subset of 2300, vs 600 cap
  status            ShiftStatus    @default(PLANNED)
  supervisingRnName String?        // REQUIRED to move PLANNED -> COMPLETED
  notes             String?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
}
model BreakRule {              // configurable bands; userId null = built-in default
  id           String  @id @default(cuid())
  userId       String?
  minShiftMins Int
  maxShiftMins Int
  breakMins    Int
  orderIndex   Int
}

// ---------- Reflection ----------
model Reflection {
  id              String          @id @default(cuid())
  userId          String
  title           String
  model           ReflectionModel @default(GIBBS)
  occurredOn      DateTime?
  isLocked        Boolean         @default(false) // PIN/biometric (device)
  piiAcknowledged Boolean         @default(false)
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
}
model ReflectionSection {
  id           String     @id @default(cuid())
  reflectionId String
  stage        GibbsStage
  content      String
  @@unique([reflectionId, stage])
}
model Tag {
  id     String @id @default(cuid())
  userId String
  label  String
  @@unique([userId, label])
}
model ReflectionTag {
  reflectionId String
  tagId        String
  @@id([reflectionId, tagId])
}

// ---------- Clinical skills ----------
model Skill {                  // userId null = built-in (Annexe B baseline)
  id         String      @id @default(cuid())
  userId     String?
  name       String
  category   String
  source     SkillSource @default(ANNEXE_B)
  orderIndex Int         @default(0)
}
model SkillProgress {
  id              String     @id @default(cuid())
  userId          String
  skillId         String
  stage           SkillStage @default(OBSERVED)
  signedOff       Boolean    @default(false) // permanent once true (no refresh)
  signOffByName   String?
  signOffLocation String?
  signOffDate     DateTime?
  evidenceNote    String?
  updatedAt       DateTime   @updatedAt
  @@unique([userId, skillId])
}

// ---------- Weekly planner ----------
model CalendarFeed {           // backs the one-way .ics subscription
  id        String   @id @default(cuid())
  userId    String   @unique
  feedToken String   @unique  // .ics URL = /feeds/{feedToken}.ics
  createdAt DateTime @default(now())
}

// ---------- Medication notes ----------
model Medication {             // study/reference only; no patient data
  id         String   @id @default(cuid())
  userId     String
  name       String   // generic / BNF name
  brandNames String?
  drugClass  String?  // optional select
  bodySystem String?  // optional select
  routes     String?  // optional
  keyNotes   String?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
model MedicationCondition {    // appendable as the same drug recurs
  id           String   @id @default(cuid())
  medicationId String
  condition    String
  addedAt      DateTime @default(now())
  @@unique([medicationId, condition])
}
model MedicationLog {
  id           String     @id @default(cuid())
  userId       String
  medicationId String?
  shiftId      String?    // the shift it was logged during (auto-linked or chosen)
  type         MedLogType // OBSERVED | ADMINISTERED
  date         DateTime
  route        String?
  notes        String?    // no patient-identifiable info
  createdAt    DateTime   @default(now())
}
model CalcDrill {              // generic numbers only; never the drug's real doses
  id            String   @id @default(cuid())
  userId        String
  medicationId  String?  // association only
  calcType      CalcType
  prompt        String
  answer        String
  lastAttempted DateTime?
  lastCorrect   Boolean?
  createdAt     DateTime @default(now())
}

// ---------- Revision ----------
model Subject {                // userId null = built-in baseline
  id     String  @id @default(cuid())
  userId String?
  name   String
}
model RevisionTarget {
  id        String             @id @default(cuid())
  userId    String
  type      RevisionTargetType // EXAM | ASSIGNMENT | OSCE (all optional to use)
  title     String
  date      DateTime
  subjectId String?
  createdAt DateTime           @default(now())
}
model RevisionTopic {
  id           String    @id @default(cuid())
  userId       String
  subjectId    String
  title        String
  confidence   Int       @default(1) // 1..5; drives resurfacing
  lastReviewed DateTime?
  nextDue      DateTime? // spaced-repetition schedule
  createdAt    DateTime  @default(now())
}
model RevisionSession {
  id              String         @id @default(cuid())
  userId          String
  topicId         String?
  method          RevisionMethod // SPACED_REPETITION | FIXED_BLOCK | POMODORO
  scheduledStart  DateTime
  scheduledEnd    DateTime
  completed       Boolean        @default(false)
  pomodoroCount   Int?
  confidenceAfter Int?
  createdAt       DateTime       @default(now())
}
```

## Derived logic (computed, not stored)

- **Net hours per shift:** `NET` → use entered hours; `RAW` →
  `(rawDurationMins − breakMins) / 60`, where `breakMins` is resolved from the
  `BreakRule` band matching `rawDurationMins` (overridable). Never negative. For a
  timed shift `rawDurationMins = endAt − startAt`: the PoC stores `startAt`/`endAt`
  as **full UTC ISO timestamps** (`toISOString()`, mirroring the canonical
  `DateTime?`), so overnight spans are exact and there's no 24h inference cap. Wall
  clock for display is derived in local time; `date` is the local start date.
- **Practice-hours progress:** `Σ netHours` over `COMPLETED` shifts `/ 2300`.
  Simulated hours are a **subset** of that total and tracked against the **600**
  cap (warn at/over the cap).
- **Shift lock & audit:** a `COMPLETED` shift is **locked** — read-only fields, no
  calendar drag/resize, no delete — until **reactivated** (`COMPLETED → PLANNED`,
  which preserves the RN name/hours). Completing, reactivating, creating, editing
  and deleting a shift each append a `LogItem` (all via `useShiftActions`, the single
  mutation point). See `spec-activity-log.md`.
- **Actions are logged against a shift.** A shift is the unit that connects activity
  across the platform. The "current shift" is the timed shift whose `startAt`–`endAt`
  window contains now; an action logged then auto-links to it (overridable from the
  last 7 days). First built for `MedicationLog.shiftId`; the same pattern should
  extend to future logged actions. The shift's editor surfaces what was logged in it.
- **Pace projection:** shifts-to-go from the average completed-shift length; an
  estimated finish date from counted-hours-per-week over the completed date span.
- **Hours by placement:** `netHours` grouped by `placementId` (counted vs
  planned), with a "No placement" bucket.
- **Competency gap surfacing:** flag any `ProficiencyProgress` where
  `status ≠ ACHIEVED` and (`targetPart ≤ user.currentPart` if set, else
  `user.currentPart == user.totalParts`); escalate near end of the current part.
- **Spaced repetition:** `nextDue` derived from `confidence` + `lastReviewed`
  (low confidence → sooner). **Resurface** = topics where `nextDue ≤ now` OR
  `confidence ≤ 2`.
- **Revision routing around shifts:** when placing `RevisionSession` blocks,
  exclude windows overlapping a `Shift` start/end.
- **`.ics` feed:** generated from `Shift` rows (optionally
  `RevisionSession`/`RevisionTarget`); served at `/feeds/{feedToken}.ics`;
  one-way, polled by clients.

## Seed data (one-off)

1. **Proficiencies** — the national NMC proficiency statements (7 platforms +
   Annexe A + Annexe B), adult-field level, with `code`/`platform`/`orderIndex`.
   Source from the official NMC standards document (see `spec-nmc-foundations`).
   **Built:** 219 statements seeded from the **2024** document into a committed
   `src/data/seed/proficiencies.ts`, regenerable via `scripts/extract-proficiencies.py`.
2. **Skills** — Annexe B baseline list (`source = ANNEXE_B`); students add custom.
3. **Subjects** — A&P, Pharmacology, Pathophysiology, NMC Theory, Numeracy,
   OSCE Prep (i.e. all except bioscience).
4. **Default `BreakRule` table** — `0–360min → 0`, `361–540min → 30`,
   `541+min → 60` (so 12.5h / 750min → 60min break → 11.5h).

## Build order

1. Core + Placement hours log — **built** (incl. shift & placement edit/delete,
   break-rule editor, optional start/end times, keyboard-accessible nav).
2. Weekly shift planner — **built** (FullCalendar over the shared `Shift`;
   quick-add, click-drag-to-create, drag-reschedule & resize, PLANNED→COMPLETED,
   `.ics` snapshot export; live feed deferred — needs a backend).
3. Competency tracker (proficiency seed + `EvidenceLink`) — **built** (4 views;
   `SHIFT`/`MED_LOG` evidence wired, `REFLECTION`/`SKILL` stub pickers; gap surfacing
   off the profile's current part). Brought with it the **Profile / Settings** screen
   (`spec-profile.md`) — where `currentPart`/`totalParts` are set.
4. Reflection (`EvidenceLink`).
5. Clinical skills (Annexe B seed + `EvidenceLink`).
6. Medication notes — **built** — + Revision timetable.

## App shell & routing

- `react-router-dom` v7. `nav.ts` holds `NAV_SECTIONS` — ordered "suites of
  views", each with optional `heading` and items carrying an `enabled` flag;
  disabled items render non-clickable with a "Soon" badge. `NAV_ITEMS` /
  `DEFAULT_ROUTE` are derived from the sections. (Built: "Shifts & hours" =
  placement hours log + weekly planner; competency tracker + medication notes; an
  "Account" section = `/profile`.)
- **Competency tracker routes** (path-based, nested under `/competencies/*`):
  `/competencies` (platform overview), `/competencies/platform/:group`
  (`:group` = `1`..`7` | `A` | `B`), `/competencies/proficiency/:id`,
  `/competencies/gaps`. Profile is a single `/profile` route.
- `AppLayout` renders the fly-over nav (desktop: a left-margin strip whose panel
  opens on hover **or** keyboard focus — state-driven for reliability across
  Tailwind builds; mobile: state-driven drawer + menu button + backdrop) and the
  ultra-wide content container (`lg:px-20 xl:px-24`).
- Shared UI primitives live in `react/components/ui.tsx` (`PageHero`, `Panel`,
  `StatTile`, the `card` box, button/input tokens): every white widget is full
  width on mobile and customises its width on larger screens via `col-span-*`.
  Layout grids start at `grid-cols-1` and wrappers use `min-w-0` so a wide child
  (e.g. a table) can't force horizontal overflow.
- `App.tsx`: `/` and `*` redirect to the first enabled route
  (`DEFAULT_ROUTE` = `/placement-hours`).
- **Path-based routing — no query strings.** View/selection states are path
  segments so they're shareable and refresh-safe: e.g. `/planner/:shiftId` (opens a
  shift's week + editor), `/medications/calc/:type`, `/medications/log/:type`. Even
  free-text/multi-select refinements (the medications list search/filters) are
  path-encoded — `/medications/filter/<key>/<value>/…` (URL-encoded values) — so
  they're deep-linkable too. One-shot prefills that aren't meant to be shareable
  (e.g. "Log again", "Log a medication" from a shift) ride React Router `state`, not
  a query string.

## Integrations

This spec defines the shared primitives features integrate _through_, rather than
holding feature-to-feature wiring itself:

- the generic, entity-agnostic `LogItem` audit trail (any feature can append);
- **shift-scoped actions** via `MedicationLog.shiftId` — "actions are logged against
  the shift they happen in", the pattern future logged actions should follow;
- the planned polymorphic `EvidenceLink` join (proficiency ← reflection | skill |
  shift | future `MED_LOG`).

Each feature's own **Integrations** section records what it wires to. Built today:
Medication Notes ↔ Weekly Planner / Placement Hours Log (shift-linked med logs,
per-placement med counts, "Log a medication" from a shift) and Medication Notes →
Activity Log (med actions in the feed).

## Data reuse

One model, reused everywhere — there are **no per-screen data structures**. This is
the master reference; each feature spec has a shorter `Data reuse` section pointing
back here.

- **Types live once.** Every persisted entity is defined a single time in
  `src/domain/types.ts` and composes the shared bases — `Entity` (string `id`),
  `UserOwned` (`userId`), `Created` (`createdAt`), `Updated` (`updatedAt`) — rather
  than re-declaring those fields. Create/update payloads are **derived**
  (`Omit<Entity, server-fields>` → `ShiftDraft`, `MedicationDraft`, …), never
  hand-copied. Computed/view shapes (`HoursSummary`, `CalcStatsSummary`,
  `TimesheetRow`, `MedFilters`, `PlacementMedCount`) live beside their pure logic in
  `logic/`, not in the entity model.
- **Schema ↔ type are linked.** `src/data/schema.ts` is the one registry: `EntityMap`
  (store name → TS type) and `STORE_INDEXES` (store name → index spec), both keyed by
  `EntityMap` so the compiler forces a 1:1 mapping. `db.ts` derives its table types
  and current schema from it — the DB and the model cannot drift.
- **Entities join by foreign-key id**, never by nesting: `Shift.placementId`,
  `MedicationLog.shiftId` / `medicationId`, `MedicationCondition.medicationId`,
  `CalcDrill.medicationId`, `LogItem.entityType`+`entityId`. The planned polymorphic
  `EvidenceLink` is the canonical many-source join (proficiency ← reflection | skill
  | shift | future `MED_LOG`).
- **One swap point.** All access goes through the `Repository` interface; the Dexie
  binding is the only storage-specific code. Because every row is a flat record of
  primitives (string id/FK, ISO-8601 date strings, string-union enums, no nested
  documents), the same shape maps onto a SQL row or a NoSQL document, so the backend
  can change without touching features.

**Direction — reuse before you add.** Before introducing a field or entity: extend
the relevant entity in `domain/types.ts`, compose the bases, and relate by FK id.
Add a store only via `schema.ts` (plus a `db.ts` `version()` bump). Never create a
screen-local copy of shared data, and keep new entities flat + primitive so they
stay portable across SQL and NoSQL.
