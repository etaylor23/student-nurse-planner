# Spec — Clinical Skills Tracker  (Status: SPECCED)

Tracks development of clinical skills through supervised stages to sign-off.

## Decisions (locked)

- **Skills list source:** start with the **university skills passport** concept,
  built on over time. Because the app is **university-agnostic** (no single
  passport exists), the practical baseline is **Annexe B** (the national
  procedures list) seeded as built-in skills, with students **adding their own**
  custom items on top. (See `spec-nmc-foundations.md` for what the Annexes are —
  this was a direct question during scoping.)
- **Competence stages:** **Observed → Assisted → Performed under supervision.**
  **No "independent" stage.**
- **Sign-off capture:** all four — **who** signed off, **where**, **date**, and
  **evidence**.
- **No refresh:** once a skill is **signed off at student level it stays signed
  off** — no expiry/refresh. This is a **students-only** tool, not for qualified
  nurses (who do have revalidation/refresh needs).

## Data model

`Skill` (`userId` null = built-in Annexe B baseline; set = custom; `source`
ANNEXE_B/CUSTOM), `SkillProgress` (per user × skill: `stage`, `signedOff`,
`signOffByName`, `signOffLocation`, `signOffDate`, `evidenceNote`). Links to
proficiencies via `EvidenceLink` (type `SKILL`). See `spec-architecture.md`.

## Screens

- **Skills list** grouped by category, with a stage badge per skill.
- **Skill detail** — stage stepper (Observed → Assisted → Performed under
  supervision) and sign-off capture (name / location / date / evidence).
- **Add custom skill.**

## Build notes

- Seed from Annexe B (Part 1 + Part 2 procedures) at the adult-field level.
- `signedOff` is permanent once true — no refresh/expiry logic.
- Depends on the Annexe B seed and `EvidenceLink`.

## Integrations

- **Competency Tracker (decision recorded).** The built NMC Competency Tracker ships
  a **stub** `SKILL` evidence picker — a labelled "coming soon" tab on the proficiency
  detail. When this feature is built, wire that picker to attach real skills:
  `EvidenceType` already includes `SKILL` and `EvidenceLink` exists, so it's additive
  (list `SkillProgress` in the picker; create an
  `EvidenceLink{ evidenceType: "SKILL", evidenceId: skillProgress.id }`). The Annexe B
  seed is shared with the competency tracker's proficiency seed.

## Connections _(planned — this feature is SPECCED)_

Where this screen and others will feed into each other:

- **↔ NMC Competency Tracker.** A logged skill attaches to a proficiency via
  `EvidenceLink` (`SKILL`); the tracker ships a **stub picker** awaiting this feature.
  The two share the Annexe B / proficiency seed.
- **↔ Reflection.** A reflection can link to a skill (same `EvidenceLink`).
- **→ Activity Log.** Skill stage changes / sign-off will append `LogItem`s.
- **← NMC Foundations** _(reference)_. The Annexe B procedures are the baseline skills.

## Data reuse

- **Will reuse:** `EvidenceLink` (type `SKILL`) to attach to proficiencies — the
  same join reflections and med logs use; `User`; the shared `Entity` / `UserOwned`
  bases. Shares the Annexe B / proficiency seed with the competency tracker.

**Direction:** reuse `EvidenceLink` and the shared bases; don't duplicate the
proficiency or evidence structures. See `spec-architecture.md` → Data reuse.
