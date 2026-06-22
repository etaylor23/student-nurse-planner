# Spec — Profile / Settings  (Status: BUILT)

The student's own programme details. A small edit-only screen over the single
`User` record. Its load-bearing job is letting the student set their **current
part** (and total parts), which the NMC competency tracker's gap surfacing reads.

## Decisions (locked)

- **Edits the existing `User` — no new entity.** Uses the existing
  `getCurrentUser` / `updateUser` repository methods. There is one local user in
  the PoC (`LOCAL_USER_ID`); per-student login is the intended future standard but
  is not built yet.
- **Editable fields:** `displayName`, `programmeType`, `currentPart`, `totalParts`,
  `startDate?`, `targetRegistrationDate?`. `field` is **adult-only** for now (the
  `NursingField` enum leaves room to extend), shown read-only.
- **Validation:** `totalParts ≥ 1` and `1 ≤ currentPart ≤ totalParts`. Save is
  blocked while invalid.
- **Route:** `/profile`, reached from its own **Account** nav section.
- **Audit:** saving appends a `PROFILE_UPDATED` `LogItem`, so profile changes show
  in the global Activity feed (dot colour added in `LogList`).

## Data model

Reuses `User` (`src/domain/types.ts`) — **no new persisted entity**. See
`spec-architecture.md` for the `User` shape (`currentPart` / `totalParts` etc.).

## Screens

- **Profile** — one form (`ProfilePage.tsx`): display name, programme type, current
  part, total parts, start date, target registration date. A side panel explains
  how the current part drives competency gap warnings, with the standing reminder
  that the PAD remains the official signed record.

## Integrations

- **→ NMC Competency Tracker (built).** Gap surfacing
  (`spec-competency-tracker.md`) reads `User.currentPart` / `totalParts`: a
  proficiency is a gap once its target part is reached (or, untagged, in the final
  part). The Gaps view links here ("Change part") and prompts here when no part is
  set meaningfully.
- **→ Activity Log (built).** `PROFILE_UPDATED` entries appear in the global feed.

## Data reuse

- **Reuses:** the single `User` entity and the existing `getCurrentUser` /
  `updateUser` methods — no new store, no schema change. Composes nothing new.

**Direction:** keep profile a thin editor over `User`; new profile fields are added
as optional fields on `User` (additive), never as a screen-local copy. See
`spec-architecture.md` → Data reuse.
