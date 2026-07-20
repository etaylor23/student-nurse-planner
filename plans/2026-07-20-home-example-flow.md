# Plan — First-login "perfect example flow" on Home

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~1–1.5 days · Extends [`spec-home.md`](../spec/spec-home.md)

## Goal

Greet new users on the Home page with a **connected stepper** that walks them through
the ideal first journey. Each step deep-links to where the action is performed; a step
ticks when the **real action** is detected. The panel is dismissible and replayable,
and its state syncs across devices. It's a teaching centrepiece, "bedazzling" but
on-brand.

## Decisions (locked in grilling)

- **Content — breadth tour, core-capture-first + emphasised.** Lead with the everyday
  capture loop (highlighted), then round out the rest of the app.
- **Completion — action-based, DERIVED from data.** A step is "done" when qualifying
  *user-generated* data exists (computed on Home mount from the existing repository).
  No per-feature event wiring. Must distinguish **seeded baseline** (skills /
  proficiencies / subjects lists are seeded) from **real activity** (progress / log /
  session records).
- **Lifecycle — dismiss + replay, synced to profile.** Show while any step is
  incomplete; "hide" dismisses; "restart tour" from Profile replays. State lives on the
  synced `User` record.
- **Visual — connected stepper.** Numbered nodes + connector line, horizontal on
  desktop / vertical on mobile, emerald fill + check on done, coral used sparingly to
  emphasise the core-capture steps, a subtle celebratory micro-interaction on full
  completion. Reuses the `ui.tsx` step-badge / card system. Reduced-motion aware.
- **Placement:** top of Home, directly under `PageHero`, above the "Today at a glance"
  grid, while active.

## Proposed steps + done-predicates (CONFIRM the exact set/order)

Core capture (highlighted):

| # | Step | Deep-link | "Done" when |
|---|---|---|---|
| 1 | Add your first placement | `/placement-hours` (placement manager) | any `Placement` exists |
| 2 | Plan a shift | `/planner` | any `Shift` exists |
| 3 | Log your hours | `/placement-hours` | a `Shift` with countable hours / `status COMPLETED` exists |
| 4 | Track a clinical skill | `/skills` | any `SkillProgress` exists |
| 5 | Write a reflection | `/reflection` | any `Reflection` exists |

Breadth (secondary):

| # | Step | Deep-link | "Done" when |
|---|---|---|---|
| 6 | Check NMC competencies | `/competencies` | any `ProficiencyProgress` with a non-default status / status event |
| 7 | Add a medication note | `/medications` | a user-created `Medication` or `MedicationLog` exists |
| 8 | Plan revision | `/revision` | any `RevisionSession`/`RevisionTarget`/`RevisionTopic` exists |
| 9 | Look after yourself | `/self-care` | any `SelfCareCheckin` exists |

> Steps 3 vs 2 overlap (a logged shift implies a shift exists) — refine so "log hours"
> keys off `netHours > 0` / `COMPLETED`, distinct from merely creating a planned shift.

## Implementation

1. **Profile flags** — add optional fields to `User` in [`src/domain/types.ts`](../src/domain/types.ts):
   `onboardingTourDismissedAt?: string` (and optionally `onboardingTourCompletedAt?: string`).
   Run `npm run gen:zod` to regenerate `schemas.generated.ts`. These are self-owned
   fields on the user's own record → **no new AVP/Cedar authz**; they ride the existing
   `repo.updateUser` + sync path.
2. **Cheap status read** — add `repo.getOnboardingStatus(userId)` returning booleans/counts
   rather than making Home load full lists for 9 areas (perf: Home already mounts several
   hooks; don't balloon it). Back it with count/`limit 1` queries.
3. **`src/logic/onboardingFlow.ts`** — pure: given the status booleans, produce the
   ordered step list with `{ id, label, href, isCore, done }` + overall progress.
   Unit-test the predicates.
4. **`src/react/components/home/ExampleFlow.tsx`** — the stepper: renders nodes +
   connectors, `navigate()` on click, dismiss control (`repo.updateUser({ onboardingTourDismissedAt })`),
   celebratory state on all-done. Keyboard-navigable, `aria` roles, reduced-motion.
5. **`HomePage.tsx`** — mount above the grid, gated on `!user.onboardingTourDismissedAt && !allComplete`
   (show a brief celebratory state when it flips to complete).
6. **`ProfilePage.tsx`** — add a "Restart tour" control that clears `onboardingTourDismissedAt`.
7. **Deep-links** — most steps just navigate to the route; flag any where landing should
   open the create affordance directly (may need a nav-state/query flag on the target page).

## Risks & open items

- **Exact step list + predicates** — confirm which 9 (or fewer) and their order.
- **Perf on Home** — mitigated by the dedicated `getOnboardingStatus` read (step 2).
- **Established beta users** — because completion is derived, existing users see the
  stepper with several steps already ticked (a pleasant "look how far you've come")
  until they dismiss it. Acceptable; note it.
- **`spec-home.md` says "no new data"** — this adds a *read* of a `User` flag (already
  available via `useRepository().user`) + the new profile fields. Update the Home spec
  to record the extension.

## Acceptance criteria

- New user sees the stepper with all steps incomplete, core steps visually emphasised.
- Performing an action ticks its step on return to Home.
- Dismiss hides it and persists across devices; "restart tour" from Profile brings it back.
- Celebratory state on completion; responsive (horizontal↔vertical); reduced-motion honoured.
