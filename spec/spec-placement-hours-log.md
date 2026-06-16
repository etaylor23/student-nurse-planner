# Spec — Placement Hours Log  (Status: BUILT, slice 1)

Logs placement shifts and tracks progress toward the NMC practice-hours target.

## Decisions (locked)

- **Target:** track **only** toward the **2,300 practice hours** (not theory).
  Show running total and remaining.
- **Per-shift capture:** date, setting/ward (placement), hours, **shift type**
  (early / late / night / long day / other), and the **supervisor/registered
  nurse** name. (All of these.)
- **Breaks:** a 12.5h shift counts as **11.5h** (a 1h break deducted). The
  student can enter a shift either as **counted hours directly (NET)** or as
  **gross/raw hours (RAW)**; for RAW entry, a break is **auto-deducted**. The
  applied break is **overridable** per shift.
  - Break rule = a **small configurable band table** (closer to NHS policy than
    a flat rule). Default: `0–6h → 0`, `6–9h → 30`, `9h+ → 60` minutes — so a
    12.5h (750-min) long day → 60-min break → 11.5h.
- **Simulated practice:** flagged **separately** per shift, counted as a
  **subset** of the 2,300, and tracked against the **600-hour cap** (warn at/over
  the cap).
- **Export:** a **printable/exportable timesheet** (CSV + print-to-PDF). The PAD
  remains the official signed record.

## Data model

`Placement`, `Shift`, `BreakRule` — see `spec-architecture.md`. Notable:
`Shift.entryMode` (NET/RAW), `rawDurationMins`, `breakMins`, `netHours`
(derived/stored), `isSimulated`, `status` (PLANNED/COMPLETED),
`supervisingRnName`.

## Screens (built)

- **Hours summary** — progress bar toward 2,300; a pace line ("≈ N shifts to go ·
  on track for <month year>"); stat cards: counted, remaining, simulated (with
  headroom under the 600 cap), planned (not counted); cap warning when reached.
- **Placements** — quick add (name + optional setting) and an editable list
  (inline rename, delete; delete warns when shifts reference the placement).
- **Log a shift** — form: date, placement, **optional start/end times that
  auto-derive the shift length (handles overnight)**, shift type, NET-or-RAW
  entry with a live "counts as X h after a Y-min break" preview, simulated
  toggle, worked-&-complete toggle that requires the RN name, notes. Editing a
  shift reuses the same form.
- **Break rules** — an editable per-user band table ("shifts up to N h → M min
  break") that overrides the built-in defaults, with reset-to-defaults.
- **Timesheet** — filterable table (by placement, status, date range), newest
  first, with friendly dates ("Thu 18 Jun"), a simulated badge, and **per-row
  edit / delete / mark-worked**; CSV export (incl. start/end, respects the active
  filter) + print/PDF.
- **Hours by placement** — counted (and planned) hours grouped per ward/team,
  each with a per-placement CSV export.

## Derived logic

- Net hours: NET passthrough; RAW = `(rawMins − break)/60`, break from band table
  unless overridden; never negative.
- Totals: `Σ netHours` of `COMPLETED` shifts → /2300; simulated subset → /600.
- Only `COMPLETED` shifts count; `COMPLETED` requires `supervisingRnName`.
- Hours by placement: group `netHours` by `placementId` (COMPLETED → counted,
  else planned), with a "No placement" bucket.
- Pace projection: shifts-to-go from the average completed-shift length; finish
  date from counted-hours-per-week over the completed date span.
- Guardrails: block shifts counting > 24 h; warn on a duplicate date + placement.

## Tests (passing)

Break-band boundaries; 12.5h→11.5h and override; NET passthrough; never-negative;
summary (completed-only, simulated-subset, 600 cap, progress clamp); hours by
placement (grouping, counted vs planned); pace projection (shifts-to-go, weekly
pace); timesheet build + CSV escaping; Dexie repository round-trip (fake-indexeddb).

## Built since slice 1

- **Edit/delete a shift** — per-row actions on the timesheet; edit reuses the form.
- **Edit/rename/delete a placement** — inline on the placements list.
- **Break-rule settings editor** — per-user band table overriding the defaults
  (`Repository.saveBreakRules` / `resetBreakRules`).
- **Start/end times** — optional per shift; auto-derive the length, handling
  overnight shifts. PoC stores them as `"HH:MM"` strings (canonical model uses
  `DateTime?`).
- **Timesheet filtering** — by placement, status and date range; CSV respects it.
- **One-click mark-worked** — flip a planned shift to counted (prompts for the RN).
- **Per-placement breakdown + export** — hours grouped per ward/team.
- **Pace projection** — shifts-to-go and an estimated finish date in the hero.
- **Display polish** — friendly dates, a simulated badge.
- **Guardrails** — block > 24 h shifts; warn on duplicate date + placement.

## Not yet built (future)

- Group the timesheet by month, or show a running total per row.
- A break-rule editor lives on the hours screen; a dedicated settings area could
  consolidate it with other preferences later.
