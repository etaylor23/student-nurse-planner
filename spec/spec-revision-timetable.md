# Spec — Revision Timetable  (Status: SPECCED)

Plans revision around targets and shifts, with confidence tracking and weak-area
resurfacing.

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

None yet. (Planned shift-aware scheduling — excluding windows that overlap a
`Shift` — is noted under Derived logic.)

## Data reuse

- **Will reuse:** the shared `Shift` rows for shift-aware scheduling and `User`;
  numeracy weak-areas can read the existing `CalcStat` aggregate rather than a new
  store. Compose the shared `Entity` / `UserOwned` / `Created` bases for new entities.

**Direction:** read existing `Shift` / `CalcStat` data instead of copying it, and
relate sessions / topics by id. See `spec-architecture.md` → Data reuse.
