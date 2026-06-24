# Handover — Clinical Skills Tracker (next build)

_Written 2026-06-24 for the agent who will build the Clinical Skills tracker. Read
this top to bottom, then `spec/spec-clinical-skills.md` and `spec/spec-architecture.md`
before touching code. The general project handover is `HANDOVER.md` — read its §2
(quality gate), §3 (data model), §5 (gotchas) too._

---

## 0. TL;DR

Build the **Clinical Skills tracker** (`spec-clinical-skills.md`, currently SPECCED).
It's the last of the three "evidence source" features the NMC Competency Tracker was
designed around — and **the tracker already ships a labelled `SKILL` evidence-picker
stub waiting for you to wire up** (`ProficiencyDetailPage.tsx:371`). Most of the
plumbing it needs already exists.

The single biggest thing to know: **the Annexe B baseline skills are already seeded.**
The competency tracker seeded all 219 NMC proficiencies, including the **84 Annexe B
nursing procedures** (`src/data/seed/proficiencies.ts`, rows with `annexe: "B"`, codes
`B1.1`…`B11.11`). Annexe B _is_ the national clinical-skills baseline — so you reuse
that, you don't re-seed it.

---

## 1. What exists already (built this session)

Five screens are live and the app auto-deploys to GitHub Pages on every push to
`master` (https://etaylor23.github.io/student-nurse-planner/):

- **Placement Hours Log**, **Weekly Planner**, **Medication Notes** (all earlier),
- **NMC Competency Tracker** + **Profile** (this session).

The Competency Tracker introduced the things you'll lean on:

- **`EvidenceLink`** — the polymorphic join (`proficiency ← reflection | skill | shift |
  med log`). `EvidenceType = "REFLECTION" | "SKILL" | "SHIFT" | "MED_LOG"` already
  exists (`src/domain/types.ts`), and `EVIDENCE_TYPE_LABEL.SKILL = "Clinical skill"`.
- Repository methods: `createEvidenceLink`, `listEvidenceLinks(proficiencyId)`,
  `listEvidenceLinksForUser(userId)`, `deleteEvidenceLink`.
- **The `SKILL` picker stub**: in `ProficiencyDetailPage.tsx`, the "Add evidence"
  section has four tabs (`SHIFT`, `MED_LOG`, `REFLECTION`, `SKILL`). `SHIFT`/`MED_LOG`
  are wired to real records; `REFLECTION`/`SKILL` render a "coming soon" empty state
  (line ~371). **Your job includes replacing the SKILL branch with a real picker.**
- Reusable furniture: `competencies/ProficiencyPicker.tsx` (searchable picker — pattern
  to copy/reuse), `competencies/shared.tsx` (`StatusPill`, `EvidenceBadge`,
  `ProgressBar`, `SourceCredit`), `medications/Autocomplete.tsx` (`Autocomplete` +
  `TagInput`), the multi-view shell pattern in `MedicationNotesPage.tsx` /
  `NmcCompetenciesPage.tsx`.

`nav.ts` already has `{ path: "/skills", label: "Clinical skills tracker", enabled:
false }` and `AppLayout.tsx` already has its icon — you just flip `enabled: true` and
add the route.

---

## 2. The spec — decisions locked (don't relitigate)

From `spec-clinical-skills.md`:

- **Baseline = Annexe B**, seeded as built-in skills (`source = ANNEXE_B`,
  `userId = null`); students **add their own** custom skills (`source = CUSTOM`).
- **Stages: Observed → Assisted → Performed under supervision.** No "independent" stage.
- **Sign-off captures all four:** who (`signOffByName`), where (`signOffLocation`),
  date (`signOffDate`), evidence (`evidenceNote`).
- **No refresh / no expiry:** once `signedOff` is true it **stays true** (students-only
  tool). Enforce this — no un-sign-off path.

Canonical data model (`spec-architecture.md`):

```prisma
enum SkillSource { ANNEXE_B CUSTOM }
enum SkillStage  { OBSERVED ASSISTED PERFORMED_UNDER_SUPERVISION }

model Skill {           // userId null = built-in Annexe B baseline
  id String; userId String?; name String; category String;
  source SkillSource @default(ANNEXE_B); orderIndex Int @default(0)
}
model SkillProgress {
  id String; userId String; skillId String;
  stage SkillStage @default(OBSERVED); signedOff Boolean @default(false);
  signOffByName String?; signOffLocation String?; signOffDate DateTime?;
  evidenceNote String?; updatedAt DateTime
  @@unique([userId, skillId])
}
```

---

## 3. KEY INSIGHT — reuse the seeded Annexe B, don't re-seed

`src/data/seed/proficiencies.ts` already contains the 84 Annexe B procedures
(`annexe: "B"`), each with a `code` (`B2.1` = "take, record and interpret vital
signs…"), a `statement`, and a `platformTitle` ("Annexe B Part 1: Procedures for
assessing…" / "Part 2: …"). That is exactly the clinical-skills baseline.

**Recommended approach:** seed `Skill` rows from those Annexe B proficiencies in
`DexieRepository.ensureSeed()` (the same idempotent method that seeds the user, break
rules and proficiencies — see `dexieRepository.ts`). For each Annexe B proficiency:

- `id` = stable, e.g. `"skill_" + proficiency.code` (`skill_B2.1`),
- `name` = the proficiency `statement`,
- `category` = the part, derived from `platformTitle` (Part 1 = "Assessing needs",
  Part 2 = "Planning & managing care") — or keep the full part title,
- `source = "ANNEXE_B"`, `userId = null`, `orderIndex` = the proficiency's order.

Deriving (vs a separate generated seed file) keeps it DRY and creates a **1:1 mapping
between a baseline skill and its Annexe B proficiency by code** — which unlocks the
best cross-screen connection (see §6). If you prefer a committed static seed instead,
follow the `scripts/extract-proficiencies.py` → `proficiencies.ts` precedent, but
deriving from the already-seeded data is simpler.

---

## 4. Data layer to add (all additive)

- **`src/domain/types.ts`** — add `SkillSource`, `SkillStage` string-union types +
  `SKILL_STAGE_LABEL` (and `SKILL_SOURCE_LABEL` if useful) following the
  `PROFICIENCY_STATUS_LABEL` pattern; add `Skill`, `SkillProgress` interfaces composing
  the shared bases (`Entity`/`UserOwned`/`Updated`; note `Skill.userId` is
  `string | null` like `BreakRule`, so it's not `UserOwned`); add `SkillDraft` /
  `SkillProgressDraft` via `Omit`.
- **`src/data/schema.ts`** — add to `EntityMap` + `STORE_INDEXES`:
  ```ts
  skills: "id, userId, source, category, orderIndex",
  skillProgress: "id, userId, skillId, [userId+skillId], signedOff",
  ```
- **`src/data/dexie/db.ts`** — add the two `Table<…>` accessors. **DB policy nuance
  (important):** the project's rule is "rebuild, don't migrate" (one `version()`, no
  `.upgrade` transforms, bump the DB name to force a rebuild). But there's now a **live
  site with real tester data** — so do NOT rename/wipe for a purely additive change.
  Instead add an **additive** `this.version(2).stores({ skills: "...", skillProgress:
  "..." })`. Dexie merges it with v1 with **zero data loss and no transform code** —
  which still honours "no migrations", and preserves testers' data. (Reserve the
  name-bump/rebuild for changes that must drop or reshape existing data.)
- **`src/data/repository.ts` + `dexieRepository.ts`** — additive methods, mirroring the
  existing CRUD style:
  - `listSkills(userId)` → built-ins (`userId === null`) **plus** the user's custom
    skills (same shape as `getBreakRules`, which merges defaults + user rows).
  - `listSkillProgress(userId)`, `getSkillProgress(userId, skillId)`.
  - `setSkillStage(userId, skillId, stage)` — upsert `SkillProgress` (one row per
    user+skill via the `[userId+skillId]` index).
  - `signOffSkill(userId, skillId, { signOffByName, signOffLocation, signOffDate,
    evidenceNote })` — sets `signedOff = true` (permanent; guard against unsetting).
  - `addCustomSkill(userId, { name, category })` / `deleteCustomSkill(id)` (custom
    only — never delete built-ins).
  - Extend `ensureSeed()` to seed Annexe B skills (see §3) if `skills` count is 0.
  - Keep `LogItem` creation at the hook/action layer, not the repo (house rule).

---

## 5. Screens to build

Mirror the `NmcCompetenciesPage` / `MedicationNotesPage` shell (PageHero + segmented
tab nav + nested `<Routes>`), under `/skills/*`. New files under
`src/react/components/skills/`.

- **Skills list** (`/skills`) — grouped by `category`, each row a **stage badge**
  (Observed/Assisted/Performed) + a "Signed off" marker. Reuse the `StatusPill` styling
  idea (make a small `SkillStageBadge`). Consider a search/filter like the competency
  overview (the pattern + `matchesQuery` helper exist).
- **Skill detail** (`/skills/:id`) — a **stage stepper** (Observed → Assisted →
  Performed under supervision) and a **sign-off form** (name / location / date /
  evidence). Once signed off, show it as locked/permanent. Add a **"Link to a
  proficiency"** action here (reuse `ProficiencyPicker`) for the two-way evidence
  pattern (see §6).
- **Add custom skill** (`/skills/new`) — name + category (a `TagInput`/`Autocomplete`
  over existing categories is a nice touch).

Routing: add `<Route path="/skills/*" element={<SkillsPage />} />` in `App.tsx`; flip
`/skills` to `enabled: true` in `nav.ts`. Add a `useSkills()` / `useSkill(id)` hook in
`hooks.ts` following `useProficiencies`/`useProficiency`.

---

## 6. Connections & integration points (review requested)

This is the part to get right — each is a place two screens feed each other. Built
unless noted.

### 6a. ↔ NMC Competency Tracker (primary — and already half-wired)

1. **Wire the SKILL evidence picker (required).** In
   `competencies/ProficiencyDetailPage.tsx`, replace the `evTab === "SKILL"` stub
   (~line 371) with a real picker listing the user's skills, creating
   `EvidenceLink{ evidenceType: "SKILL", evidenceId: <skill id> }` + a
   `EVIDENCE_LINKED` `LogItem`. Also add a `SKILL` case to **`evidenceLabel()`** (resolve
   the skill name) and **`evidenceHref()`** (link to `/skills/:id`) in that file — they
   currently handle only SHIFT/MED_LOG. Evidence-count badges + the activity feed pick
   these up automatically (they're type-agnostic).
   - **Decision to make — what `evidenceId` points at.** The architecture comment says
     `SkillProgress.id`; but a baseline skill always has a `Skill` row and may have no
     `SkillProgress` yet. **Recommendation: use `Skill.id`** (always exists, simpler to
     resolve name/href) and update the architecture comment to match. Whichever you
     pick, keep it consistent and document it.
2. **Shared seed / 1:1 mapping.** Baseline skills derive from Annexe B proficiencies
   (§3), so `skill_B2.1` ↔ proficiency `B2.1`. Exploit it:
   - On the **skill detail**, show "Counts toward proficiency B2.1" linking to
     `/competencies/proficiency/prof_B2.1`.
   - **Strong opportunity:** when a skill is **signed off**, offer to auto-create the
     `EvidenceLink` to its matching Annexe B proficiency (so sign-off feeds the PAD with
     one click). This is the kind of cross-screen integration the tracker was built for.
3. **Reverse view.** The proficiency detail will then show skill-sourced evidence in its
   list (with the `SKILL` label + link), exactly like shifts/med logs do today.

### 6b. → Activity Log

Append `LogItem`s for stage changes and sign-off (`entityType: "SKILL"`, e.g. actions
`SKILL_STAGE_CHANGED`, `SKILL_SIGNED_OFF`) at the hook layer. Add dot colours for them
in `LogList.tsx` (additive map entries — that's all the feed needs). Follow exactly how
`PROFICIENCY_STATUS_CHANGED` / `EVIDENCE_LINKED` were added.

### 6c. ← NMC Foundations (reference)

Annexe B is the national baseline (already captured in the seed). No code dependency —
just provenance.

### 6d. ↔ Reflection (planned — not built; don't block on it)

`spec-reflection.md` says a reflection can link to a clinical skill. Reflection isn't
built, and its `REFLECTION` evidence picker is also a stub in the tracker. Leave a clean
seam: don't hard-couple skills to reflections now; the future link is reflection →
proficiency/skill via the evidence join. Just note it.

### 6e. ↔ Shifts / Placement (optional enhancement, not in spec)

A skill is usually performed during a shift. The spec's `SkillProgress.signOffLocation`
is free text; you _could_ add an optional `shiftId` so a sign-off references the shift
it happened in (the established "actions are logged against a shift" pattern —
`MedicationLog.shiftId`). Out of scope for v1, but a natural follow-on; flag it, don't
build it unless asked.

---

## 7. Conventions & gotchas (from this session)

- **Git workflow (firm preference): work directly on `master`, no worktree; commit in
  focused commits and `git push origin master`.** Each push auto-deploys to GitHub
  Pages. End commit messages with the `Co-Authored-By: Claude Opus 4.8` trailer.
- **Quality gate before every commit** (`HANDOVER.md §2`): `npm run typecheck` clean ·
  `npm run lint` **0 errors** (3 long-standing accepted `react-refresh` warnings) ·
  `npm test` pass · `npm run build` OK · `npx prettier --write` the changed files.
- **Tests:** unit (Vitest, `tests/`) for pure logic + repo round-trip with
  `fake-indexeddb`. Add: skill grouping/permanence logic tests + a repo round-trip over
  `skills`/`skillProgress` (seed loads, stage upsert, sign-off permanence, custom add).
  Mirror `tests/proficiencies.test.ts` and `tests/competencyRepository.test.ts`.
- **Preview MCP verification caveats:** `innerText` upper-cases CSS-`uppercase` text (so
  string-match assertions get false negatives — match case-insensitively); the preview
  uses a **per-port IndexedDB** (fresh DB per run — seed fixtures via an IndexedDB write
  in `preview_eval` if you need data, as done this session); screenshots occasionally
  come back blank — `window.scrollTo(0,0)` + blur the active element, then retry.
- **`import.meta.env.BASE_URL`** is the router basename (Pages sub-path). Routes must be
  declared without the base prefix (react-router handles it) — just use `/skills/...`.
- **Bundle size:** the build already warns about the FullCalendar chunk; the BNF data
  added ~weight too. Harmless for a PoC; don't chase it.

---

## 8. Specs & docs to update _in the same commits_ (house rule)

- `spec-clinical-skills.md` — SPECCED → BUILT; fill Integrations + Connections as built;
  note the `evidenceId` decision and the Annexe-B-reuse approach.
- `spec-competency-tracker.md` — the SKILL evidence picker is now real (was a stub);
  update its Screens/Integrations/Connections.
- `spec-architecture.md` — mark Clinical Skills built in Build order; reconcile the
  `EvidenceLink.evidenceId` comment with your decision.
- `spec-activity-log.md` — add the new `SKILL_*` actions to its table + Connections.
- `spec-reflection.md` — (light) note skills now exist as a link target for when it's
  built.
- `HANDOVER.md` (§4 built list, §8 key files) + `README.md` (feature table + spec
  index): move Clinical Skills to **Built**.
- Every spec carries a `## Connections` section now — keep them accurate.

---

## 9. Suggested build order

1. Types + schema + db (additive `version(2)`) + repository methods + `ensureSeed`
   Annexe B seed. Repo round-trip tests. Quality gate. Commit.
2. `useSkills`/`useSkill` hooks + the three screens (list, detail w/ stepper + sign-off,
   add custom) + nav/route/icon enablement. Commit.
3. Wire the SKILL evidence picker in the competency tracker (+ `evidenceLabel`/
   `evidenceHref` SKILL cases) and the skill↔proficiency mapping (skill detail link;
   optional auto-evidence on sign-off). Activity-feed dot colours. Commit.
4. Spec/doc sync. Quality gate. Commit + push (auto-deploys).
5. Verify via preview MCP: seed loads (84 Annexe B skills grouped by category); set a
   stage; sign off (and confirm it's permanent); attach a skill as evidence on a
   proficiency and see it listed + badge-counted + linked; confirm the activity feed +
   live deploy.

---

## 10. Key files (orientation map)

| Concern | File |
| --- | --- |
| Domain types + bases | `src/domain/types.ts` (add Skill/SkillProgress + enums) |
| Store↔type↔index registry | `src/data/schema.ts` |
| Dexie binding (add `version(2)`) | `src/data/dexie/db.ts` |
| Repository + seed | `src/data/repository.ts`, `src/data/dexie/dexieRepository.ts` |
| Annexe B source data (reuse) | `src/data/seed/proficiencies.ts` (`annexe: "B"`) |
| Evidence picker stub to wire | `src/react/components/competencies/ProficiencyDetailPage.tsx` |
| Reusable picker / badges | `src/react/components/competencies/ProficiencyPicker.tsx`, `competencies/shared.tsx` |
| Multi-view shell pattern | `src/react/components/NmcCompetenciesPage.tsx`, `MedicationNotesPage.tsx` |
| Hooks pattern | `src/react/hooks.ts` (`useProficiencies`/`useProficiency`) |
| Activity dot colours | `src/react/components/LogList.tsx` |
| Nav + icon (flip enabled) | `src/react/nav.ts`, `src/react/components/AppLayout.tsx` |
| Spec | `spec/spec-clinical-skills.md` (+ `spec-architecture.md`) |

Good luck — the seam is clean: a real `EvidenceLink`, a waiting stub, and the Annexe B
data already on disk. The win is making sign-off feed the PAD.
