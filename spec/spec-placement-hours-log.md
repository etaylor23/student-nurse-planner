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

- **Hours summary** — progress bar toward 2,300; stat cards: counted, remaining,
  simulated (with headroom under the 600 cap), planned (not counted); cap
  warning when reached.
- **Placements** — quick add (name + optional setting) and a chip list.
- **Log a shift** — form: date, placement, shift type, NET-or-RAW entry with a
  live "counts as X h after a Y-min break" preview, simulated toggle,
  worked-&-complete toggle that requires the RN name, notes.
- **Timesheet** — table (newest first) with CSV export + print/PDF.

## Derived logic

- Net hours: NET passthrough; RAW = `(rawMins − break)/60`, break from band table
  unless overridden; never negative.
- Totals: `Σ netHours` of `COMPLETED` shifts → /2300; simulated subset → /600.
- Only `COMPLETED` shifts count; `COMPLETED` requires `supervisingRnName`.

## Tests (passing)

Break-band boundaries; 12.5h→11.5h and override; NET passthrough; never-negative;
summary (completed-only, simulated-subset, 600 cap, progress clamp); timesheet
build + CSV escaping; Dexie repository round-trip (fake-indexeddb).

## Not yet built (follow-ons)

- UI to **edit/delete** a shift (the repository already supports both).
- A **break-rule settings editor** (per-user override of the default band table).
- Surfacing **start/end times** in the form (model already has the fields).
