# Connected spine — ethos + user-flow reshape (2026-07-22)

Status: **PLAN — for review, not yet executing.** Produced from a deep grill on PlaceMate's
ethos and user flow (the second, deeper pass after `connected-user-flow.md` /
`2026-07-20-elite-user-flow.md`). This locks *what PlaceMate is for* and reshapes the flow
around it. Executor: Claude Opus 4.8. Nothing here ships until the owner signs off the plan.

---

## The ethos (north star)

> **PlaceMate turns the scattered work of placement into visible progress toward NMC
> registration.** You capture what you do — mostly on a shift — *once*, and it instantly
> counts: toward your 2,300 hours, your clinical-skills record, and your competency
> evidence, all pointing at the sign-offs that actually get you registered. Doing that with
> almost no friction is what *takes the weight off*. It is your personal **prep-and-memory**
> layer — **never** your official PAD, **never** clinical guidance — and it must always feel
> like **momentum, never a nag.**

Two co-primary pillars: **evidence → registration** and **clinical confidence**. The
"take the weight off" feeling is the *result* of low-friction capture, not a separate
pillar. Revision + self-care are **adjacent aids**, not the core.

## Locked decisions (from the grill)

| # | Decision |
|---|----------|
| D1 | **North star:** evidence→registration spine **+** clinical confidence, co-primary. Wellbeing is the felt result. |
| D2 | **Spine:** the shift is the default spine (**shift-first**), but every capture also works **shift-optional** (sim, lab, retrospective) with no friction. |
| D3 | **Payoff on every capture:** the instant you save, show what it fed ("+12h toward 2,300 · evidences 3.2 · added to your catheter-care record"), each tappable. |
| D4 | **Re-tier, don't cut:** nav splits into a **Spine** group and a clearly-secondary **Support** group (revision, self-care). No flat menu of equals. |
| D5 | **Capture timing:** in-the-moment where possible **+** a break-time assist **+** shift notifications: *30 min before* (practical prep + "be mindful to capture") and *30 min after* (retrospective capture). |
| D6 | **Home is the one hub:** "what do I do now?" **and** "how far to registration?" on one screen. **No** separate Registration screen. |
| D7 | **Tone:** **encouraging by default, never nagging** — momentum not deficit; gentle, capped, dismissible nudges; celebrate wins; **no** red "behind" alarms. Hard rule across all copy. |
| D8 | **Reaches registration:** track **real official PAD sign-offs** (distinct from "evidence gathered") and surface "**ready to take to your assessor**". Skills already model sign-off; proficiencies do not yet. |
| D9 | **Shift = first-class spine unit:** reachable from anywhere (Home, activity, notifications, catch-up), not just the calendar, and shows *what it counted toward*. Modal presentation stays. |
| D10 | **Clinical safety:** captured content is **"your notes, not guidance"**; medication notes carry a standing "verify against local policy / BNF / the chart" line; PlaceMate is never positioned as a clinical reference. |
| D11 | **Deferred / non-goals:** recall ("ask your notes") stays a phase-2 teaser; mentor/sharing UI is separate; **do not** cut revision/self-care; assessors/mentors are **not** users in this scope (student self-reports PAD sign-off). |

## Ground rules for the executor

Same repo discipline as `2026-07-21-beta-hardening.md`: **one step = one focused commit,
pushed to `master`, verified before the next** (every push deploys live). Local gate before
each push: `npm run typecheck && npm run lint && npm test`, plus `npm run build` for `src/`
and `npx cdk synth` (in `infra/`) for `infra/`. Format only touched files. Preserve the
invariants there (non-enumerating login, additive Dexie migrations, generated zod schemas,
UK English). **Plus one ethos rule, D7:** every user-facing string and nudge this plan adds
must be momentum-framed and non-nagging — no "you're behind", no red deficit alarms, no
guilt for un-captured shifts. Commit trailer:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Phase A — make the spine *felt* (frontend; high value, low risk)

Ship these as one connected push; each is independently verifiable.

### A1 — "This counts" payoff on every capture (D3)
The heartbeat. After any capture (mark-worked, skill sign-off/stage, med log, reflection
save, competency evidence link), surface an immediate, momentum-framed summary of what it
fed, with tappable deep-links.
- **Files:** the shift capture surfaces (`src/react/components/shift/*`, `ShiftForm.tsx`
  mark-worked path, `ShiftMedLogForm.tsx`, `ShiftSkillSignOff`/`useSkillActions.ts`,
  `reflection/ReflectionEditor.tsx`, competency evidence in `ProficiencyDetailPage`).
  Compute contributions from existing logic (`logic/hours.ts`, `logic/proficiencies.ts`,
  `logic/skills.ts`, `logic/entityLinks.ts`) — no new data.
- **Acceptance:** saving each capture type shows a brief "this counts" confirmation naming
  the real downstream effect(s) it produced (hours delta, proficiency/ies it can evidence,
  skill record, reflection link); each item deep-links to its destination; wording is
  momentum-framed (D7); nothing shown when a capture genuinely contributes nothing (no
  hollow "+0").
- **Landmine:** contributions must be *derived*, not a new stored field; don't double-count
  (a shift's hours count once, not per capture on it).

### A2 — shift as a first-class spine unit (D9)
Keep the modal, but make a shift openable from anywhere and make it carry its contribution.
- **Files:** `ShiftModal.tsx` (add a per-shift "what this counted toward" summary — hours,
  proficiencies evidenced, skills, reflections), `HomePage.tsx` + `ActivityLog.tsx` (link to
  the shift), the shift route already exists (`/planner/:shiftId/*`).
- **Acceptance:** a shift is reachable from Home, recent activity, and (later) notifications
  — not only the calendar; the shift view shows a derived contribution summary; existing
  planner/calendar flow unchanged.

### A3 — nav re-tier: Spine vs Support (D4)
- **Files:** `src/react/nav.ts` (`NAV_SECTIONS`), `AppLayout.tsx` (section rendering).
- **Acceptance:** nav shows a primary **Spine** group (shifts+hours, skills, competency,
  reflection, meds) and a visually-secondary **Support** group (revision, self-care) with a
  label that frames them as aids; `DEFAULT_ROUTE` stays `/home`; every route still reachable.

### A4 — Home = action + registration hub (D6)
One screen: forward-looking action **and** the cumulative "toward registration" narrative.
- **Files:** `HomePage.tsx` + `home/*`.
- **Acceptance:** Home shows (top) current/next shift with one-tap capture + **un-debriefed
  worked shifts** to catch up + recent activity; and (below) a momentum-framed registration
  narrative — hours %, competencies evidenced/**signed off**, skills signed off, against
  programme part + target date, with gentle trajectory (never a red "behind"). No separate
  Registration screen. Passive progress bars reframed as actions where natural ("2 gaps you
  could evidence on today's shift"). No duplicated data — one coherent hierarchy.
- **Landmine:** Home will carry a lot — ruthless visual hierarchy; the registration narrative
  must not just repeat the tiles.

### A5 — encouraging-tone copy pass (D7, cross-cutting)
Audit the strings A1–A4 (and existing nudges: `useNudges.ts`, `Nudge.tsx`) against the
momentum-not-deficit rule. **Acceptance:** no "behind"/deficit/red-alarm framing; nudges are
capped + dismissible; un-captured work is an easy offer, never guilt.

## Phase B — reach registration honestly (D8)

### B1 — official sign-off state for proficiencies + "ready to sign off"
Proficiencies today have only a self-assessed `ProficiencyStatus`
(NOT_YET_ACHIEVED/DEVELOPING/ACHIEVED). Add an explicit **officially-signed-off-in-PAD**
marker (skills already have `SkillProgress.signedOff` + who/where/when — mirror that shape),
so "toward registration" reflects *real* achievement, not just self-logged evidence.
- **Files:** `src/domain/types.ts` (additive field on `ProficiencyProgress`, e.g.
  `padSignedOff` + optional sign-off meta; regenerate zod via `npm run gen:zod`), the
  competency UI (`NmcCompetenciesPage`, `ProficiencyDetailPage`), Dexie schema (additive
  version bump via `STORE_INDEXES` — no destructive migration), sync (new field flows through
  the generic `SyncRow`).
- **Acceptance:** a student can mark a proficiency officially signed off (with optional
  by/where/when); the registration narrative distinguishes **evidence gathered** vs
  **signed off**; a "**ready to take to your assessor**" view lists proficiencies with enough
  evidence but not yet signed off. Additive, backwards-compatible with existing rows.

## Phase C — clinical-safety framing (D10)

### C1 — "your notes, not guidance"
Standardise the framing; strengthen the med-note point-of-use verify line (some
"not clinical advice" copy already exists on the med *form*).
- **Files:** `medications/*` (a standing "verify against your local policy / BNF / the actual
  chart" line where med notes are *viewed/used*, not only created), plus a light consistency
  pass so no surface implies authority.
- **Acceptance:** medication notes carry a persistent verify line at point of use; no surface
  positions PlaceMate as a clinical reference/decision tool; framing is consistent with the
  existing reflection PII / "personal study aid" language.

## Phase D — shift notifications + break-time assist (D5) — **infrastructure, separate phase**

The one big build. Reliable scheduled web push needs a service worker + push subscription +
a backend scheduler keyed to shift times. Partly specced in
[`spec/spec-notifications-backend.md`](../spec/spec-notifications-backend.md) and
[`spec/notifications.md`](../spec/notifications.md).
- **Scope:** PWA service worker + Web Push (VAPID); store push subscriptions; a backend
  scheduler that, per PLANNED shift, fires **30 min before** (practical prep: placement,
  break rules, recent notes + "be mindful to capture what you do") and **30 min after**
  (retrospective "log what you did", linking straight into the shift). A **break-time
  assist**: an in-app fast "debrief now" affordance for logging on a break.
- **Acceptance (high-level; to be detailed in its own sub-plan):** a signed-in user can opt
  in to notifications; a planned shift produces both notifications at the right times; each
  deep-links into the relevant capture; permission UX is gentle and revocable; nothing fires
  for guests or without opt-in.
- **Note:** size + risk warrant its own detailed plan before building; treat A–C as
  shippable without it.

## Explicitly out of scope (this plan)
- Recall / "ask your notes" (stays the phase-2 teaser).
- Mentor/sharing UI; assessors/mentors as users (student self-reports PAD sign-off for now).
- Cutting or hiding revision/self-care (they stay, re-tiered as Support).
- Any change to the non-enumerating auth, sync engine, or the beta-hardening work.

## Suggested sequence
**A3 → A1 → A2 → A4 → A5** (the connected-spine push), then **B1**, then **C1**, then **D**
as its own detailed sub-plan. A–C are all frontend/light-schema and independently valuable;
D is the infrastructure phase.
