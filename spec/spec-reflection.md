# Spec — Reflection on Practice  (Status: SPECCED)

Structured reflective writing using the Gibbs model, linkable to competencies and
skills.

## Decisions (locked)

- **Model:** **Gibbs** reflective cycle (six stages: Description, Feelings,
  Evaluation, Analysis, Conclusion, Action Plan).
- **Guided prompts** per section (not a blank canvas).
- **Linking:** **yes** — link a reflection to a platform/proficiency **and/or** a
  clinical skill (via `EvidenceLink`, type `REFLECTION`).
- **Privacy:** **device storage for the PoC**, **lockable** (PIN/biometric), and
  a **PII warning** (don't include patient-identifiable information). Per the
  architecture decision, every student will eventually have their own **login**;
  auth isn't being built yet, but the data model is set up to move to a remote DB
  later (private-per-user, encrypted at rest).
- **Tagging + search:** **yes** — so reflections can be pulled later for
  revalidation, essays, or interviews.

## Data model

`Reflection` (`model = GIBBS`, `isLocked`, `piiAcknowledged`, `occurredOn`),
`ReflectionSection` (one row per Gibbs stage), `Tag` + `ReflectionTag` (m:n),
plus `EvidenceLink` for proficiency/skill links. See `spec-architecture.md`.

## Screens

- **Reflection list** — search + tag filter, lock indicators.
- **New/edit reflection** — six Gibbs sections with guided prompts, a standing
  **PII warning** banner, link-to-proficiency/skill pickers, tags, lock toggle.
- **Reflection read view** — lockable.

## Build notes

- The `ReflectionModel` enum exists so Driscoll/Borton/Kolb can be added later;
  v1 is Gibbs-only with `ReflectionSection` keyed by `GibbsStage`.
- Lock is a device-level gate in the PoC; with future auth it becomes a real
  per-user privacy control.
- Depends on `EvidenceLink`.

## Integrations

- **Competency Tracker (decision recorded).** The built NMC Competency Tracker ships
  a **stub** `REFLECTION` evidence picker — a labelled "coming soon" tab on the
  proficiency detail. When this feature is built, wire that picker to attach real
  reflections: `EvidenceType` already includes `REFLECTION` and `EvidenceLink` exists,
  so it's an additive change (list reflections in the picker; create an
  `EvidenceLink{ evidenceType: "REFLECTION", evidenceId: reflection.id }`).

## Connections _(planned — this feature is SPECCED)_

Where this screen and others will feed into each other:

- **↔ NMC Competency Tracker.** A reflection attaches to a proficiency via
  `EvidenceLink` (`REFLECTION`); the tracker already ships a **stub picker** awaiting
  this feature.
- **↔ Clinical Skills** _(now a live link target)_. A reflection can link to a skill
  via the same `EvidenceLink`. Clinical Skills is **built** (skills carry stable ids —
  `Skill.id` — that a reflection link would reference, mirroring how the tracker's
  `SKILL` evidence already points at `Skill.id`).
- **← Medication Notes / Weekly Planner.** A med log or a shift can seed a reflection
  (reflect on something that happened in a shift).
- **→ Activity Log.** Reflection create / edit will append `LogItem`s.

## Data reuse

- **Will reuse:** `EvidenceLink` (type `REFLECTION`) — the shared evidence join; a
  reflection can be seeded from a `MedicationLog` / `Shift`. Compose the shared
  `Entity` / `UserOwned` / `Created` bases.

**Direction:** attach to proficiencies / skills via `EvidenceLink`, not a bespoke
table, and reference source rows by id. See `spec-architecture.md` → Data reuse.
