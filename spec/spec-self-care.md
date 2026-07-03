# Spec — Self-Care Checklist  (Status: BUILT)

A gentle, private wellbeing check-in for student nurses — supportive, never a scored
obligation.

**Built:** a single `/self-care` screen — an optional energy rating (1–5), a kind
checklist grouped by dimension, an optional private on-device note, and always-available
support signposting that comes forward when energy is low. Data: `SelfCareCheckin` (with
the universal `shiftId` capture join) via the additive Dexie `version(5)`. Pure logic in
`logic/selfCare.ts` (item catalogue, `isHardShift`, support links, `parseItems`/
`joinItems`), unit-tested. Mutations via `useSelfCareActions` (activity-log at the action
layer). The tone guardrail is enforced in the UI: no streaks, no scores.

## Decisions (locked — confirmed with the user)

- **Rhythm:** **flexible** — check in any time, never marked "behind"; a gentle nudge
  appears in the post-shift **debrief after a hard shift** (night / long day / ~11h+).
- **Dimensions:** **all** — Physical basics (rest/sleep, food & hydration, movement),
  Emotional & social (connection, debrief after a tough moment), Practical (money/admin,
  protected time), and standing **signposting to support**.
- **Tone:** a gentle optional checklist — **no tracking/streaks**.
- **Mood/energy:** an optional **private** energy note (1–5, on-device); if it's low
  (≤ 2) the screen gently **signposts real support** rather than handling it in-app.
- **Notifications:** a Profile button **simulates** a daily self-care check-in reminder
  (foreground Notification API). The fuller notification vision lives in
  `notifications.md` (shift reminders are **not** built).

## Guardrails

Supportive, not a guilt/pressure mechanic — never a scored obligation, no streaks. If it
surfaces distress, point gently toward real support (Samaritans, Shout, NHS Practitioner
Health, the university wellbeing team, and 999/A&E for a crisis) rather than handling it
in-app.

## Integrations (built)

- **← Weekly Planner / Placement Hours Log.** After a **hard shift**, the post-shift
  debrief (`ShiftDebrief`) shows a gentle "check in with yourself" nudge that opens
  `/self-care` prefilled with that shift (`Shift` read via the universal `shiftId` join).
- **→ Activity Log.** Check-ins append `SELF_CARE_CHECKIN` `LogItem`s; the feed filters
  under a "Wellbeing" chip and links to `/self-care`.
- **↔ Notifications.** The Profile simulate button (and future scheduled reminders) deep-
  link to the check-in — see `notifications.md`.

## Connections _(built)_

- **← Weekly Planner / Placement Hours Log.** The hard-shift debrief nudge (above).
- **→ Activity Log.** Check-ins in the global feed (Wellbeing chip).

## Data reuse

- **Reuses:** `User` and the shared `Entity` / `UserOwned` / `Created` bases; `Shift` via
  `SelfCareCheckin.shiftId` for the post-hard-shift nudge. Ticked items are a
  comma-separated key list (like `Medication.routes`); the catalogue lives in
  `logic/selfCare.ts`, not the entity model.

**Direction:** compose the shared bases and reference shifts by id; the one store was
added via `schema.ts` + an additive `db.ts` `version()`. See `spec-architecture.md`.
