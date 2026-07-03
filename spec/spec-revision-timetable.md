# Spec — Revision Timetable  (Status: BUILT)

Plans revision around targets and shifts, with confidence tracking and weak-area
resurfacing.

**Built:** nested routes under `/revision` (Due now · Subjects · Timetable · Targets).
Data: `Subject` (baseline seed + custom), `RevisionTarget`, `RevisionTopic` (confidence
1–5 + spaced-repetition schedule), `RevisionSession`, via the additive Dexie `version(4)`.
Pure logic in `logic/revision.ts` (spaced-repetition `nextDue`, `isTopicDue`/`resurface`,
`daysUntil`) and `logic/revisionSchedule.ts` (shift-aware free-slot suggestion), both
unit-tested. A Pomodoro `SessionRunner` captures confidence-after and reschedules the
topic. Mutations flow through `useRevisionActions` (activity-log at the action layer).

## Decisions (locked)

- **Driven by targets, all optional:** the student can revise against **exam
  and/or assignment and/or OSCE dates** — any combination. **OSCE is optional**
  (not everyone sits OSCEs).
- **Subjects:** **all except bioscience** — i.e. anatomy & physiology,
  pharmacology, pathophysiology, NMC theory, numeracy, OSCE prep.
- **Methods:** support **all three** — spaced repetition, fixed weekly blocks,
  and Pomodoro.
- **Confidence tracking:** **yes** — track confidence per topic and **resurface
  weak areas.**
- **Around shifts:** **yes** — schedule so revision **never clashes with
  placement** shifts.

## Data model

`Subject` (`userId` null = baseline), `RevisionTarget` (`type`
EXAM/ASSIGNMENT/OSCE, `date`, optional `subjectId`), `RevisionTopic`
(`confidence` 1–5, `lastReviewed`, `nextDue`), `RevisionSession` (`method`,
`scheduledStart/End`, `completed`, `pomodoroCount`, `confidenceAfter`). See
`spec-architecture.md`.

## Screens

- **Timetable view** — sessions placed around shifts.
- **Targets list** — exam / assignment / OSCE.
- **Subjects → topics** — confidence + next-due.
- **Study session runner** — Pomodoro timer for the POMODORO method; capture
  confidence after a session.
- **Weak-areas / due-now view.**

## Derived logic

- **Spaced repetition:** `nextDue` from `confidence` + `lastReviewed` (lower
  confidence → sooner).
- **Resurface:** topics where `nextDue ≤ now` OR `confidence ≤ 2`.
- **Shift-aware scheduling:** when placing `RevisionSession` blocks, exclude
  windows overlapping any `Shift` start/end (reuses the shared `Shift` data).

## Seed data

Baseline `Subject` rows: A&P, Pharmacology, Pathophysiology, NMC Theory,
Numeracy, OSCE Prep.

## Integrations

- **Weekly Planner / Placement Hours Log (built).** The Timetable's slot suggester reads
  the shared `Shift` rows and excludes any window that overlaps a shift (plus
  already-scheduled sessions), and links back to `/planner`.
- **Medication Notes (built).** The Due-now view's numeracy card reads the existing
  `CalcStat` aggregate (no parallel store) and links to `/medications/calc` (deep-linking
  the weakest calc type).

## Connections _(built)_

Where this screen and others feed into each other:

- **↔ Weekly Planner / Placement Hours Log.** Study sessions are suggested around the
  shared `Shift` rows (never clashing with a shift) via `logic/revisionSchedule.ts`; the
  Timetable links to the planner. (`.ics` revision blocks remain a future option.)
- **← Medication Notes.** The numeracy weak-area reads the existing `CalcStat` aggregate
  and links to the drug-calc practice screen — same skill, one source of truth.
- **→ Activity Log.** Topic added / reviewed, target added and completed sessions append
  `LogItem`s (`REVISION_*`); the feed filters under a "Revision" chip and links to
  `/revision`.
- **← NMC Foundations** _(reference)_. Baseline subjects come from the foundations facts.

## Data reuse

- **Will reuse:** the shared `Shift` rows for shift-aware scheduling and `User`;
  numeracy weak-areas can read the existing `CalcStat` aggregate rather than a new
  store. Compose the shared `Entity` / `UserOwned` / `Created` bases for new entities.

**Direction:** read existing `Shift` / `CalcStat` data instead of copying it, and
relate sessions / topics by id. See `spec-architecture.md` → Data reuse.
