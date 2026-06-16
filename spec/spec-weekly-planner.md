# Spec — Weekly Shift Planner  (Status: BUILT)

A calendar view for planning shifts, built **on top of the same `Shift` entity**
as the hours log. The planner is a view + a completion flow, not a separate data
store. Built on **FullCalendar** (v6, free MIT plugins) rather than a hand-rolled
grid, themed to the app's design.

## Decisions (locked)

- **Contents:** shifts **only** — no uni days, study blocks, assignment
  deadlines, or personal commitments on this planner.
- **Completion feeds the hours log:** the student **marks a planned shift
  complete and enters the name of the registered nurse they worked with**; that
  flips `PLANNED → COMPLETED` and the shift then counts toward hours. (The RN
  name is required to complete.)
- **No assessor-rota matching.** Do **not** try to match shifts to an assessor's
  rota. Recurring shift patterns/templates are **descoped** for now (revisit
  later).
- **Calendar sync:** start with **app → calendar** only.
  - The neutral, all-three-platforms mechanism is a **one-way `.ics`
    subscription feed** (Google / Apple / Outlook all subscribe to a feed URL).
    Note: it's one-way and clients **poll** it (hours, not instant) — not "live."
  - **RSS is not the mechanism** (read-only, wrong tool). True two-way live sync
    needs each provider's API (Google Calendar API first; Microsoft Graph for
    Outlook; Apple has no clean server API → CalDAV/.ics).
  - **v1 = `.ics` feed. Two-way (Google first) is a future phase.**

## Data model

Reuses `Shift` (no new shift table). `CalendarFeed` (`feedToken`; `.ics` URL =
`/feeds/{feedToken}.ics`) is only needed for the deferred live subscription feed
and is **not** used by the client-only `.ics` snapshot export. See
`spec-architecture.md`.

## Screens (built)

- **Calendar** — FullCalendar week (default) / month / day views, Monday-start,
  24-hour times over the **full 00:00–24:00 grid** (covers night shifts; they span
  midnight), with a now-indicator. Shifts render as chips coloured by status
  (planned = slate, counted = emerald, simulated = sky). On wide screens the
  add/edit form sits in a **sticky side panel** (~25% wide) beside the calendar,
  updating as you click each period; on narrow screens it stacks full-width below.
  A new (unsaved) shift shows a **persistent draft highlight** on the grid while
  you configure it, so the dragged-out block doesn't vanish when the form is
  focused; it clears on save/cancel.
- **Quick-add** — click a day → the shift form prefilled to that date, creating a
  `PLANNED` shift (reuses `ShiftForm` via an `initialDate` prop). **Click-drag
  across time slots** (week/day, Outlook-style) prefills the start/end times too,
  so the counted hours are set from the selection. Click a shift to edit; **drag
  to reschedule** (duration preserved, so stored hours stay valid).
- **Mark complete** — one-click on a planned shift → enter RN name →
  `COMPLETED` → counts in the hours log. Same bridge as the hours-log timesheet.
- **`.ics` export** — "Add to calendar" downloads a snapshot the student imports
  into Google / Apple / Outlook.

## Derived logic

- Calendar events are derived from the user's `Shift` rows (TZ-safe local date
  math in `logic/calendar.ts`; overnight shifts span midnight correctly).
- The `.ics` is generated from `Shift` rows (`logic/ics.ts`, tested).
- Completing a shift is the single bridge to the hours log — no duplicate state.

## Not yet built (future)

- **Live `.ics` subscription feed** — the spec's one-way `webcal://` feed (and
  `CalendarFeed`/`feedToken`) needs a backend to host `/feeds/{token}.ics`; the
  client-only PoC ships a downloadable `.ics` snapshot instead. Two-way sync
  (Google API first) remains a later phase.
- Recurring shift patterns/templates (descoped).
- In-grid resize to change a shift's duration (duration edits go through the
  form so hours recompute in one place).

## Build notes

- Because the planner and hours log share `Shift`, a shift created in either
  place appears in both; they can't drift out of sync (verified end-to-end).
- The two views each own a `useShifts()` instance; the hours log refreshes on
  navigation (they're never open at once under one router outlet).
