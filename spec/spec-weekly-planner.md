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
  A new (unsaved) shift shows a **live draft highlight** on the grid: it doesn't
  vanish when the form is focused, and it's two-way — editing the form's date/
  start/end moves and resizes the highlight, and dragging on the grid fills the
  form. It clears on save/cancel. Event chips show the **placement** (ward/team)
  alongside the time and shift type, and a small **Planned / Counted / Simulated**
  legend sits under the grid. The shift open in the editor shows an **active
  highlight** (emerald) on the grid so the selection is obvious; pressing
  **Backspace/Delete** then removes it (same as the Delete button — ignored while
  typing in a field, and not offered for a locked shift).
- **Quick-add** — click a day → the shift form prefilled to that date, creating a
  `PLANNED` shift (reuses `ShiftForm`, defaulting to your most recent placement).
  **Click-drag across time slots** (week/day, Outlook-style) prefills the start/end
  times too, so the counted hours are set from the selection. Click a shift to
  edit; **drag
  to reschedule** (duration preserved) or **drag its edge to resize** (the counted
  hours and break recompute for the new span). Timed shifts store absolute
  `startAt`/`endAt` datetimes, so overnight shifts render correctly across midnight;
  resize **clamps to 24h from the start** (a nurse shift is never longer, and it
  stops a stray drag producing a nonsensical span).
- **Mark complete** — one-click on a planned shift → enter RN name →
  `COMPLETED` → counts in the hours log. Same bridge as the hours-log timesheet.
- **Make a copy** — a button in the editor (next to *Mark worked*) and a copy icon
  on a planned chip (next to the tick) duplicate the shift at the same time as a new
  `PLANNED` shift (no RN — it hasn't been worked), so it can be **dragged to another
  day**. Logged as "Copied the shift".
- **Placements palette** — above the calendar, the user's placements show as
  prebuilt **drag-and-drop chips** (FullCalendar `Draggable` + `droppable`). Dragging
  one onto the grid creates a **2-hour `PLANNED`** shift for it at the drop time
  (then editable/draggable). The chips use a CSS grid of `min(count, 6)` equal
  columns, so they fill the full width and size dynamically (4 → 25% each, max 6 per
  row).
- **Locked when complete** — a `COMPLETED` shift shows a **padlock** on its chip and
  **can't be dragged or resized**; opening it shows a read-only form with an
  **Unlock to edit** button (reactivates it → `PLANNED`). Each shift's editor lists
  its **history** (created / completed / reactivated …) newest-first. See
  `spec-activity-log.md`.
- **Medications logged in the shift** — the editor also lists any `MedicationLog`
  entries linked to the shift (auto-linked when logged during its window, or chosen
  from the last 7 days). Actions are logged against the shift they happen in. See
  `spec-medication-notes.md`.
- **`.ics` export** — "Add to calendar" downloads a snapshot the student imports
  into Google / Apple / Outlook.
- **Deep link** — `/planner/:shiftId` opens the week containing that shift **and**
  its editor. Clicking an event navigates there (so the open shift is in the URL and
  shareable); closing the editor returns to `/planner`. The timesheet's "view in
  planner" row action links straight to the shift. Routes are **path-based — no
  query strings**.
- **Activity feed** — a global **Activity** panel at the bottom lists every shift
  action (created / completed / reactivated / deleted …) newest-first. See
  `spec-activity-log.md`.

## Derived logic

- Calendar events are derived from the user's `Shift` rows (TZ-safe local date
  math in `logic/calendar.ts`; overnight shifts span midnight correctly).
- The `.ics` is generated from `Shift` rows (`logic/ics.ts`, tested).
- Completing a shift is the single bridge to the hours log — no duplicate state.

## Integrations

- **Medication Notes ↔ shift editor (built).** A shift's editor lists the meds
  logged in it (`ShiftMedications`) and offers a **"Log a medication"** shortcut
  that opens the med log **pinned to that shift** (via React Router `state`). Med
  logs auto-link to the shift you're in (`MedicationLog.shiftId`). Med actions also
  appear in this page's **Activity feed** (see the activity-log spec).
- **NMC Competency Tracker ↔ shift editor (built).** The same shift editor shows the
  proficiencies a shift evidences and lets you **link/unlink** a `SHIFT`
  `EvidenceLink` (`ShiftEvidence` + the shared `ProficiencyPicker`); a proficiency's
  evidence row deep-links back to `/planner/:shiftId`. See `spec-competency-tracker.md`.

## Not yet built (future)

- **Live `.ics` subscription feed** — the spec's one-way `webcal://` feed (and
  `CalendarFeed`/`feedToken`) needs a backend to host `/feeds/{token}.ics`; the
  client-only PoC ships a downloadable `.ics` snapshot instead. Two-way sync
  (Google API first) remains a later phase.
- Recurring shift patterns/templates (descoped).

## Build notes

- The planner and hours log share one app-level `ShiftsProvider` (a single
  in-memory `Shift` source via `useShifts`) and the `useShiftActions` mutations
  (create/update/delete/mark-worked + duplicate guard), so a change in either
  reflects in both instantly — one source, no per-page fetch, no drift. See
  `spec-architecture.md`.

## Connections

Where this screen and others feed into each other (built unless marked _(planned)_):

- **↔ Placement Hours Log.** One shared `Shift` via `ShiftsProvider` — changes on the
  calendar (create / drag / resize / complete) reflect instantly in the hours log, and
  the shift editor is shared.
- **↔ Medication Notes.** The shift editor lists meds logged in a shift + a "Log a
  medication" shortcut (pinned to the shift); med logs carry `shiftId`.
- **↔ NMC Competency Tracker.** The shift editor shows / links / unlinks the
  proficiencies a shift evidences (`ShiftEvidence`); a proficiency's evidence row
  deep-links to `/planner/:shiftId`.
- **↔ Clinical Skills.** The shift editor's `ShiftSkills` lists skills signed off in
  the shift + a "Sign off a skill" shortcut (pinned to the shift, U8).
- **→ Post-shift debrief (U1).** Marking a shift worked opens `ShiftDebrief` — a live
  hours-progress line and three one-tap capture prompts (log a med / update a skill /
  attach as evidence, the last seeded with U4 gap suggestions), each pinned to the
  shift. Dismissing never blocks the lock (completion is already done + logged).
- **↔ Revision Timetable** _(planned)_. Revision sessions schedule around these shifts;
  the `.ics` export may include revision blocks.
- **→ Activity Log.** Shift lifecycle actions append `LogItem`s.

## Data reuse

- **Reuses:** the same `Shift` (and `Placement`, `User`) as the hours log — one
  `ShiftsProvider` + `useShiftActions`, so there is **no per-view shift model**;
  `LogItem` for activity; `MedicationLog` (by `shiftId`) to list a shift's meds.
- **Owns:** transient UI-only shapes (e.g. the `NewShift` drag scratch type) that
  convert into a `ShiftDraft` before saving — never persisted separately.

**Direction:** treat `Shift` as the single shared entity — add fields to it in
`domain/types.ts` (+ `schema.ts`), not to a planner-local copy — and relate new data
to a shift by `shiftId`. See `spec-architecture.md` → Data reuse.
