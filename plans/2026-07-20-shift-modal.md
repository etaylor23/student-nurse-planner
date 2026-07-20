# Plan — Shift editor as a full-width modal with inline capture tabs

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~1.5–2 days · Large

## Goal

Replace the squashed side-panel shift editor with a **near-full-width modal**: the core
shift fields locked at the top, and the whole capture flow (medications, skills,
reflections, competency evidence) as **inline tabs** — so a student never navigates away
from the shift they're working on. Centralise *all* shift editing here, and make the
Hours-log "log a shift" a link into it.

## Decisions (locked in grilling)

| Branch | Decision |
|---|---|
| Shell | **Near-full-width modal**, URL-driven: `/planner/:shiftId` (edit), `/planner/new` (create). Esc / backdrop / close → `/planner`. Replaces the side panel. |
| Tab content | **Embeddable, shift-scoped components** whose save stays in the modal (refresh + confirm), not navigate away |
| Tab layout | **Captured list + inline form** per tab (what's on the shift, then the form to add more) |
| Tabs | **4 capture tabs only** — Medications · Skills · Reflections · Competency evidence. History dropped from the editor (global Activity log still covers lifecycle) |
| Hours-log (idea 2) | **Centralise all editing in the modal** — remove the inline editor; "New shift" → `/planner/new`; table "edit" → `/planner/:shiftId` |
| Post-shift debrief | **Subsumed into the modal** — "Mark worked" → celebratory progress banner in the core; suggestions move into the Competency tab; drop standalone `ShiftDebrief` |

## What's already embeddable (reuse) vs needs work

- ✅ **Reflections** — `ReflectionEditor` is already prop-driven (`prefillShiftId`, `onSaved`,
  `onCancel`); `NewReflectionPage` just wraps it. Render it in the tab with an `onSaved`
  that refreshes the tab instead of navigating.
- ✅ **Competency evidence** — `ShiftEvidence` is already embeddable (used in the current
  editor). Add the `suggestProficienciesForShift` suggestions (from the retired debrief).
- 🔨 **Medications** — `MedLogPage` is page-bound (own layout, a shift *picker*, router
  state, navigates on save). **Extract an embeddable `ShiftMedLogForm`** (props: `shiftId`,
  `onLogged`) — the same form with the shift fixed (no picker) and no navigation.
- 🔨 **Skills** — sign-off is a two-page flow (list → detail). **Build a compact
  `ShiftSkillSignOff` composite** (skill picker + stage/sign-off) scoped to the shift,
  reusing `useSkillActions().signOff`.

## Architecture

- **`ShiftModal`** (new) — the shell. Reads the route (`:shiftId` / `new`), renders a
  dialog (`role="dialog"`, focus-trap, Esc/backdrop close → navigate `/planner`),
  near-full-width (`max-w-5xl`), full-screen on mobile.
  - **Locked core** (sticky top): `ShiftForm` (the existing core editor) + the header
    actions already there — **Mark worked · Make a copy · Delete**, Simulated / "I've
    worked this shift". On "Mark worked" → the celebratory progress banner.
  - **Tabs** (scroll below the sticky core): Medications · Skills · Reflections ·
    Competency evidence. Each = captured list (today's `ShiftMedications` / `ShiftSkills`
    / `ShiftReflections` list markup) + the inline embeddable form.
- **`PlannerPage`** — swap the side-panel for `<ShiftModal>`; keep it URL-driven. Clicking
  a calendar slot → navigate `/planner/new` carrying the slot's date/time (router state)
  so the core is prefilled.
- **`HoursLogPage`** — delete the inline editor block + its `ShiftDebrief`; the "Log a
  shift" panel becomes a **"New shift" link → `/planner/new`**; `TimesheetExport`'s
  `onEdit` → navigate `/planner/:id`. Page keeps summary, placements, table, export.
- **Retire `ShiftDebrief`** (both PlannerPage + HoursLogPage usages); fold its progress
  banner into the modal core and its evidence suggestions into the Competency tab.

## Save behaviour

Each tab's capture saves in place: persist → refresh that tab's list → a small
golden-moment confirmation. The modal stays open on the same shift throughout.

## Mobile

Full-screen modal; the locked core collapses to the essentials with the tabs below.

## Risks / notes

- **Med-log extract** is the biggest refactor — keep `MedLogPage` working (it still owns
  the standalone `/medications/log` route) by having it render the extracted form.
- **Skills composite** is net-new UI (picker + sign-off in one compact panel).
- Prefill from a calendar slot must flow through the `/planner/new` route (router state).
- Focus management / scroll-lock / a11y for a large modal (focus trap, restore focus,
  `aria-modal`).

## Acceptance

- Editing or creating a shift opens the full-width modal; core stays visible while you
  switch tabs; capturing a med / skill / reflection / evidence never leaves the shift.
- Hours-log has no inline editor — "New shift" and row-edit both open the modal.
- "Mark worked" shows the celebratory progress inline; no separate debrief.
- Works full-screen on mobile; Esc/backdrop/back closes to `/planner`.

## Related

- `PlannerPage.tsx`, `HoursLogPage.tsx`, `ShiftForm.tsx`, `ShiftMedications/Skills/Reflections/Evidence.tsx`,
  `ReflectionEditor.tsx`, `MedLogPage.tsx`, `SkillDetailPage.tsx` (sign-off), `ShiftDebrief.tsx` (retire),
  `logic/evidenceSuggestions.ts`
