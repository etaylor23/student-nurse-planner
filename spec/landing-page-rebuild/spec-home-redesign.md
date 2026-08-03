# Spec — Home / Today redesign (Status: BUILT)

Revision of `spec-home.md`. Goal: one self-explanatory flow — a returning-student
spine that still teaches the first-timer. Keep (nearly) all existing content;
fix hierarchy, prominence and headings. No new data stores; one new page (audit log).

## Decisions (from design review, 3 Aug 2026)

1. **Audience:** returning student is the spine; first-run mechanisms (tour,
   mindmap, nudges) are kept but consolidated into one place.
2. **Hero anchor = next action.** The #1 element answers "what should I do next":
   on-shift-now / next shift / plan-a-shift. Hours pace leaves the hero.
3. **AI recall teaser: removed entirely.** No relocation of "Past chats". The
   global header's "Ask your notes anything" gets a noticeability lift instead
   (emerald tint/ring + NEW affordance on the header search).
4. **One progress story.** "Toward registration" is the single progress section,
   promoted to sit directly under the hero. Practice hours appears once on the
   page (here, not in the hero). The "N competencies ready to take to your
   assessor" pill rides with it as the section CTA.
5. **Merged how-it-works band.** Mindmap (visual centrepiece) + "Your first
   steps" checklist become one section with one heading — capture once → feeds
   everything → try it. The two never appear as separate sibling panels again.
6. **Nudges: one visible, rest collapsed.** Top-priority nudge as a slim strip;
   a "X more" affordance beneath it expands the queue (collapsed by default).
   Nudges duplicating an incomplete tour step are suppressed into the collapsed
   set while the tour is showing.
7. **Four chapters, uniform eyebrow + title voice:**
   - TODAY / Hi, {name}
   - YOUR PROGRESS / You're in part {n} of {m}
   - HOW PLACEMATE WORKS / Capture once — feed everything
   - YOUR RECORD / Activity
8. **Band lifecycle (reversible).** Tour incomplete → full band (mindmap +
   checklist, Hide available). Complete or hidden → band collapses to a compact
   mindmap-only strip with a "Show first steps" link. The mindmap never fully
   disappears.
9. **Activity: digest.** ~6 most recent entries, no filter tabs, "Asked your
   notes" events excluded. "See full audit log" links to a NEW dedicated audit
   log page carrying the full filterable log (tabs move there).
10. **Skills panel honesty fix.** "Skills in progress" shows genuinely
    in-progress items; when none, falls back to recently signed-off with the
    label saying so.
11. **Next-shift card states.** With an upcoming shift: date, placement · times,
    "Open in planner". Without: "No upcoming shifts." + "Plan a shift". CTA
    buttons are self-sized (`self-start`), never stretched to the card width.
12. **Photo capture is a localhost-only beta flag.** The header Photo button
    renders only when the app runs on localhost (hostname check or a dev-env
    flag, e.g. `import.meta.env.DEV`); hidden in production.
13. **Header right cluster: one pill shape.** Photo, Synced and Feedback share
    the same geometry — rounded-full, h-8, px-3.5, text-sm, hairline border +
    shadow-sm. Tone still differs (Feedback emerald, others neutral).

## Page order (desktop)

1. **TODAY** — greeting + subtitle; next-shift/on-shift card with primary action.
2. **Nudge strip** — top nudge + collapsed "X more".
3. **YOUR PROGRESS** — registration narrative; tiles: practice hours (with pace
   bar + shifts-to-go), NMC competencies, clinical skills; assessor-ready pill;
   beneath: two-column row — Skills in progress | Top gaps.
4. **HOW PLACEMATE WORKS** — mindmap + first-steps checklist (or compact strip).
5. **YOUR RECORD** — activity digest + "See full audit log".

## Mobile order

Single column, same order — except while the tour is incomplete, the
HOW PLACEMATE WORKS band floats up to directly after the nudge strip
(new users meet the guide first). Natural order once the tour is done.

## New / changed surfaces

- **NEW: Audit log page** — the full filterable ActivityLog (current tabs:
  All, Shifts, Meds, Competencies, Skills, Reflections, Revision, Wellbeing).
- **Header search** — visual prominence pass (this spec does not move it).
- **Removed:** AiRecallTeaser component from home; hours-pace tile from hero.

## Out of scope

Everything below the home page: feature screens, nudge priority logic
(`logic/nudges.ts` ordering unchanged — only presentation changes), data model.

## As built (3 Aug 2026)

The design-system vocabulary landed first and was pushed to the claude.ai/design
project, so the parts exist before the page composes them:

- `ui.tsx` — `SectionHeading` (the chapter voice of decision 7, at `page` / `section`
  / `panel` sizes; `PageHero` and `Panel` now render through it), `MetricTile` (the
  progress tiles), and `pillBase` / `pillNeutral` / `pillPrimary` (decision 13).
- `Nudge.tsx` — `NudgeList` gained `collapseAfter` and `demoteIds` (decision 6).
- `home/CaptureFlowDiagram.tsx` — the mindmap SVG as pure props, shared by both band
  states. `SectionHeading`'s `HomeChapters` preview cell composes this whole page out
  of DS parts; keep it in step with the page order above.

Page files: `HomePage.tsx` plus `home/{NextShiftCard,HowItWorksBand,SkillsInProgress,
ActivityDigest}.tsx`; `RegistrationProgress.tsx` reworked. `AuditLogPage.tsx` on
`/activity`. `home/{MindmapBand,ExampleFlow,AiRecallTeaser}.tsx` deleted.

Two judgement calls worth recording:

1. **Decision 6 is demotion, not suppression.** On day one *every* live nudge
   duplicates an outstanding tour step, so hard-suppressing them all would leave a
   strip with nothing in it. Demoted nudges lose the visible slot to any
   non-duplicate and otherwise keep priority order — which reproduces the mockup's
   first-run state (one duplicate visible, the rest collapsed).
2. **The target date and pace projection were kept, moved not dropped.** Neither
   appears in the mockup and neither is in the page-order list, but neither is listed
   under "Removed" either. They are now a quiet footnote under the progress tiles
   rather than a right-aligned block competing with the assessor pill.

Not done: `/activity` has no nav entry — it is reachable only from the digest's
"See full audit log", since adding a nav item wasn't a call this spec made.
