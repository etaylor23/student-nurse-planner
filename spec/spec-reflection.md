# Spec — Reflection on Practice  (Status: BUILT)

Structured reflective writing using the Gibbs model, linkable to competencies and
skills.

**Built:** nested routes under `/reflection` (list with search + tag filter + lock
indicators · Gibbs editor with six guided prompts, a standing PII banner, an optional
shift link, tags and a device lock · a lockable read view). Data: `Reflection`
(with the universal `shiftId` capture join), `ReflectionSection` (one row per Gibbs
stage), `Tag` + `ReflectionTag`, all via the additive Dexie `version(3)`. Pure logic
in `logic/gibbs.ts` (guided prompts, completeness, search) + `react/reflectionLock.ts`
(a device-level PIN gate — a convenience gate, not encryption). Mutations flow through
`useReflectionActions` (activity-log at the action layer, like `useSkillActions`).

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

- **Competency Tracker (built).** The proficiency detail's `REFLECTION` evidence tab is
  now a **real picker** (was a stub): it lists the user's reflections and attaches one as
  `EvidenceLink{ evidenceType: "REFLECTION", evidenceId: reflection.id }`. Attached
  reflections render in the evidence list (clickable to `/reflection/:id`) and surface in
  the "Suggested from your activity" strip; recent reflections feed
  `evidenceSuggestions.ts`.

## Connections _(built)_

Where this screen and others feed into each other:

- **↔ NMC Competency Tracker.** A reflection attaches to a proficiency via
  `EvidenceLink` (`REFLECTION`) — the real picker on the proficiency detail, and a
  "Link to a proficiency" picker on the reflection detail (both directions, with
  unlink). Recent reflections are an `evidenceSuggestions` source.
- **← Weekly Planner / Placement Hours Log.** A shift seeds a reflection: the post-shift
  **debrief** offers "Write a reflection on it" (prefilling the shift), a
  `ShiftReflections` panel lists a shift's reflections in both shift editors, and
  reflections written about a placement's shifts (via `shiftId`) appear on the
  **placement debrief** (`placementSummary.ts`).
- **← Clinical Skills.** The skill detail offers "Reflect on this skill" (prefilling the
  editor's title + a category tag).
- **→ Activity Log.** Create / edit / delete append `LogItem`s (`REFLECTION_CREATED`
  etc.); the feed deep-links to `/reflection/:id` and filters under a "Reflections" chip.

## Data reuse

- **Will reuse:** `EvidenceLink` (type `REFLECTION`) — the shared evidence join; a
  reflection can be seeded from a `MedicationLog` / `Shift`. Compose the shared
  `Entity` / `UserOwned` / `Created` bases.

**Direction:** attach to proficiencies / skills via `EvidenceLink`, not a bespoke
table, and reference source rows by id. See `spec-architecture.md` → Data reuse.
