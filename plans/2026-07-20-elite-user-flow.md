# Plan — Make the user flow elite (connected, note-first, signposted)

**Status:** Planned (grilled 2026-07-20) · Builds on
[connected-user-flow.md](connected-user-flow.md)

## North star

Turn the scattered, on-paper, out-of-order reality of placement into **one connected,
signposted journey**: capturing a note anywhere is easy, consistent and guided, and
**every note visibly counts toward NMC registration**. Build on the connective plumbing
that already exists — make it *felt everywhere*, don't reinvent it.

## Decisions (locked in grilling)

| Branch | Decision |
|---|---|
| Elite lens | Blend: **amplify capture (note-taking)** + **signpost so scattered actions weave into one mindmap** — leveraging existing plumbing |
| Capture model | **Consistent per-feature capture + richer guided prompts.** Universal quick-capture **deferred** |
| Signposts | **All three:** inline contextual · animated mindmap · dynamic next-step nudges |
| Inline scope | **Surface the (already-wired) evidence triad pervasively**, bidirectional |
| Mindmap data | **Illustrative concept first, live later** |
| Mindmap placement | **Onboarding band** — full-width between hero and dashboard, shown with the getting-started tour |
| Journey signposts | **Dynamic next-step nudges** (not a static ribbon) |
| Phasing | **Substance first, then show** |
| Success | **Comprehension + evidence density (behavioural) + connective completeness (coverage)** |

## What already exists (reuse, don't rebuild)

- **`shiftId` — "the universal capture join"**: skills sign-offs, med logs, reflections,
  self-care check-ins all optionally reference a shift.
- **`ShiftDebrief` (U1)**: fires when a shift is marked worked — live progress line,
  one-tap capture prompts, and `suggestProficienciesForShift` (which proficiencies this
  shift could evidence).
- **`EvidenceLink`** (polymorphic proficiency ← reflection | skill | shift | med log):
  **all four types are wired** — `SkillDetailPage` / `ReflectionDetailPage` /
  `ProficiencyDetailPage`. *(The `types.ts:125` "stub pickers today" comment is stale.)*
- **`TopGaps`**, **`ActivityLog`**, **`logic/evidenceSuggestions.ts`**.

## Phase 1 — Substance: the "every note counts" engine

1. **Make the (already-wired) links pervasive.** The evidence triad is wired on the detail
   pages; the gap is discoverability. Add a capture-moment "attach as evidence?" nudge and
   list-view "evidences N" badges (reuse `ProficiencyPicker` + `createEvidenceLink`).
   Self-owned → **no new authz**, no schema change.
2. **Bidirectional inline signposts:**
   - On a capture (skill / reflection / med log): *"Evidences proficiency Y · on shift Z"* with links.
   - On a competency: *"Evidenced by N items across M shifts"* → list, each linking to source.
   - On a shift: *"What this shift gave you"* — all captures + what they counted toward
     (promote `ShiftDebrief`'s model into a persistent shift view, not just the debrief moment).
3. **Consistent link affordance** — one shared "link to a competency / shift" control reused
   across features (foundation for Phase 2's capture consistency).

**Phase-1 acceptance:** every capture type can evidence a competency; every competency
traces to its evidence + source shifts; every capture shows its contributions.

## Phase 2 — The show: weave it visibly

4. **Consistent per-feature capture + richer guided prompts** — a shared capture
   pattern/component so clinical skills, reflection and medications feel like one system;
   standardise the guided templates (Gibbs, step-lists, calc drills). *(Universal
   quick-capture stays deferred.)*
5. **Animated mindmap band (Home)** — an illustrative concept animation (*a shift blooms
   into skills → competencies → hours → reflection*), full-width between the hero and the
   dashboard, shown **while the getting-started tour is active** (hides with it),
   on-brand + reduced-motion aware. Later: upgrade to the user's **live** graph.
6. **Dynamic next-step nudges** — context-aware "here's the natural next move" prompts
   that advance the flow (worked a shift → capture; captured → tag to a competency;
   evidence added → check your gaps). State-derived from existing hooks; placed where relevant.

## Success (definition of done)

- **Comprehension:** a student can articulate *"when I log X, it also does Y and Z."*
- **Evidence density (behavioural):** the share of captures linked to a competency climbs;
  reflections/skills actually evidence proficiencies (wiring exists; move the needle on real usage).
- **Connective completeness (coverage):** every capture type can evidence competencies ·
  every record shows its connections both ways · every relevant screen has a next-step ·
  the mindmap ships (illustrative in Phase 2, live later).

## Risks & guardrails

- **Over-signposting / UI clutter** — keep signposts subtle, contextual, and dismissible;
  the point is clarity, not noise.
- **Home density** — the mindmap lives only in the onboarding zone (with the tour) to
  protect the daily Home; it doesn't pile onto the hero + dashboard for returning users.
- **Evidence-link UX** — the pickers must be genuinely low-friction, or the density
  metric won't move; this is the make-or-break of Phase 1.
- **No schema/backend change expected** — evidence-link surfacing rides existing storage.

## Related

- [connected-user-flow.md](connected-user-flow.md) — the investigation behind this
- `src/react/components/ShiftDebrief.tsx`, `src/logic/evidenceSuggestions.ts`,
  `EvidenceLink` in `src/domain/types.ts`
- `spec/spec-home.md`, `spec/spec-competency-tracker.md`,
  `spec/spec-clinical-skills.md`, `spec/spec-reflection.md`
