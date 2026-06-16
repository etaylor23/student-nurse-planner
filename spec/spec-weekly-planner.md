# Spec — Weekly Shift Planner  (Status: NEXT)

A calendar view for planning shifts, built **on top of the same `Shift` entity**
as the hours log. The planner is a view + a completion flow, not a separate data
store.

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

Reuses `Shift` (no new shift table). Adds `CalendarFeed` (`feedToken`, unguessable;
`.ics` URL = `/feeds/{feedToken}.ics`). See `spec-architecture.md`.

## Screens

- **Week view** (primary) + month view.
- **Day detail / quick-add shift** (creates a `PLANNED` shift).
- **Mark complete** flow: enter RN name → `COMPLETED` → counts in the hours log.
- **Calendar subscription** screen: copyable `.ics` URL + how-to for
  Google / Apple / Outlook.

## Derived logic

- The `.ics` feed is generated from the user's `Shift` rows (could later also
  include revision sessions/targets). One-way, polled.
- Completing a shift is the single bridge to the hours log — no duplicate state.

## Build notes

- Because the planner and hours log share `Shift`, a shift created in either
  place appears in both; they can't drift out of sync.
- Keep recurring-pattern logic out for now; just clean single-shift create +
  complete.
