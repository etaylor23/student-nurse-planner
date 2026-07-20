# Implementation guide — elite user flow

Derived from [connected-user-flow.md](connected-user-flow.md) and
[2026-07-20-elite-user-flow.md](2026-07-20-elite-user-flow.md).

## ⚠️ Reality check (verified in code, 2026-07-20)

The plan assumed REFLECTION/SKILL evidence links were **stubs to wire**. They're not —
**the evidence triad is already wired bidirectionally.** Verified:

- **Skill → proficiency** — `SkillDetailPage.tsx`: "Link to a proficiency"
  (`ProficiencyPicker`), shows proficiencies a skill evidences (`evidenceType === "SKILL"`).
- **Reflection → proficiency** — `ReflectionDetailPage.tsx`: "Link to a proficiency",
  "Linked proficiencies" panel (`evidenceType === "REFLECTION"`).
- **Proficiency → evidence** — `ProficiencyDetailPage.tsx`: tabs for all four types,
  `addEvidence(type, id)`, suggested-attach, deep links to each source.
- **Repo** — `createEvidenceLink` / `listEvidenceLinks` / `listEvidenceLinksForUser` /
  `deleteEvidenceLink` all implemented.
- **Shift hub** — `ShiftDebrief.tsx` aggregates a shift's captures, but only at the
  post-shift moment; there's no *persistent* shift view.

**So Phase 1's substance is pervasiveness + the shift hub, NOT wiring.** Also: the comment
at `src/domain/types.ts:125-126` ("stub pickers today") is **stale — update it.**

## Phase 1 — make the existing connections pervasive (substance)

The links exist but are buried on detail pages. Surface them where the work happens.

1. **Capture-confirmation nudge** *(biggest evidence-density lever).* After saving a skill
   note or a reflection, show a one-tap "Attach as evidence for a proficiency?" using the
   existing `ProficiencyPicker` + `addEvidence`/`createEvidenceLink`. Turns a buried detail
   action into an in-flow prompt.
   - Touch: `useSkillActions.ts`, `useReflectionActions.ts`, the skill/reflection editors.
2. **List-view "this counts" badges.** On the skills list and reflections list, a small
   "evidences N proficiencies" badge per row, derived from `useProficiencies().evidenceLinks`.
   - Touch: `SkillsPage.tsx`/skills list rows, `ReflectionPage.tsx`/reflection list rows.
3. **Persistent shift view — "what this shift gave you."** Extract `ShiftDebrief`'s
   aggregation (captures where `shiftId === shift.id` across skills/med logs/reflections/
   self-care + what each counted toward) into a reusable component, and mount it on the
   shift detail (planner), not just at debrief.
   - Touch: extract from `ShiftDebrief.tsx` + `logic/evidenceSuggestions.ts`; mount in
     `PlannerPage.tsx` shift detail.
4. **Shared "link to competency / shift" control.** Consolidate the picker-based attach
   into one reusable affordance used across skill/reflection/med capture (foundation for
   Phase 2's capture consistency).

**Acceptance:** every capture surfaces its contribution *outside* its own detail page;
every shift shows what it produced; attaching evidence is one tap from the capture moment.

## Phase 2 — the show (weave it visibly)

5. **Consistent per-feature capture + guided prompts.** Audit the capture UIs (skills,
   reflection, meds) for a shared pattern; extract a `CaptureCard` and standardise the
   guided templates (Gibbs / step-lists / calc drills). *(Universal quick-capture stays
   deferred.)*
6. **Animated mindmap band (Home).** New `home/MindmapBand.tsx` — illustrative SVG/CSS
   animation (*a shift blooms → skills → competencies → hours → reflection*), reduced-motion
   static. Mount in `HomePage.tsx` in the onboarding zone (full-width between hero and
   dashboard, gated on `!user.onboardingTourDismissedAt` like the tour).
7. **Next-step nudges.** A pure `logic/nextStep.ts` that derives the natural next action
   from existing data (worked shift not yet captured → "capture it"; capture not attached →
   "tag to a competency"; new evidence → "check your gaps"), plus a small `Nudge` component
   placed on Home / feature pages. State-derived via existing hooks; subtle + dismissible.

## Data / infra

- **No schema changes** — `EvidenceLink` storage exists; the profile flags
  (`onboardingTourDismissedAt`, `aiRecallInterestAt`) are already added.
- **No new authz** — all records are self-owned.
- **Mindmap (illustrative)** = pure frontend. **Live mindmap (later)** = derive the graph
  from `evidenceLinks` + `shiftId` joins across the existing hooks.

## Suggested sequencing

1. Fix the stale `types.ts:125` comment (2 min).
2. Persistent shift view (#3) — highest "spine" value, reuses `ShiftDebrief` logic.
3. Capture-confirmation attach nudge (#1) — biggest evidence-density lever.
4. List-view "evidences N" badges (#2).
5. Mindmap band (#6).
6. Next-step nudges (#7).
7. Capture consistency / guided-prompt audit (#5).

## Testing

- **Unit** (pure logic): next-step derivation, shift-capture aggregation.
- **Browser**: capture → one-tap attach → appears on the competency + the shift view + the
  list badge; mindmap renders + degrades under reduced-motion; a nudge appears then clears
  once its action is done.
- **Metric hook**: log/derive "share of captures with ≥1 evidence link" to track the
  evidence-density success measure.

## Implementation status (2026-07-20) — complete

All guide phases were worked through and committed. Recurring finding: the connective
engine was already ~80% built, so most phases were *surfacing / uniformity*, not new plumbing.

- ✅ Evidence wiring — already present (all four types); stale comment fixed (`38623ce`).
- ✅ Persistent shift spine — already present (`ShiftEvidence` on planner + hours log).
- ✅ List-view "evidences N" badges (`523dc65`).
- ✅ Animated mindmap band (`6a7391f`).
- ✅ Uniform nudge system + Home surface (`af090e7`) + conservative supersession (`9470ee3`).
- ✅ Capture-moment "attach as evidence" nudge, unified across skill + reflection (`996b46a`).
- ✅ Capture-consistency / guided-prompt audit — result below.

### Capture-consistency / guided-prompt audit — result: already consistent + guided

No standardisation refactor needed. Findings:

- **Shared design system** across every capture surface — the reflection editor, skill
  detail, shift form, medication pages and self-care all build on the same primitives
  (`PageHero` / `Panel` / `inputCls` / `btnPrimary`).
- **Guided prompts present per feature**: reflection surfaces the Gibbs cycle's framing
  question + helper per stage (`logic/gibbs.ts` → `ReflectionEditor`); skills use the
  observed → assisted → performed stage scaffold; self-care has a 13-item catalogue;
  medication has calc-drill practice.
- The one cross-surface inconsistency — the "attach as evidence" prompt — is now unified
  via `AttachEvidenceNudge`.

Conclusion: capture is already consistent and guided; forcing a shared `CaptureCard`
refactor would be risky make-work. Deferred by design: universal quick-capture, and
upgrading the mindmap from illustrative to the user's live graph.
