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
- **PoC DB policy: rebuild, don't migrate — but add stores additively.** `db.ts`
  derives its schema from the `schema.ts` registry; there are **no `.upgrade`
  transforms**. A change that must reset local data bumps the Dexie **database name**
  (currently `nurse-planner-v2`) so a fresh DB is built and re-seeded. Purely **additive**
  changes (new stores) instead bump the Dexie **`version()`** — `version(1)` is the
  registry minus the later stores, `version(2)` adds them — so a deployed DB gains the
  new object stores with **zero data loss** and still no transform code. (Clinical
  Skills' `skills` / `skillProgress` stores landed this way, preserving live tester
  data.) Reserve the name-bump/rebuild for changes that drop or reshape existing data.
  (This is a local-only PoC; a real backend would migrate, not rebuild.)

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

> **Backend migration (in progress).** The remote backend that binds this seam —
> Cognito magic-link auth, a single owner-partitioned DynamoDB table, Amazon Verified
> Permissions (Cedar), an RPC API, and later local-first sync — is specced in
> [`spec-auth.md`](./spec-auth.md), [`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md)
> and sequenced by [`spec-implementation-roadmap.md`](./spec-implementation-roadmap.md).
> The new backends are new `Repository` *implementations* (`ApiRepository`,
> `DynamoRepository`, `SyncRepository`) swapped here — no HTTP/auth leaks into feature
> code. **Phases 0–4 are built, deployed and live** (the CDK app under
> [`../infra/`](../infra/README.md)): signed-in users run local-first sync over the
> remote; the app is served from **https://app.placemate.uk** (CloudFront + an ACM cert
> in us-east-1) and magic-link mail is sent from **hello@placemate.uk** on a
> Route 53-hosted `placemate.uk` domain with SPF + DKIM + custom MAIL FROM + DMARC. The
> live env is the `NursePlanner-dev` stack promoted in place to production posture
> (`retainData`). Server-side input validation uses `zod` schemas codegen'd from
> `domain/types.ts` via ts-to-zod (`src/domain/schemas.generated.ts`).

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
  evidenceId    String        // Reflection.id | Skill.id | Shift.id | MedicationLog.id
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
  shiftId         String?         // the shift it reflects on (the universal capture join; optional, unindexed)
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
model SkillProgress {           // SKILL EvidenceLinks point at Skill.id, not this row
  id              String     @id @default(cuid())
  userId          String
  skillId         String
  stage           SkillStage @default(OBSERVED)
  signedOff       Boolean    @default(false) // permanent once true (no refresh)
  signOffByName   String?
  signOffLocation String?
  signOffDate     DateTime?
  evidenceNote    String?
  shiftId         String?    // the shift the sign-off happened in (optional, unindexed — the universal capture join)
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

// ---------- Self-care ----------
model SelfCareCheckin {          // gentle, private wellbeing check-in — never scored
  id        String   @id @default(cuid())
  userId    String
  date      DateTime
  shiftId   String?              // the shift it follows (the universal capture join; optional)
  energy    Int?                 // 1..5 optional private energy/mood rating
  note      String?              // optional private free text (on-device)
  items     String               // comma-separated self-care item keys ticked
  createdAt DateTime @default(now())
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
  last 7 days). First built for `MedicationLog.shiftId`; now also `SkillProgress.shiftId`
  (the shift a sign-off happened in), `Reflection.shiftId` (the shift a reflection is
  about) and `SelfCareCheckin.shiftId` (a check-in nudged after a hard shift), and the
  same pattern extends to future logged actions. The shift's editor surfaces what was
  logged in it — `ShiftMedications`, `ShiftSkills`, `ShiftReflections` and `ShiftEvidence`;
  the post-shift debrief adds a gentle self-care nudge after a hard shift.
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
   **Built:** derived in `src/data/seed/skills.ts` from the `annexe: "B"` proficiencies
   (1:1 by code, `skill_B2.1` ↔ `prof_B2.1`) rather than re-seeded.
3. **Subjects** — A&P, Pharmacology, Pathophysiology, NMC Theory, Numeracy,
   OSCE Prep (i.e. all except bioscience). **Built:** baseline (`userId: null`) rows in
   `src/data/seed/subjects.ts`; `subject_numeracy` is the join point to `CalcStat`.
4. **Default `BreakRule` table** — `0–360min → 0`, `361–540min → 30`,
   `541+min → 60` (so 12.5h / 750min → 60min break → 11.5h).

## Build order

1. Core + Placement hours log — **built** (incl. shift & placement edit/delete,
   break-rule editor, optional start/end times, keyboard-accessible nav).
2. Weekly shift planner — **built** (FullCalendar over the shared `Shift`;
   quick-add, click-drag-to-create, drag-reschedule & resize, PLANNED→COMPLETED,
   `.ics` snapshot export; live feed deferred — needs a backend).
3. Competency tracker (proficiency seed + `EvidenceLink`) — **built** (4 views;
   `SHIFT`/`MED_LOG`/`SKILL`/`REFLECTION` evidence all wired; gap surfacing
   off the profile's current part). Brought with it the **Profile / Settings** screen
   (`spec-profile.md`) — where `currentPart`/`totalParts` are set.
4. Reflection (`EvidenceLink`) — **built** (Gibbs cycle at `/reflection/*`, lockable,
   tags + search; the `REFLECTION` picker is now real; woven into the shift debrief,
   both shift editors (`ShiftReflections`), the placement debrief, evidence suggestions
   and the feed via the universal `shiftId` join).
5. Clinical skills (Annexe B seed + `EvidenceLink`) — **built** (3 views; baseline
   derived from the Annexe B proficiencies; stages + permanent sign-off; `SKILL`
   evidence picker now real, with auto-evidence on sign-off).
6. Medication notes — **built** — + Revision timetable — **built** (targets, subjects →
   topics with confidence, spaced-repetition resurfacing, Pomodoro session runner, and
   shift-aware scheduling that never clashes with a `Shift`; numeracy reads `CalcStat`).
7. Self-care checklist — **built** (gentle, private; flexible rhythm + a post-hard-shift
   debrief nudge; energy note that signposts support when low; no streaks). Plus the
   first slice of web notifications (a Profile "simulate check-in" button) — see
   `notifications.md`.

## App shell & routing

- `react-router-dom` v7. `nav.ts` holds `NAV_SECTIONS` — ordered "suites of
  views", each with optional `heading` and items carrying an `enabled` flag;
  disabled items render non-clickable with a "Soon" badge. `NAV_ITEMS` /
  `DEFAULT_ROUTE` are derived from the sections. (Built: an ungrouped first section =
  `/home` (the hub); "Shifts & hours" = placement hours log + weekly planner;
  "Trackers" = competency tracker + clinical skills; "Study & wellbeing" = reflection
  on practice + medication notes + revision timetable + self-care checklist; an
  "Account" section = `/profile`. All eight features are now enabled.)
- **Home / Today** (`/home`, `HomePage`, U2) — the hub landing page: mounts existing
  hooks/components (on-shift strip, hours pace, `TopGaps`, skills-in-progress,
  `ActivityLog`) with no new data. See `spec-home.md`.
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
  (`DEFAULT_ROUTE` = `/home`).
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
- the polymorphic `EvidenceLink` join (proficiency ← reflection | skill | shift |
  med log) — **built**; `EvidenceType` is `REFLECTION | SKILL | SHIFT | MED_LOG`
  (`SHIFT` / `MED_LOG` / `SKILL` / `REFLECTION` all wired). `SKILL`
  `evidenceId` points at `Skill.id`, `REFLECTION` at `Reflection.id`.

Each feature's own **Integrations** section records what it wires to. Built today:
Medication Notes ↔ Weekly Planner / Placement Hours Log (shift-linked med logs,
per-placement med counts, "Log a medication" from a shift); Medication Notes →
Activity Log (med actions in the feed); and the **NMC Competency Tracker** wiring
through `EvidenceLink` (shift + med-log evidence, two-way attach from the shift
editor / medication detail), `User.currentPart` (gap surfacing + top gaps on the
landing page), `CalcStat` (numeracy on drug-calc proficiencies), and `LogItem`.

## Connections

The cross-screen feeds — where two or more screens' functionality flows into each
other (each feature spec restates its own from its side). Built unless marked
_(planned)_:

- **Weekly Planner ↔ Placement Hours Log.** One shared `Shift` (`ShiftsProvider` +
  `useShiftActions`): create / move / resize / complete a shift in either and it shows
  in both; the hours summary, pace projection and per-placement breakdown recompute
  from the same rows; the shift editor is the same component on both.
- **Medication Notes ↔ Planner / Hours Log.** A med log links to the shift it happened
  in (`MedicationLog.shiftId`); the shift editor lists a shift's logged meds + a "Log a
  medication" shortcut; the hours-log breakdown counts meds-per-ward through the shift.
- **Competency Tracker ↔ Planner / Hours Log.** A completed shift attaches as a `SHIFT`
  `EvidenceLink`; the shift editor shows + links/unlinks the proficiencies it
  evidences; a proficiency's evidence row deep-links to `/planner/:shiftId`.
- **Competency Tracker → Placement Hours Log.** The landing page surfaces the top 3
  gaps (`TopGaps`).
- **Competency Tracker ↔ Medication Notes.** A med log attaches as a `MED_LOG`
  `EvidenceLink`; the medication detail shows competency context + an attach control;
  calc accuracy (`CalcStat`) surfaces on drug-calc proficiencies 4.14 / B11.4 and the
  calc page credits them.
- **Competency Tracker ↔ Profile.** Profile's `currentPart` / `totalParts` drive gap
  surfacing + escalation; the gaps / top-gaps views link back to profile.
- **Competency Tracker ↔ Clinical Skills.** A skill attaches to a proficiency via
  `EvidenceLink` (`SKILL`, `evidenceId` = `Skill.id`) — the real picker on the
  proficiency detail, plus an auto-link offered when a baseline skill is signed off
  (1:1 by code). The skill detail links back to its proficiency; the proficiency's
  evidence row deep-links to `/skills/:id`. They share the Annexe B / proficiency seed.
- **Competency Tracker ↔ Reflection.** A reflection attaches to a proficiency via
  `EvidenceLink` (`REFLECTION`, `evidenceId` = `Reflection.id`) — the real picker on the
  proficiency detail and a "Link to a proficiency" picker on the reflection detail (both
  directions); recent reflections feed the "Suggested from your activity" strip.
- **Reflection ↔ Planner / Hours Log / Clinical Skills.** A shift seeds a reflection: the
  post-shift debrief's "Write a reflection", the `ShiftReflections` panel in both shift
  editors, and reflections on the placement debrief (via `Reflection.shiftId`); the skill
  detail offers "Reflect on this skill" (prefilled title + tag).
- **Revision Timetable ↔ Planner / Hours Log.** The Timetable suggests study slots around
  the shared `Shift` rows (never clashing with a shift) and links back to the planner;
  the numeracy weak-area reads `CalcStat` and links to the med calc-practice screen.
- **Self-care ← Planner / Hours Log.** After a hard shift (night / long day / ~11h+) the
  post-shift debrief nudges a gentle `/self-care` check-in, prefilled with that shift
  (`SelfCareCheckin.shiftId`). A Profile button simulates a daily check-in web
  notification (see `notifications.md`).
- **All screens → Activity Log.** Auditable actions append a generic `LogItem` that
  renders in the global feed (shifts, med actions, proficiency status + evidence
  link/unlink, profile updates; future features the same way).
- **NMC Foundations → Hours Log / Competency / Clinical Skills** _(reference)_. The
  2,300-hour target, the proficiency master list and the Annexe B baseline derive from
  the foundations facts.

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
