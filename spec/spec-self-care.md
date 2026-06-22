# Spec — Self-Care Checklist  (Status: DEFERRED)

Explicitly **deferred** during scoping — to be designed once the rest of the app
is in good shape. No decisions locked yet.

## Open questions to resolve when picked up

- **Rhythm:** daily, weekly, or per placement block?
- **Dimensions:** sleep, food/hydration, movement, finances, social contact,
  debrief after hard shifts, signposting to wellbeing support?
- **Tone:** a gentle optional checklist vs. tracking/streaks. (Decide
  deliberately — streaks can add pressure when missed, which is the opposite of
  the intent for a wellbeing feature.)
- **Mood/energy:** a private note, or prompts after difficult shifts that
  **signpost support**?

## Guardrails (when built)

Keep it supportive, not a guilt/pressure mechanic. Avoid turning self-care into
another scored obligation. If it surfaces distress, point gently toward real
support rather than handling it in-app.

## Integrations

None yet.

## Data reuse

- **Will reuse (when built):** `User` and the shared `Entity` / `UserOwned` /
  `Created` bases; `Shift` for any "after a hard shift" prompts.

**Direction:** compose the shared bases and reference shifts by id; add a store only
via `schema.ts`. See `spec-architecture.md` → Data reuse.
