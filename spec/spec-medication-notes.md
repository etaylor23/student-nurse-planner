# Spec — Medication Notes  (Status: BUILT)

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
(`type` OBSERVED/ADMINISTERED, no patient data, optional **`shiftId`** — the shift
it was logged during), `CalcDrill` (generic numbers, optional association to a
medication). See `spec-architecture.md`.

## Screens

- **Medication list** — search; filter by class / body system / condition.
- **Medication detail** — BNF-style notes; optional class/system/conditions and
  routes; **add a condition** over time.
- **Add medication** → triggers a generic **calc drill**.
- **Calc practice mode** — flashcards by `calcType`
  (tablet / liquid / IV rate / weight-based).
- **Med log** — observed/administered entries (no patient-identifiable info). On
  logging, the entry is **auto-linked to the shift you're currently in** (a timed
  shift whose start–end window contains "now"). If you're not in a shift you can
  **optionally pick one from the last 7 days**; if you are, that recent list is
  still offered so you can **override** the auto-link (it's only a quick helper).
  Linked entries then show in that **shift's details** (planner editor + hours-log
  panel).

## Routing (URL-addressable)

Nested routes under `/medications/*` (a tabbed shell), so most views/states are
deep-linkable: `/medications?q&class&system&condition` (list + filters),
`/medications/new`, `/medications/:id`, `/medications/:id/edit`,
`/medications/calc?type=`, `/medications/log?type=`. Filters/selection live in the
URL (`useSearchParams`), so they survive refresh and back/forward.

## Build notes

- Keep the study-tool framing visible in the UI; never surface real
  drug-specific dosing.
- `CalcDrill.prompt`/`answer` are generated with illustrative numbers only.
- The detail page persists each drill's last attempt (`lastAttempted`/
  `lastCorrect`); the **Calc practice** tab is a fast session loop (accuracy held
  in memory, no per-attempt rows).
- **Secondary follow-on:** retrofit the same URL-addressable-state approach to the
  placement hours log and weekly planner (see the approved plan, Phase B).

## Connections to shifts & hours

**Principle: actions are logged against the shift they happen in.** A shift is the
unit that ties activity across the platform together — the first instance is med
logging, and the same shift-association pattern should extend to future logged
actions (skills, reflections, evidence).

Built:

1. **Med log ↔ shift (built).** Creating a `MedicationLog` auto-links it to the
   shift you're in (timed window contains "now"); otherwise you may link one from
   the **last 7 days**, and you can override the auto-link with a recent shift.
   `MedicationLog.shiftId` stores it; the shift's editor lists its med logs.
2. **Placement context (via the shift).** A linked log inherits the shift's
   placement + date — no separate `placementId` needed; derive it from `shiftId`.

Still open (future):

3. **Placement profile.** The hours-log "hours by placement" breakdown could show
   meds observed/administered per ward.
4. **Activity feed.** `MedicationLog` could write a generic `LogItem`
   (`entityType: "MEDICATION_LOG"`) so med actions appear in the Activity feed next
   to shift changes — the audit model is already entity-agnostic.
