# Plan — "Soon to be" AI recall explainer on Home

**Status:** Planned (grilled 2026-07-20) · **Effort:** ~half a day · Extends [`spec-home.md`](../spec/spec-home.md)

## Goal

Tease the upcoming AI feature on Home: a student types a plain-language question and
their **own verbatim logged notes** surface, cross-checked against official sources.
This is *just the explainer* for a not-yet-built feature — but with a lightweight
"notify me" so it doubles as demand data + a launch list.

## The feature it teases (context, not built here)

Retrieval over the student's own data: e.g. *"I remember logging X in clinical skills
but I can't remember the order to do it in"* → surfaces their original notes verbatim,
then fact-checks against integrated official sources.

## Decisions (locked in grilling)

- **Form — animated scripted demo.** A mock chat bar auto-types the example question,
  then reveals a canned answer: the student's own note (verbatim, illustrative) + 2–3
  "fact-checked against" source chips. Loops gently. **Clearly badged "Coming soon."**
  Not a real input.
- **Source naming — named but clearly illustrative.** Show recognisable chips (e.g.
  **BNF, NICE, NMC guidance**) framed as examples / coming-soon — **never** implying a
  partnership or endorsement.
- **Interest capture — lightweight "notify me".** A "Tell me when this lands" button
  records interest by setting a synced flag on the user's profile, so we get a real
  launch list and demand signal.
- **Placement:** a distinct showcase panel **lower on Home** (below the actionable
  content / example-flow + today grid) so it never competes with real actions.
- **Honesty:** unmistakably "coming soon"; nothing implies it works today (readonly/
  disabled styling on the mock input + the badge).

## Implementation

1. **Profile flag** — add `aiRecallInterestAt?: string` to `User` in
   [`src/domain/types.ts`](../src/domain/types.ts); run `npm run gen:zod`. Self-owned →
   no new authz; rides `repo.updateUser` + sync. (Same mechanism as the onboarding flag
   in the example-flow plan — coordinate the two `User` additions into one `gen:zod`.)
2. **`src/react/components/home/AiRecallTeaser.tsx`** — the panel:
   - Mock chat bar (readonly, badge), a typewriter animation for the question, then a
     revealed "answer" card with the verbatim note + source chips.
   - Respect `prefers-reduced-motion`: render the final state statically, no loop.
   - "Notify me" button → `repo.updateUser({ aiRecallInterestAt })`; flips to a
     confirmed "We'll let you know 🌱" state once set.
3. **`HomePage.tsx`** — mount below the main content.
4. **Copy** — draft the question, the illustrative verbatim-note example, the caption,
   the source-chip framing, and the notify-me states (for sign-off).
5. **Tests** — render + notify-me toggles the flag.

## Risks & open items

- **Endorsement risk (regulated domain)** — keep source chips explicitly illustrative
  and "coming soon"; no logos implying official association.
- **Must not look live** — disabled/readonly input + badge so no one thinks it works yet.
- **Copy** — confirm the exact example note + captions.

## Acceptance criteria

- Animated demo plays (and degrades to a static end-state under reduced-motion).
- Source chips read as illustrative, badged "coming soon", no endorsement implied.
- "Notify me" persists `aiRecallInterestAt` (synced) and shows a confirmed state.
- Sits below the actionable Home content; on-brand.
