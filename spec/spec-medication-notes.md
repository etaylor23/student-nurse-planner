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
`keyNotes`, optional **`highAlert`** study-awareness flag), `MedicationCondition`
(appendable conditions), `MedicationLog`
(`type` OBSERVED/ADMINISTERED, no patient data, optional **`shiftId`** — the shift
it was logged during), `CalcDrill` (generic numbers, optional association to a
medication). See `spec-architecture.md`.

## Screens

- **Medication list** — search; filter by class / body system / condition.
- **Medication detail** — BNF-style notes; optional class/system/conditions and
  routes; **add a condition** over time; a **Logged** panel summarising how often
  you've observed/administered this drug (with a **Log again** shortcut that opens
  the med log prefilled to it via router state — not a query string).
- **Add medication** → triggers a generic **calc drill**.
- **Calc practice mode** — flashcards by `calcType` (tablet / liquid / IV rate /
  weight-based / drops-per-minute / mg↔microgram unit conversion). Each card can
  reveal **worked steps** (`working`), not just the final answer. Two modes:
  **Practice** (free flashcard loop by type) and **Exam** (a fixed 10-question
  mixed run, scored against an 80% pass mark and timed). A **"Your numeracy"** panel
  shows lifetime accuracy per type and flags the **weakest area** to revise.
- **Med log** — observed/administered entries (no patient-identifiable info). On
  logging, the entry is **auto-linked to the shift you're currently in** (a timed
  shift whose start–end window contains "now"). If you're not in a shift you can
  **optionally pick one from the last 7 days**; if you are, that recent list is
  still offered so you can **override** the auto-link (it's only a quick helper).
  Linked entries then show in that **shift's details** (planner editor + hours-log
  panel).

## Routing (path-based — no query strings)

Nested routes under `/medications/*` (a tabbed shell), all path-based and
deep-linkable: `/medications` (list), `/medications/new`, `/medications/:id`,
`/medications/:id/edit`, `/medications/calc/:type` (`tablet` | `liquid` | `iv-rate`
| `weight`), `/medications/log/:type` (`observed` | `administered`; bare
`/medications/log` = all). The list's search + filters are **shareable in the path**
too: `/medications/filter/<key>/<value>/…` (keys `q` | `class` | `system` |
`condition`, values URL-encoded; `logic/medicationFilters.ts` parses/builds it). The
**class/body-system chips** on the list cards and the detail header are links into
that filter path — one click jumps to "all my antibiotics", etc.

## Build notes

- Keep the study-tool framing visible in the UI; never surface real
  drug-specific dosing.
- `CalcDrill.prompt`/`answer` are generated with illustrative numbers only.
- The detail page persists each drill's last attempt (`lastAttempted`/
  `lastCorrect`). The **Calc practice** tab keeps a fast in-session counter **and**
  persists accuracy to a **bounded `CalcStat` aggregate** — one row per
  `userId+calcType` (attempts/correct), not a row per attempt — which powers the
  "Your numeracy" panel + weakest-type prompt. `summariseCalcStats` (pure) derives
  the per-type accuracy and the weakest area.
- **Secondary follow-on:** retrofit the same URL-addressable-state approach to the
  placement hours log and weekly planner (see the approved plan, Phase B).

## Integrations

**Principle: actions are logged against the shift they happen in.** A shift is the
unit that ties activity across the platform together — the first instance is med
logging, and the same shift-association pattern should extend to future logged
actions (skills, reflections, evidence).

Built:

1. **Med log ↔ shift (built).** Creating a `MedicationLog` auto-links it to the
   shift you're in (timed window contains "now"); otherwise you may link one from
   the **last 7 days**, and you can override the auto-link with a recent shift.
   `MedicationLog.shiftId` stores it; the shift's editor lists its med logs and
   offers a **"Log a medication"** shortcut that opens the med log **pinned to that
   shift** (via router state) — so logging can start from either side.
2. **Placement context (via the shift).** A linked log inherits the shift's
   placement + date — no separate `placementId` needed; derive it from `shiftId`.
3. **Activity feed (built).** Med actions write generic `LogItem`s — `MED_LOGGED`
   (`entityType: "MEDICATION_LOG"`), `MEDICATION_ADDED` / `MEDICATION_DELETED`
   (`entityType: "MEDICATION"`) — so they appear in the global Activity feed next to
   shift changes. The med-log summary names the shift it happened in.
4. **Placement profile (built).** The hours-log "hours by placement" breakdown shows
   a "_N_ meds logged" count per ward, tallied through each log's linked shift
   (`medsByPlacement`, pure) — so each placement gets a profile of the meds met there.

## Data reuse

- **Reuses:** `Shift` / `Placement` (med logs link by `shiftId`; the per-placement
  profile derives via the shift), `LogItem` (med actions in the Activity feed), and
  the shared `Entity` / `UserOwned` / `Created` / `Updated` bases for all its entities
  (`Medication`, `MedicationCondition`, `MedicationLog`, `CalcDrill`, `CalcStat`).
- **Owns:** the med-specific entities above + computed shapes (`CalcStatsSummary`,
  `MedFilters`, `PlacementMedCount`) in `logic/`.

**Direction:** link every action to its shift by `shiftId` (the cross-platform
join), reuse `Medication` rather than copying drug metadata, and add the planned
competency evidence via `EvidenceLink` (type `MED_LOG`) — not a bespoke link table.
See `spec-architecture.md` → Data reuse.
