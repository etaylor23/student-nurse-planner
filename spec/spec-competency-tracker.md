# Spec — NMC Competency Tracker  (Status: SPECCED)

Tracks progress against the NMC proficiencies at the individual-statement level,
PAD-style, university-agnostic.

## Decisions (locked)

- **Granularity:** track at the level of **individual proficiency statements**
  (not just the 7 platforms). Includes Annexe A and Annexe B items.
- **Progress model:** **PAD-style** — `not yet achieved / developing / achieved`
  — with a **dated status history** so reassessment across programme parts is
  preserved (e.g. developing in year 1 → achieved in year 2).
- **Evidence linking ON:** a reflection, a logged skill, or a placement shift can
  be **attached as evidence** to a proficiency (via the polymorphic
  `EvidenceLink`).
- **Gap surfacing:** **yes** — flag proficiencies not yet evidenced/achieved,
  escalating as the student approaches the end of their current part.
- **University-agnostic handling:** ship the full national proficiency master
  list; the student sets their **current part** (and total parts) on their
  profile; an optional **target-part tag** per proficiency sharpens warnings; no
  university's part-mapping is hardcoded.

## Data model

`Proficiency` (global seed), `ProficiencyProgress` (per user × proficiency,
holds current status + optional `targetPart`), `ProficiencyStatusEvent` (status
history with `partIndex`, `assessorName`, `note`, `occurredAt`), `EvidenceLink`
(polymorphic). See `spec-architecture.md`.

## Screens

- **Platform overview** — 7 platform cards + Annexe A/B, each with % achieved.
- **Platform detail** — proficiency list with status pills + target-part tag.
- **Proficiency detail** — status + history timeline, attached evidence,
  add-evidence picker.
- **Gaps view** — not-yet-achieved / developing, filtered by current part.

## Derived logic

- Gap surfacing as in `spec-architecture.md`: `status ≠ ACHIEVED` and
  (`targetPart ≤ currentPart` if set, else at final part).
- Platform % = achieved proficiencies / total in that platform.

## Seed data

The national proficiency statements (7 platforms + Annexe A + Annexe B),
adult-field, from the official NMC document. See `spec-nmc-foundations.md`.

## Build notes

- Depends on the proficiency seed and `EvidenceLink` existing.
- `EvidenceLink` is the shared join used by reflection and skills specs too.

## Integrations

_Planned — not built (this feature is SPECCED)._

- **Medication Notes → proficiency evidence (planned).** A med log — especially an
  **administered** one — is direct evidence for Platform 4 (medicines management)
  proficiencies, and numeracy/calc accuracy speaks to drug-calculation competence.
  When `EvidenceLink` lands, extend `EvidenceType` to include **`MED_LOG`** (and
  optionally a calc-performance source) so a med log can be attached as evidence to
  a proficiency. This makes "actions logged against a shift" feed the PAD: the same
  shift-scoped med log that already shows in the Activity feed and per-placement
  profile also becomes competency evidence — designed in from the start so med logs
  are evidence-ready. (Reflections and Annexe B skills are the sibling
  `EvidenceLink` sources; a med log can seed a reflection too.)

## Data reuse

- **Will reuse:** `User`, `Shift` (placement evidence), and the planned polymorphic
  `EvidenceLink` — the **one shared evidence join**, also used by reflections, skills
  and the future `MED_LOG` source. Compose the `Entity` / `UserOwned` / `Created`
  bases for new entities; share the Annexe B / proficiency seed with the skills spec.

**Direction:** make `EvidenceLink` the single join for every evidence source rather
than per-source link tables, and reference proficiencies / skills / shifts by id. See
`spec-architecture.md` → Data reuse.
