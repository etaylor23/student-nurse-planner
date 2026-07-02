# Spec — Clinical Skills Tracker  (Status: BUILT)

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

## Screens (built)

Path-based, nested under `/skills/*` (shell `SkillsPage`, components in
`react/components/skills/*`):

- **Skills list** (`/skills`, `SkillsListPage`) — searchable + stage/sign-off
  filtered, grouped by category. Each row a stage badge (or a solid "Signed off"
  marker) + a "Custom" tag on the student's own skills.
- **Skill detail** (`/skills/:id`, `SkillDetailPage`) — a clickable stage stepper
  (Observed → Assisted → Performed under supervision) and a sign-off form
  (name / location / date / evidence). Once signed off the stepper is **locked** and
  the sign-off shows as a permanent, captured record. **Proficiency evidence** block
  (all skills): an Annexe B skill notes its 1:1 mapping ("Maps 1:1 to B2.1"); every
  skill lists the proficiencies it currently evidences ("Evidences 4.6, B2.2 →") and
  offers **Link to a proficiency** (opens the shared `ProficiencyPicker`, excluding
  ones already linked). Custom skills can be deleted here.
- **Add custom skill** (`/skills/new`, `SkillFormPage`) — name + category (an
  `Autocomplete` over existing categories).

## Build notes (built)

- **Baseline derived from the Annexe B proficiency seed, not re-seeded.** Built-in
  skills (`source = ANNEXE_B`, `userId = null`) are derived in `data/seed/skills.ts`
  from `seedProficiencies` rows with `annexe: "B"`, mapped `id = "skill_" + code`,
  `name = statement`, `category` = the short part name ("Assessing needs" /
  "Planning & managing care"). `ensureSeed()` bulk-puts them when the `skills` store
  is empty. This keeps a **1:1 mapping** (`skill_B2.1` ↔ `prof_B2.1`) the connections
  rely on (`annexeProficiencyIdOf`).
- `signedOff` is permanent once true — `signOffSkill` only ever sets it true; there
  is no un-sign-off path. Changing the stage afterwards preserves the sign-off.
- Additive data layer: `Skill` + `SkillProgress` types, `skills` / `skillProgress`
  stores added via an **additive Dexie `version(2)`** (no rebuild — preserves live
  tester data), repository methods, `useSkills`/`useSkill` hooks, and `useSkillActions`
  (the single mutation point that appends `LogItem`s). Mutations are logged at the
  action layer, never in the repository.

## Integrations (built)

- **Competency Tracker — `SKILL` evidence picker wired.** The proficiency detail's
  `SKILL` tab is now a real, searchable picker over the user's skills; attaching one
  creates `EvidenceLink{ evidenceType: "SKILL", evidenceId: skill.id }` + an
  `EVIDENCE_LINKED` `LogItem`. **`evidenceId` decision: it points at `Skill.id`** (not
  `SkillProgress.id`) — a baseline skill always has a `Skill` row but may have no
  progress yet, and the name/href resolve straight from it. The proficiency detail's
  `evidenceLabel()` / `evidenceHref()` resolve `SKILL` to the skill name and
  `/skills/:id`; evidence-count badges + the activity feed pick it up automatically.
- **Auto-evidence on sign-off.** Because baseline skills map 1:1 to an Annexe B
  proficiency by code, signing off a baseline skill offers (checkbox, on by default)
  to create the matching `SKILL` evidence link in one step — so sign-off feeds the PAD.
  Hidden when the skill is already linked. **Custom skills** get the parallel affordance:
  their sign-off form offers "Also attach as evidence for a proficiency…", opening the
  picker to choose any proficiency, attached on sign-off.
- **Custom skills join the evidence economy.** Custom skills are no longer excluded
  from the spine — the detail page's **Link to a proficiency** action (and the sign-off
  picker above) let a custom skill attach to any proficiency as `SKILL` evidence, via
  `useSkillActions.linkSkillToProficiency` (the link + `EVIDENCE_LINKED` `LogItem` live
  at the action layer). The link shows on the proficiency detail + activity feed like
  any other.
- **Activity Log.** `useSkillActions` appends `SKILL_STAGE_CHANGED`, `SKILL_SIGNED_OFF`,
  `SKILL_ADDED`, `SKILL_DELETED` (`entityType: "SKILL"`); dot colours added in `LogList`.

## Connections (built)

Where this screen and others feed into each other:

- **↔ NMC Competency Tracker.** A skill attaches to a proficiency via `EvidenceLink`
  (`SKILL`) — the real picker on the proficiency detail, and the auto-link on sign-off.
  The skill detail links back to its proficiency ("Counts toward B2.1"), and once the
  sign-off evidence link exists shows "This skill now counts as evidence for B2.1 →
  view proficiency"; the proficiency's evidence row deep-links to `/skills/:id`. The
  1:1 mapping is surfaced on both sides: the **skills list** prefixes each Annexe B row
  with its B-code; the **platform detail** (Annexe B) shows each proficiency's paired
  skill stage/sign-off badge linking through to the skill; the **gaps page** offers
  "Practise the skill →" on Annexe B gaps. The two share the Annexe B / proficiency
  seed (derived, 1:1 by code).
- **→ Activity Log.** Stage changes, sign-off and custom add/delete append `LogItem`s
  that render in the global feed.
- **↔ Reflection** _(planned)_. A reflection will link to a skill via the same
  `EvidenceLink` once Reflection is built; nothing here hard-couples to it.
- **↔ Shifts / Placement** _(optional, not built)_. `signOffLocation` is free text; a
  future enhancement could add an optional `shiftId` so a sign-off references the shift
  it happened in (the `MedicationLog.shiftId` pattern).
- **← NMC Foundations** _(reference)_. The Annexe B procedures are the baseline skills.

## Data reuse

- **Will reuse:** `EvidenceLink` (type `SKILL`) to attach to proficiencies — the
  same join reflections and med logs use; `User`; the shared `Entity` / `UserOwned`
  bases. Shares the Annexe B / proficiency seed with the competency tracker.

**Direction:** reuse `EvidenceLink` and the shared bases; don't duplicate the
proficiency or evidence structures. See `spec-architecture.md` → Data reuse.
