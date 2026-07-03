# Spec — Web Notifications  (Status: SPECCED — partially built)

Gentle, timely web notifications that pull the student back to the app at the moments
that matter — without nagging. Two families: a **self-care check-in reminder** and
**shift reminders**. This keeps the app's "capture while it's fresh" ethos working even
when the tab isn't in focus.

## Status

- **Built (this slice):** a foreground **self-care check-in reminder** you can trigger
  on demand. `src/react/notifications.ts` wraps the browser Notification API
  (`notificationsSupported` / `requestNotificationPermission` / `showNotification` /
  `simulateSelfCareReminder`); the Profile screen has a **"Simulate a check-in reminder"**
  button that requests permission and shows a notification which deep-links to
  `/self-care`. No scheduling, no service worker, no push — it only fires while a tab is
  open and only when triggered.
- **Not built (future):** the **shift reminders** below, and any real *scheduling*.

## Decisions

- **Self-care daily check-in.** A gentle once-a-day nudge → `/self-care` ("a quick, kind
  check-in — how are you doing?"). Never framed as a streak or an obligation (same
  guardrail as the self-care feature). Complements the already-built post-hard-shift
  nudge in `ShiftDebrief`.
- **Shift reminders (planned).** Driven by the shared `Shift` rows (`startAt` / `endAt`):
  - **15 minutes before a shift ends** — a heads-up reminder ("your shift's wrapping up
    soon").
  - **15 minutes after a shift ends** — a nudge to **log the shift** / open the
    post-shift debrief, deep-linking to the hours log or the shift editor so the capture
    prompts (meds, skills, reflection, evidence) are one tap away.
- **Permission + opt-in.** Notifications are always opt-in (browser permission prompt),
  and each family should be individually toggleable from Profile. Respect quiet hours.
- **Privacy.** Notification copy must be generic — never patient-identifiable, never a
  clinical detail. Titles/bodies say "your shift", not who or where.

## Architecture notes (why scheduling is deferred)

- The **foreground Notification API** (used now) can only show a notification while a tab
  is open and code runs — fine for the "simulate" button, useless for time-based
  reminders when the app is closed.
- Real scheduling needs a **Service Worker** plus either the **Notification Triggers /
  `showTrigger`** API (limited support) or, for reliability across devices, a **push
  backend** (Web Push + VAPID) that fires server-side at the computed times. That lands
  with the same backend that replaces `DexieRepository` (see `spec-architecture.md`).
- Interim option without a backend: a Service Worker that, while registered, sets local
  timers from the upcoming `Shift` rows — best-effort only (the browser may evict it).

## Integrations

- **← Weekly Planner / Placement Hours Log.** Shift reminders read `Shift` `startAt` /
  `endAt`; the "log your shift" nudge lands on the shift editor / debrief.
- **→ Self-care.** The check-in reminder deep-links to `/self-care` (built).
- No new persisted entity is required for the PoC slice. A future scheduling layer may
  add a `NotificationPref` (per-user toggles + quiet hours) via `schema.ts`.

## Open questions

- Local Service-Worker timers vs. waiting for the push backend?
- Per-family toggles + quiet-hours UI on Profile.
- Do we also remind before a **planned** shift starts (not just before it ends)?
