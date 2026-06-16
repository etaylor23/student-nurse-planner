# Spec — Medication Notes  (Status: SPECCED)

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
