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
