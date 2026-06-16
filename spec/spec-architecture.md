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
enum EvidenceType        { REFLECTION SKILL SHIFT }
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
  id         String   @id @default(cuid())
  userId     String
  entityType String          // "SHIFT" today; e.g. PLACEMENT / REFLECTION later
  entityId   String          // kept even if the entity is later deleted
  action     String          // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary    String          // human line shown in the history
  createdAt  DateTime @default(now())
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
model EvidenceLink {            // polymorphic: proficiency <- reflection|skill|shift
  id            String       @id @default(cuid())
  userId        String
  proficiencyId String
  evidenceType  EvidenceType
  evidenceId    String        // Reflection.id | SkillProgress.id | Shift.id
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
  `BreakRule` band matching `rawDurationMins` (overridable). Never negative.
- **Practice-hours progress:** `Σ netHours` over `COMPLETED` shifts `/ 2300`.
  Simulated hours are a **subset** of that total and tracked against the **600**
  cap (warn at/over the cap).
- **Shift lock & audit:** a `COMPLETED` shift is **locked** — read-only fields, no
  calendar drag/resize, no delete — until **reactivated** (`COMPLETED → PLANNED`,
  which preserves the RN name/hours). Completing, reactivating, creating, editing
  and deleting a shift each append a `LogItem` (all via `useShiftActions`, the single
  mutation point). See `spec-activity-log.md`.
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
3. Competency tracker (proficiency seed + `EvidenceLink`).
4. Reflection (`EvidenceLink`).
5. Clinical skills (Annexe B seed + `EvidenceLink`).
6. Medication notes + Revision timetable.

## App shell & routing

- `react-router-dom` v7. `nav.ts` holds `NAV_SECTIONS` — ordered "suites of
  views", each with optional `heading` and items carrying an `enabled` flag;
  disabled items render non-clickable with a "Soon" badge. `NAV_ITEMS` /
  `DEFAULT_ROUTE` are derived from the sections. (Built suite: "Shifts & hours" =
  placement hours log + weekly planner.)
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
