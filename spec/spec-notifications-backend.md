# Spec — Notifications Backend (scheduled push) — STUB (deferred)

_Status: **STUB / deferred to its own feature phase.** Reserves the auth model + data
shape. Extends [`notifications.md`](./notifications.md) (foreground-only today) with the
server side it explicitly defers to "the same backend that replaces `DexieRepository`."
Not built; not fully designed._

## Why this needs its own spec

[`notifications.md`](./notifications.md) built a **foreground-only** slice
([`src/react/notifications.ts`](../src/react/notifications.ts): the Notification API + a
"simulate a check-in" button) and defers real **shift reminders** + scheduling to this
backend. Real reminders must fire **when the app is closed** — which the foreground API
can't do.

The catch that forces a dedicated auth model: scheduled push is **server-initiated** —
there is no client request and no JWT. A backend scheduler fires a Web Push at a computed
time to a **stored subscription**.

## Auth model — server-initiated (see backend spec §4.1, surface #3)

- **Web Push + VAPID.** A per-device **`PushSubscription`** (endpoint URL + keys) is
  captured client-side and stored server-side. **The subscription endpoint is the
  capability** — no JWT, no session.
- **Notify-only.** The sender never reads or mutates user data beyond what's needed to
  compose **generic copy**. **No patient-identifiable data, no clinical detail** (same
  guardrail); titles/bodies say "your shift," not who or where.
- Dead subscriptions (Web Push `410 Gone`) are pruned.

## Components

- **Client:** register a **Service Worker**; capture a `PushSubscription` via
  `PushManager`; send it to the backend to store; handle `push` events → show the
  notification, deep-link into the app.
- **Data (new entities, owner partition):**
  - `PushSubscription` — per user + device: `endpoint`, keys, `createdAt`.
  - `NotificationPref` — per user: per-family toggles (self-care / shift reminders) +
    **quiet hours** (from notifications.md's open questions).
- **Scheduler:** compute reminder times from `Shift` `startAt`/`endAt` (15 min before
  end; 15 min after end → "log your shift"), plus the daily self-care nudge. Either
  **EventBridge Scheduler** one-shots per shift, or a periodic **sweep Lambda** firing
  due reminders. Respect toggles + quiet hours.
- **Sender Lambda:** VAPID-signs and POSTs Web Push to each of a user's subscriptions.

## Repository additions

`savePushSubscription`, `listPushSubscriptions` / `deletePushSubscription`,
`getNotificationPrefs`, `setNotificationPrefs`.

## Infra

VAPID keys in **Secrets Manager / SSM** (never in the client bundle); EventBridge
Scheduler; the sender Lambda. Subscriptions are per-device — likely **device-local
registration + a server copy**, not synced like user data (revisit under the sync layer).

## Open questions (carried from notifications.md)

- Local Service-Worker timers vs the push backend for interim scheduling?
- Per-family toggles + quiet-hours UI on Profile.
- Remind before a **planned** shift starts, not just before it ends?

## Phase

Its own feature phase, after the core backend. Not v1. (Ties to the same
future realtime-push transport decision flagged in
[`spec-backend-dynamodb.md`](./spec-backend-dynamodb.md) §5.)
