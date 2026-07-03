# Spec — Home / Today (Status: BUILT)

The hub landing page (U2). Not a new feature so much as **connective tissue**: it
mounts the existing hooks and components on one screen so cross-surfacing is
structural, and gives the app a natural **phone entry point**. `/` redirects here.

## Decisions (locked)

- **No new data.** Home reads only existing hooks (`useShifts`, `useSkills`,
  `useProficiencies` via `TopGaps`, `ActivityLog`); it owns no store or type.
- **First nav item.** Added as the first (ungrouped) nav section, so `DEFAULT_ROUTE`
  (the first enabled item) is `/home` and `/` + unknown paths land here.
- **Duplication of mounts is fine.** `TopGaps` and `ActivityLog` also appear on the
  Hours Log; they're the same components reading the same hooks. The Hours Log is
  unchanged.

## Screens

- **Home** (`/home`, `HomePage.tsx`) — a hero greeting + hours count, then:
  - **On shift now / next shift strip** — `findCurrentShift` (the timed shift
    containing now) else `nextShift` (soonest upcoming PLANNED shift), both in
    `logic/shiftContext.ts`. On shift: quick actions **Log a medication** / **Update
    a skill** (pinned to the shift via `prefillShiftId`) / **Open in planner**. Else:
    open the next shift, or a prompt to plan one.
  - **Hours pace tile** — counted / target, % and bar, ≈ shifts-to-go (from
    `useShifts` summary/projection). Links to the hours log.
  - **Skills in progress tile** — in-progress count + the 2–3 most-recently-updated
    `SkillProgress` rows, each linking to its skill. Links to the tracker.
  - **Top gaps** — the shared `TopGaps` component.
  - **Recent activity** — the shared `ActivityLog` (clickable + filterable, U6).

## Connections

Home is a **read-only hub**: every tile deep-links into its screen, and its quick
actions carry `prefillShiftId` into the med log / skills tracker (the universal shift
join). Nothing links *to* Home except the nav + `/` redirect.

## Data reuse

- **Is entirely reuse.** No new entity, store, type or logic beyond the small pure
  `nextShift` helper added to `logic/shiftContext.ts` (unit-tested). See
  `spec-architecture.md` → Data reuse.
