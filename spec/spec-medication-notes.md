# Spec — Medication Notes  (Status: IN PROGRESS — nav enabled, scaffold page)

A study/reference tool for medications **and** a personal log of meds observed or
administered. **Explicitly a study aid — never a clinical dosing reference for
patient decisions.**

## Decisions (locked)

- **Both modes:** a **revision/reference aid** (drug classes, mechanisms, routes,
  common meds) **and** a **log** of meds the student has observed/administered.
- **Safety boundary (agreed):** this is a **study tool, not a clinical dosing
  reference**. No patient-identifiable data anywhere.
- **Structure:** **BNF-style**, but with **optional select** fields for **drug
  class**, **body system**, and **condition as observed**. Rationale: making
  these optional selects **forces the student to consider** class/system/condition
  now; and when the same drug is later added for a **different condition**, the
  student **mentally builds the link** across multiple conditions. So conditions
  are **appendable over time** on a medication.
- **Numeracy practice:** include **drug-calculation/numeracy practice as a
  flashcard when adding a new medication.**
  - **Boundary:** the calc card uses **generic/illustrative numbers** (e.g.
    "stock 250 mg in 5 ml, prescribed 400 mg — what volume?"), **not** the named
    drug's real prescribing doses. Same skill practised, no real dosing data
    attached to a drug.

## Data model

`Medication` (generic/BNF name, optional `drugClass`/`bodySystem`/`routes`,
`keyNotes`), `MedicationCondition` (appendable conditions), `MedicationLog`
(`type` OBSERVED/ADMINISTERED, no patient data), `CalcDrill` (generic numbers,
optional association to a medication). See `spec-architecture.md`.

## Screens

- **Medication list** — search; filter by class / body system / condition.
- **Medication detail** — BNF-style notes; optional class/system/conditions and
  routes; **add a condition** over time.
- **Add medication** → triggers a generic **calc drill**.
- **Calc practice mode** — flashcards by `calcType`
  (tablet / liquid / IV rate / weight-based).
- **Med log** — observed/administered entries (no patient-identifiable info).

## Build notes

- Keep the study-tool framing visible in the UI; never surface real
  drug-specific dosing.
- `CalcDrill.prompt`/`answer` are generated with illustrative numbers only.

## Connections to shifts & hours (opportunities)

Med exposure happens **during a shift, on a placement**, so the natural links are
to the placement hours log + weekly planner:

1. **Log a med from a shift (strongest).** A "log a medication" action on a
   completed shift — the planner chip and the hours-log timesheet row — opens a
   `MedicationLog` prefilled with that shift's **date + placement**. Same
   cross-link pattern as the timesheet's existing "view in planner".
2. **`MedicationLog` gains `placementId` (+ optional `shiftId`).** Today it only
   has a `date`. Adding the placement (and the specific shift) lets med exposure be
   grouped **by placement** and tied to where it happened. This is the prerequisite
   for #1, #3 and #4.
3. **Placement profile.** The hours-log "hours by placement" breakdown can show
   meds observed/administered per ward — a richer picture of each placement.
4. **Activity feed.** `MedicationLog` writes a generic `LogItem`
   (`entityType: "MEDICATION_LOG"`), so med actions appear in the existing Activity
   feed next to shift changes — the audit model is already entity-agnostic.
5. **Numeracy before a shift (lighter).** Surface a `CalcDrill` prompt on the
   planner ("practise a calc before your next shift"). Optional, weaker link.

**Recommended first step:** add `placementId`/`shiftId` to `MedicationLog`, then the
"log a med from a shift" cross-link (#1) — it reuses the planner/timesheet context
and the existing placement-breakdown machinery, and gives the log real provenance.
