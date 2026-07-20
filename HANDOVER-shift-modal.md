# HANDOVER — Shift editor → full-width modal with inline capture tabs

A fully-grilled, ready-to-build feature. This doc is self-contained; the terse
decision record is in [`plans/2026-07-20-shift-modal.md`](plans/2026-07-20-shift-modal.md).

## What you're building

Turn the planner's cramped **side-panel shift editor into a near-full-width modal**:
the core shift fields locked at the top, and the whole capture flow as **inline tabs**
(Medications · Skills · Reflections · Competency evidence) — so a student never leaves
the shift they're working on. Then **centralise all shift editing** in that modal and
replace the Hours-log's own inline editor with a link into it.

Why: the shift is the app's spine (everything captured on placement links to a shift via
`shiftId`). Making it a single, rich, stay-put surface is the payoff of the wider
"connected user flow" work (see `plans/connected-user-flow.md`).

## Locked decisions (do not relitigate)

| Branch | Decision |
|---|---|
| Shell | Near-full-width **modal**, URL-driven: `/planner/:shiftId` (edit), `/planner/new` (create). Esc / backdrop / close → `/planner`. Replaces the side panel. Full-screen on mobile. |
| Tab content | **Embeddable, shift-scoped components** whose save stays in the modal (refresh + confirm), never navigate away. |
| Tab layout | **Captured list + inline form** per tab. |
| Tabs | **4 capture tabs only** — Medications · Skills · Reflections · Competency evidence. Drop the shift History from the editor (global Activity log still covers lifecycle). |
| Hours-log | **Centralise all editing in the modal** — remove its inline editor; "New shift" → `/planner/new`; table "edit" → `/planner/:shiftId`. |
| Debrief | **Subsume `ShiftDebrief`** — "Mark worked" → celebratory progress banner in the modal core; its evidence suggestions move into the Competency tab; retire the standalone component. |

## Current code — what exists (grounding)

- **`PlannerPage.tsx`** — FullCalendar + a URL-driven side-panel editor (`/planner/:shiftId`).
  Renders `ShiftForm` + `ShiftMedications` + `ShiftSkills` + `ShiftReflections` +
  `ShiftEvidence` + `ShiftHistory`, and triggers `ShiftDebrief` on mark-worked.
- **`HoursLogPage.tsx`** — has its **own** full inline editor (same `ShiftForm` + Shift\*
  components + `ShiftDebrief`), toggled by a "New shift" button and by `TimesheetExport`'s
  `onEdit`. This whole inline editor gets removed (→ links into the modal).
- **`ShiftForm.tsx`** — the core shift fields (dates, placement, type, hours/counted,
  times, break, simulated, "I've worked this shift"). Reuse as the modal's locked core.
  Header actions (Mark worked / Make a copy / Delete) live around it in the page today.
- **`ShiftMedications/ShiftSkills/ShiftReflections.tsx`** — per-shift capture *lists* with
  a navigate-away "+ add" button. Reuse the list markup; replace the button with the
  inline form.
- **Embeddable already ✅**
  - `ReflectionEditor.tsx` — prop-driven (`prefillShiftId`, `onSaved`, `onCancel`).
    `NewReflectionPage` just wraps it. Render it in the tab with `onSaved` that refreshes
    the tab instead of navigating.
  - `ShiftEvidence.tsx` — already embeddable (used in today's editor). Add the
    `suggestProficienciesForShift` suggestions (from `logic/evidenceSuggestions.ts`,
    currently surfaced only in `ShiftDebrief`).
- **Needs extraction 🔨**
  - **Medications** — `medications/MedLogPage.tsx` is page-bound (own layout, a shift
    *picker*, router state, navigates on save). Extract a `ShiftMedLogForm` (props:
    `shiftId`, `onLogged`) — same form, shift fixed (no picker), no navigation. Keep
    `MedLogPage` working by having it render the extract.
  - **Skills** — sign-off is a two-page flow (`SkillsListPage` → `SkillDetailPage`). Build
    a compact `ShiftSkillSignOff` composite (skill picker + stage/sign-off) scoped to the
    shift, reusing `useSkillActions().signOff`.
- **`ShiftDebrief.tsx`** — retire (both PlannerPage + HoursLogPage usages).

## Suggested build sequence (commit each phase)

1. **`ShiftModal` shell** — dialog (focus-trap, Esc/backdrop → navigate `/planner`),
   near-full-width, sticky core (`ShiftForm` + the Mark worked / Copy / Delete actions),
   tab bar + panel. Wire `PlannerPage` routes: `/planner/:shiftId` (edit) and
   `/planner/new` (create) render the modal; calendar-slot click → `/planner/new` carrying
   the slot date/time via router state. Ship with the tabs still showing today's list
   components, then convert them.
2. **Reflections tab** — `ReflectionEditor` inline + the reflections list; `onSaved`
   refreshes, stays in modal.
3. **Competency evidence tab** — `ShiftEvidence` + fold in the shift's suggested
   proficiencies (from `evidenceSuggestions`).
4. **Medications tab** — extract `ShiftMedLogForm` from `MedLogPage`; list + inline form.
5. **Skills tab** — build `ShiftSkillSignOff`; list + inline sign-off.
6. **Mark-worked banner** — celebratory progress in the core; retire `ShiftDebrief`.
7. **Idea 2 (Hours-log)** — strip the inline editor + its `ShiftDebrief`; "New shift" →
   `/planner/new` link; `TimesheetExport onEdit` → `/planner/:id`.
8. **Mobile pass** — full-screen modal; core collapses, tabs below.

## Gotchas / risks

- The **med-log extract** is the biggest refactor — don't break the standalone
  `/medications/log` route.
- The **skills composite** is net-new UI.
- Prefill from a calendar slot must flow through the `/planner/new` route (router state).
- A11y for a large modal: `role="dialog"` + `aria-modal`, focus trap, restore focus on
  close, scroll-lock, Esc.
- Each tab's save must **stay in the modal** (refresh that tab's list + a small
  confirmation) — never navigate.

## How to run + verify

- Dev server: start via the Browser-pane `preview_start` with `{name:"dev"}` (config in
  `.claude/launch.json`). Sign in as guest ("Continue on this device only"); load demo
  data from **Profile → Load demo data** to get shifts/skills/reflections/evidence to test
  the tabs. Verify each phase in the browser (open a shift → modal → each tab captures
  without leaving).
- Gates: `npm run typecheck` and `npm run lint` must stay clean. `npm run format` before
  committing. (No new domain types are expected; if you add any, run `npm run gen:zod`.)

## Project conventions

- **Git:** work directly on `master`, no worktree. Commit + push straight to master when a
  phase is done and verified. End commit messages with
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **AWS:** any CLI/CDK uses `--profile personal` (account 641364901830). Never touch the
  corporate account.
- **Design system:** build on `react/components/ui.tsx` primitives (`Panel`, `PageHero`,
  `inputCls`, `btnPrimary`/`btnGhost`/`btnGhostSm`, `card`) and the Tailwind brand tokens
  (`primary`=emerald, `secondary`=NHS blue, `accent`=coral, `ink`). Respect
  `prefers-reduced-motion`.
- Push to master path-auto-deploys to the live `dev` env — so only push verified work.

## Reference

- [`plans/2026-07-20-shift-modal.md`](plans/2026-07-20-shift-modal.md) — decision record
- [`plans/connected-user-flow.md`](plans/connected-user-flow.md) — the wider flow context
