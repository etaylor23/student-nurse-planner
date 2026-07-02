# Roadmap — Usability & Interconnectedness (Status: INVESTIGATED — ready to build)

_Written 2026-07-02, from a code-level audit of every built screen. This document is
the **complete brief** for the implementing agent: it assumes you have read
`HANDOVER.md` (§2 quality gate, §3 data model, §5 gotchas) and
`spec-architecture.md`, but nothing else — every item below carries its own
file/symbol anchors, data-change notes and acceptance checks. Line numbers were
verified on commit `08f1372`; they will drift, so anchor on the named symbols._

---

## 0. Product intent (why this roadmap exists)

We are **deliberately not building new feature screens**. The goal is to squeeze the
maximum out of the seven screens already built (Hours Log, Planner, Medication
Notes, NMC Competency Tracker, Clinical Skills Tracker, Profile, + the Activity
feed) and their interconnectedness. Success looks like a student nurse thinking:

> "Oh, that is so helpful having that view *there* — I never thought those two
> things could be connected like that. This changes my mental model."

…and progress feeling so smooth that students *can't help but take the next
action*. Every item below is judged against those two bars: **mental-model-changing
cross-surfacing** and **next-action pull**.

## 1. Locked scope decisions (do not relitigate)

- **A Home/Today dashboard is in scope** — it counts as connective tissue, not a
  new feature screen.
- **Data-model changes are acceptable** (even sweeping ones) when they unlock a
  strong connection. Keep them additive per the house rules; flag them in commits.
- **Usage context: both desktop and phone, phone-lean.** Students capture on their
  phone right after a shift and review/plan on a laptop. Quick-capture flows get
  extra weight; everything must work one-thumb at 375px.

## 2. The core finding (read this before any item)

**The data layer is far more connected than the UI lets on.** The spine already
exists in the model:

> **Shift** (where practice happens) → **captures** (med logs, skill stages) →
> **evidence** (`EvidenceLink`) → **proficiencies / PAD readiness** (gaps)

…but the UI presents these as five separate apps. The app *records* everything and
*responds* to almost nothing. Three symptomatic examples found in the audit:

1. `medsByPlacement` is **already computed** in `HoursLogPage.tsx:24` and passed to
   `PlacementBreakdown` (`HoursLogPage.tsx:160`) — but rendered as dead text
   ("8 meds logged", `PlacementBreakdown.tsx:56`), linking nowhere.
2. Marking a shift **worked** (`ShiftsContext.tsx:176 markWorked`) — the most
   frequent, highest-emotion action in the app — silently locks the row. No hours
   progress shown, no "what did you do on this shift?", no next action.
3. Every activity-feed entry knows `entityType` + `entityId`, and every entity has
   a route — yet **no feed entry is clickable** (`LogList.tsx`).

Nearly every item below is "make the spine visible".

## 3. How to use this roadmap

- Items are **U1–U11**, grouped into three build waves. Build in wave order;
  within a wave, order is flexible except where a dependency is noted.
- Each item lists: **Why** (student value) · **Build** (concrete scope) ·
  **Where** (files/symbols) · **Reuse** (existing patterns to copy) · **Data**
  (schema impact) · **Done when** (acceptance checks).
- **Definition of done for every item** (house rules — no exceptions):
  1. Quality gate: `npm run typecheck` clean · `npm run lint` 0 errors (3 accepted
     `react-refresh` warnings) · `npm test` pass · `npm run build` OK ·
     `npx prettier --write` changed files.
  2. Pure logic goes in `src/logic/` with unit tests (mirror `tests/skills.test.ts`).
  3. New auditable actions append `LogItem`s **at the hook/action layer** (like
     `useShiftActions` / `useSkillActions`), never in the repository; add dot
     colours in `LogList.tsx`.
  4. Update the touched spec(s) **in the same commit** (each item lists which).
     Mark the item done in this file (change its `[ ]` to `[x]` in §8).
  5. Verify in the browser preview (per-port IndexedDB = fresh seed each run;
     `innerText` upper-cases CSS-uppercase text — match case-insensitively).
  6. Git: work in the **main repo** (`/Users/ellistaylor/Work/student-nurse-planner`),
     **no worktrees**, focused commits straight to `master`, push (auto-deploys to
     GitHub Pages). End commit messages with the
     `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## Wave 1 — wiring (pure UI over existing data; zero risk; do first)

### U5 · Skill ↔ proficiency bridges, surfaced everywhere  `[Tier 2 · S]`

**Why.** Baseline skills map 1:1 to Annexe B proficiencies by code
(`skill_B2.1` ↔ `prof_B2.1`, helpers `annexeCodeOf` / `annexeProficiencyIdOf` in
`src/data/seed/skills.ts`) — but the mapping is only visible on the skill detail
page. The two trackers should visibly be two lenses on one journey.

**Build.**
1. **Platform detail** (`competencies/PlatformDetailPage.tsx`): on every Annexe B
   proficiency row, render the matching skill's stage badge / signed-off badge
   (reuse `SkillStageBadge` / `SignedOffBadge` from `components/skills/shared.tsx`)
   linking to `/skills/skill_<code>`. Look up via `useSkills()` +
   `progressBySkill` (`src/logic/skills.ts`).
2. **Gaps page** (`competencies/GapsPage.tsx`): for an Annexe B gap, add a
   secondary line/action "Practise the skill →" linking to its skill.
3. **Skills list** (`skills/SkillsListPage.tsx`): show the B-code on Annexe B rows
   (small tabular-nums span, like proficiency rows do) so students learn the code
   correspondence.
4. **Post-sign-off confirmation** (`skills/SkillDetailPage.tsx`): after sign-off
   (the `signedOff` branch), when the evidence link exists, render "This skill now
   counts as evidence for **B2.1** → view proficiency" (it already shows sign-off
   metadata; add this line under it).

**Reuse.** The skill lookup pattern in `SkillDetailPage.tsx` (`annexeProficiencyIdOf`).
**Data.** None.
**Specs to sync.** `spec-competency-tracker.md`, `spec-clinical-skills.md` (Connections).
**Done when.** From `/competencies/platform/B` every row shows the paired skill
state and clicks through; from a B-gap you can reach the skill in one click; a
signed-off Annexe B skill page links to its proficiency evidence.

### U6 · Clickable activity feed (and give it reach)  `[Tier 2 · S–M]`

**Why.** The feed is the system's memory but is a dead end: entries are plain text
and it only renders on the Planner (`PlannerPage.tsx:478`). Making it clickable
turns "what was I doing?" into navigation.

**Build.**
1. **Gotcha found in audit:** `LogGroup` (`src/logic/logGroups.ts`) carries
   `entityId` but **not** `entityType`. Add `entityType` to the group (take it
   from `entries[0].entityType`) — pure logic change + test.
2. Add an `hrefForEntity(entityType, entityId): string | null` helper (put it in
   `logGroups.ts` or a small `src/logic/entityLinks.ts`): `SHIFT` →
   `/planner/{id}` · `PROFICIENCY` → `/competencies/proficiency/{id}` · `SKILL` →
   `/skills/{id}` · `MEDICATION` → `/medications/{id}` · `MEDICATION_LOG` → the
   med detail if resolvable, else `/medications/log` · `PROFILE` → `/profile`.
   Return null for unknown types (deleted entities still render as text — fine;
   the row target may 404-redirect if deleted, which the router already handles
   via the catch-all).
3. In `LogList.tsx`, wrap the group header (and/or add a small "open →" affordance)
   in a `<Link>` when `hrefForEntity` returns non-null.
4. **Filter chips** above the feed in `ActivityLog.tsx`: All · Shifts · Meds ·
   Competencies · Skills (filter on `entityType`; copy the chip pattern from
   `SkillsListPage.tsx` FILTERS).
5. **Mount the feed beyond the Planner**: add `<ActivityLog />` to `HoursLogPage`
   (bottom) — students logging shifts there currently never see it. (U2's
   dashboard will mount it a third time.)

**Data.** None. **Specs to sync.** `spec-activity-log.md`.
**Done when.** Clicking "B2.1 marked Achieved" opens that proficiency; clicking a
shift group opens `/planner/{shiftId}`; chips filter; feed visible on Hours Log.

### U7 · Custom skills join the evidence economy  `[Tier 2 · S]`

**Why.** Custom skills are the one entity type excluded from the spine: they can be
staged and signed off but cannot relate to any proficiency
(`skills/SkillFormPage.tsx` has no picker; `SkillDetailPage` shows the
"Counts toward" line only for Annexe B).

**Build.**
1. On **skill detail** for CUSTOM skills, add a "Link to a proficiency" action that
   opens the existing `ProficiencyPicker`
   (`components/competencies/ProficiencyPicker.tsx`) and creates
   `EvidenceLink{ evidenceType: "SKILL", evidenceId: skill.id }` + an
   `EVIDENCE_LINKED` LogItem (copy `addEvidence` from `ProficiencyDetailPage.tsx`).
   Show the skill's existing SKILL evidence links (query
   `listEvidenceLinksForUser`, filter `evidenceType === "SKILL" && evidenceId ===
   skill.id`, resolve proficiency codes) as "Evidences: 4.6, B2.2 →" links.
   Render that list for Annexe B skills too (supersedes the single hard-coded line).
2. In the **sign-off form** for CUSTOM skills, mirror the Annexe B auto-link
   checkbox: "Also attach as evidence for a proficiency…" opening the picker.
3. Route the mutation through `useSkillActions` (extend `signOff` /
   add `linkSkillToProficiency`) so the LogItem lives at the action layer.

**Data.** None. **Specs to sync.** `spec-clinical-skills.md`, `spec-competency-tracker.md`.
**Done when.** A custom skill can be attached to any proficiency from its own page,
shows where it's evidenced, and the link appears on the proficiency detail + feed.

### U11 · Dead-end sweep (one bundle commit)  `[Tier 3 · S]`

Small fixes, each verified in the audit as a literal dead end:

1. `medications/MedLogPage.tsx` — history rows render the med name as plain text;
   link to `/medications/{medicationId}` when set.
2. `medications/MedicationDetailPage.tsx:297` — "+N more in the med log" is dead
   text; make it a link to `/medications/log` carrying
   `state: { filterMedicationId: medication.id }`, and honour that state in
   `MedLogPage` (prefill-state pattern already exists at `MedLogPage.tsx:34–53`).
3. `PlacementBreakdown.tsx:56` — the per-placement med count becomes a link (same
   filter-state mechanism, or to the placement view once U3 exists).
4. `PlannerPage.tsx` empty sidebar (~line 334) — mention the placement-palette
   drag-to-create feature (currently a hidden mechanic).
5. Evidence-picker empty states in `ProficiencyDetailPage.tsx` — cross-promote:
   the SKILL tab's empty text should point at `/skills`, the MED_LOG tab at
   `/medications/log` (as links, not just words).

**Data.** None. **Specs to sync.** `spec-medication-notes.md` (light), others n/a.
**Done when.** None of the five render as plain text any more.

---

## Wave 2 — the spine (small data change first, then the flows that exploit it)

### U8 · Skill sign-off ↔ shift link  `[Tier 2 · S–M · DATA CHANGE]`  *(build before U1/U3)*

**Why.** House pattern: *"actions are logged against a shift"*
(`MedicationLog.shiftId` — see `spec-architecture.md` → Derived logic). Skills are
the last capture type missing it. This is what makes the shift debrief (U1) and
placement view (U3) fully rich.

**Build.**
1. **Types** (`src/domain/types.ts`): add `shiftId?: string` to `SkillProgress`
   (comment: the shift the sign-off happened in) and to `SkillSignOff`.
2. **Dexie:** an optional, *unindexed* field needs **no schema/version change**
   (Dexie only declares indexes). Do NOT add an index — filter in memory, same
   PoC-scale decision as `signedOff` (see the comment in `src/data/schema.ts`).
   Only if an index is ever needed: additive `version(3)` re-declaring the
   `skillProgress` index string — zero data loss, no `.upgrade`, follow the
   `V2_ADDED_STORES` precedent in `src/data/dexie/db.ts`.
3. **Repository** (`dexieRepository.ts` `signOffSkill`): persist `shiftId`.
4. **Sign-off form** (`skills/SkillDetailPage.tsx`): add an optional shift picker —
   copy the med log's picker UX exactly (`MedLogPage.tsx`: auto-follow the current
   timed shift, else offer the last 7 days). Selecting a shift can prefill
   `signOffLocation` from the shift's placement name.
5. **Shift editor**: new `ShiftSkills.tsx` beside `ShiftMedications` /
   `ShiftEvidence` (mounted in the same two places — the HoursLog edit panel and
   the Planner sidebar; grep `<ShiftMedications` for the mount points): lists
   skills signed off against this shift, plus a "Sign off a skill" CTA navigating
   to `/skills` with `state: { prefillShiftId }` (honour it in the sign-off form).

**Repo round-trip test:** sign-off with `shiftId` persists and survives stage change.
**Specs to sync.** `spec-clinical-skills.md` (data model + Connections),
`spec-architecture.md` (SkillProgress model + "actions are logged against a shift"
list). **Done when.** A sign-off can reference a shift; the shift editor shows it;
existing rows (no `shiftId`) still render fine.

### U1 · The post-shift debrief flow  `[Tier 1 · M]`  ⭐ highest-value item

**Why.** Completing a shift is the highest-frequency, highest-emotion moment and
the natural phone moment (bus home, day fresh in mind). Today it silently locks
the row. Convert it into the engine that feeds every other screen.

**Build.**
1. New `ShiftDebrief.tsx` shown immediately after `markWorked` succeeds. Two call
   sites return `true` on success: `PlannerPage.tsx:134 completeShift` and the
   HoursLog path (grep `markWorked` in `HoursLogPage.tsx` / `TimesheetExport.tsx`
   callbacks). Render as a Panel swap on desktop; on mobile it should read as a
   bottom-sheet-style full-width card (existing `card` token, no new framework).
2. Content, in order:
   - **Progress line:** "That's {counted}h of 2300 ({pct}%) — ≈{shifts-to-go} to
     go" — all already computed in `useShifts()`'s summary/projection
     (`ShiftsContext.tsx`); just render it.
   - **Three capture prompts** (buttons):
     a. "Log a medication you saw" → `/medications/log`,
        `state:{ prefillShiftId }` (mechanism exists, `ShiftMedications.tsx:39`);
     b. "Update a skill you practised" → `/skills`, `state:{ prefillShiftId }` (U8);
     c. "Attach this shift as evidence" → opens the existing `ShiftEvidence`
        picker inline, seeded with U4 suggestions once U4 lands (plain picker
        until then).
   - Dismiss ("Done for today") returns to the normal editor view.
3. No new LogItem actions needed (completion is already logged).

**Data.** None beyond U8. **Specs to sync.** `spec-weekly-planner.md`,
`spec-placement-hours-log.md` (Connections), `spec-activity-log.md` n/a.
**Done when.** Completing a shift from either screen shows the debrief with a live
progress line and three working prompts; dismissing it never blocks the lock flow;
verified at 375px width.

### U4 · Evidence suggestions — "you already have evidence for this"  `[Tier 1 · M]`

**Why.** Flips evidence-linking from a manual chore into *recognition* ("I've
already done this — I just need to claim it"). Strongest momentum mechanic for the
tracker.

**Build.**
1. **Pure logic first**: `src/logic/evidenceSuggestions.ts` with unit tests:
   ```ts
   suggestEvidence(proficiency, { shifts, medLogs, skills, skillProgress, links })
     -> { medLogs: MedicationLog[]; skill?: { skill, progress }; shifts: Shift[] }
   ```
   Rules (keep them dumb and explainable):
   - proficiency is Platform 4 (`platform === 4`) or code starts `B11` → suggest
     up to 5 most-recent **unlinked** med logs;
   - proficiency is Annexe B → the 1:1 skill (`skill_<code>`) + its progress
     (suggest linking when a stage exists or it's signed off but unlinked);
   - up to 3 most-recent **completed, unlinked** shifts.
   "Unlinked" = no existing `EvidenceLink` for this proficiency with that
   evidenceId (`linkedFor` in `ProficiencyDetailPage.tsx` shows the pattern).
2. **Proficiency detail** (`ProficiencyDetailPage.tsx`): above the evidence-type
   tabs, render a "Suggested from your activity" strip with one-click Attach
   buttons (reuse `addEvidence`, which already logs `EVIDENCE_LINKED`).
3. **Gaps page** (`GapsPage.tsx`): per gap row, a compact "evidence ready" hint
   when suggestions are non-empty ("2 med logs + a skill could evidence this →"
   linking to the proficiency detail). Don't build an inline picker here — the
   detail page is one click away and already has everything.
4. U1's debrief reuses the same logic inverted (given a shift, which gap
   proficiencies could it evidence) — expose a second helper
   `suggestProficienciesForShift(shift, {proficiencies, progress, links, medLogs})`
   returning the top 3 gaps this shift could plausibly evidence (start simple:
   any gap; refine later).

**Data.** None. **Specs to sync.** `spec-competency-tracker.md` (Screens +
Connections). **Done when.** A student with med logs opening a Platform-4/B11
proficiency sees them suggested and can attach in one click; suggestions never
show already-linked items; logic is unit-tested.

---

## Wave 3 — the hubs (build once the captures feeding them are rich)

### U2 · Home / Today dashboard  `[Tier 1 · M–L]`

**Why.** The landing page today is a timesheet. A hub makes cross-surfacing
structural and is the natural phone entry point.

**Build.**
1. New route `/home` + `HomePage.tsx`. In `nav.ts`, add it as the **first** item of
   a new first section (no heading needed) — `DEFAULT_ROUTE` derives from the
   first enabled item (`nav.ts:52`), so `/` redirects there automatically. Add an
   icon in `AppLayout.tsx` `ICONS` map (path key `/home`).
2. Content (all existing hooks/components, no new data):
   - **"On shift now / next shift" strip** — the current-shift detection logic
     exists in `MedLogPage.tsx` (auto-follow); extract it into `src/logic/` so
     both use it. Quick actions: log med (prefill state), update skill (U8 state),
     open shift in planner.
   - **Hours pace tile** — reuse the summary/projection from `useShifts()` (the
     `HoursSummaryPanel` internals; extract a compact variant).
   - **Top gaps** — mount the existing `TopGaps` component (currently only on
     `HoursLogPage.tsx:76`).
   - **Skills in progress** — from `useSkills()`: in-progress count + 2–3
     most-recently-updated `SkillProgress` rows linking to their skills.
   - **Recent activity** — `<ActivityLog />` (clickable after U6).
3. Keep `HoursLogPage` unchanged (it keeps its own TopGaps + feed; duplication of
   mounts is fine — they're the same components reading the same hooks).

**Data.** None. **Specs to sync.** new short `spec-home.md` (follow `spec-profile.md`
as the size model) + `spec-architecture.md` App shell/routing + `README.md`
feature table + nav change note. **Done when.** `/` lands on Home; every tile
clicks through to its screen; usable one-thumb at 375px.

### U3 · Placement debrief view — "what did this placement give me?"  `[Tier 1 · M]`

**Why.** Placement names are plain text everywhere; no screen answers the question
a student takes into a **midpoint/final PAD interview**: what did this placement
give me? Reframes a placement from "a name on a timesheet" to "a container of
growth".

**Build.**
1. New detail-only route `/placements/:id` (no nav entry — same pattern as
   `/planner/:shiftId`) + `PlacementDetailPage.tsx`.
2. All in-memory joins over existing hooks (PoC scale is fine):
   - shifts: `useShifts()` filtered by `placementId` → hours counted/planned,
     date span, shift list linking to `/planner/{id}`;
   - meds seen here: med logs whose `shiftId` ∈ those shifts (or reuse
     `medsByPlacement` from `src/logic/medications.ts`), each linking to the med;
   - proficiencies evidenced here: `listEvidenceLinksForUser` → SHIFT links whose
     `evidenceId` ∈ those shift ids → resolve + link proficiencies;
   - skills signed off here (needs U8): `skillProgress` rows with `shiftId` ∈
     those shifts.
   Put the aggregation in `src/logic/placementSummary.ts` (pure + unit tests).
3. Link every placement name to it: `PlacementBreakdown` rows,
   `TimesheetExport.tsx` placement cells, `PlacementManager` rows, and the planner
   palette chips (grep the placement-name renders).

**Data.** None beyond U8. **Specs to sync.** `spec-placement-hours-log.md`
(Screens + Connections). **Done when.** Clicking any placement name opens a page
answering "hours, shifts, meds, proficiencies, skills — from this placement", each
row deep-linking onward.

### U9 · Golden-moment responses  `[Tier 3 · S each]`

Each is a small, independent commit:

1. **Calc exam completion** (`medications/CalcPracticePage.tsx` result block,
   ~lines 212–230): on pass, add "This demonstrates drug-calculation accuracy —
   evidence for [4.14](/competencies/proficiency/prof_4.14) and
   [B11.4](/competencies/proficiency/prof_B11.4)". (`NumeracyPanel` already shows
   accuracy on those proficiency pages — this closes the loop from the exam side.)
2. **Proficiency saved** (`ProficiencyDetailPage.tsx` `saveStatus`): after save,
   show the new overall % (from `overallPercentAchieved`) and, if gaps remain, a
   "next gap →" link (reuse `surfaceGaps`, take the top item).
3. **Skill stage advance** (`SkillDetailPage.tsx` `handleStage`): brief inline
   confirmation ("Advanced to Assisted") — a transient state flag, no toast
   library.
4. **Hours milestones** (`HoursSummaryPanel`): at ≥25/50/75/100% render a one-line
   milestone note; keep the existing simulated-cap warning but link it to the
   timesheet filtered to simulated shifts.

**Data.** None. **Specs to sync.** touched feature specs, one line each.

### U10 · Profile "current impact" panel  `[Tier 3 · S]`

**Why.** Profile is a settings island; saving a part change never answers "so what
changed?".

**Build.** In `ProfilePage.tsx` beside the existing "Why this matters" panel
(line ~180): a live panel — "Part {current} of {total} · **{N} proficiencies due
now** → view gaps" (compute with `surfaceGaps` via `useProficiencies()` +
the form's *current* part value so it updates as the user edits, before save).
After a save that changed `currentPart`, keep the confirmation but append
"— {N} gaps now due →".

**Data.** None. **Specs to sync.** `spec-profile.md`.
**Done when.** Changing the part number visibly changes the due-gap count before
your eyes, and the gaps link carries you there.

---

## Cross-cutting direction (architectural through-line)

**Make `shiftId` the universal optional join on every capture.** Med logs have it;
skill sign-offs get it in U8; the future Reflection feature must carry it too
(note added in `spec-reflection.md` when built). Everything downstream — shift
debrief (U1), placement debrief (U3), dashboard "today" (U2) — falls out of that
one pattern. When adding any new capture type, the first question is "does it
carry `shiftId`?"

## 8. Checklist (tick as built; keep statuses honest)

Wave 1
- [x] U5 · Skill ↔ proficiency bridges everywhere
- [ ] U6 · Clickable activity feed + filters + mounts
- [ ] U7 · Custom skills → proficiency linking
- [ ] U11 · Dead-end sweep bundle

Wave 2
- [ ] U8 · Skill sign-off ↔ shift link `[data]`
- [ ] U1 · Post-shift debrief flow ⭐
- [ ] U4 · Evidence suggestions

Wave 3
- [ ] U2 · Home / Today dashboard
- [ ] U3 · Placement debrief view
- [ ] U9 · Golden-moment responses (4 small commits)
- [ ] U10 · Profile current-impact panel

## Provenance

Produced from three parallel code audits (shifts suite; medications suite;
trackers + profile + feed) on 2026-07-02 against commit `08f1372`, plus locked
scope answers from the product owner (dashboard in scope · data changes acceptable
· phone-lean). The per-item file anchors were verified by grep at writing time.
