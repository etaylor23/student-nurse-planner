# Phase D — shift notifications + break-time assist (detailed sub-plan)

Status: **PLAN — executable, not yet built.** This is the sub-plan the connected-spine
plan (`plans/2026-07-22-connected-spine.md` §"Phase D") explicitly defers to: "size + risk
warrant its own detailed plan before building; treat A–C as shippable without it." It
extends the two existing specs — `spec/notifications.md` (foreground-only slice, built) and
`spec/spec-notifications-backend.md` (server push, stub) — into concrete, verifiable steps.

Executor: Claude Opus 4.8. Same repo discipline as the connected-spine plan (one step = one
commit = one push, verified before the next; local gate; stage only your paths; UK English;
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`; `--profile personal` for AWS).

## Why this is a phase, not a step

Real shift reminders must fire **when the app is closed**. The foreground Notification API
(built: `src/react/notifications.ts` + the Profile "simulate a check-in" button) cannot do
that. Reliable delivery needs **Web Push + VAPID**: a service worker on the client, a stored
push subscription per device, and a **server-initiated** sender that fires at computed times
(no JWT — the subscription endpoint is the capability). That's new client plumbing, two new
persisted entities, a scheduler, a sender Lambda, and a **VAPID secret**.

### ⛔ Owner gates (cannot proceed without you)

- **G1 — VAPID keypair.** Generate a VAPID keypair; store the **private** key in AWS Secrets
  Manager / SSM (never in the client bundle); the **public** key ships in the client. Needs
  your go-ahead + the `personal` AWS account. Nothing server-side works until this exists.
- **G2 — new production backend infra.** D5/D6 deploy new Lambdas + an EventBridge schedule
  to the live `NursePlanner-dev` (= prod) stack. Confirm before deploying.

Break-time assist note: the plan's "in-app fast *debrief now* affordance for logging on a
break" is **already effectively delivered** by Phase A — Home's on-shift card ("You're on
shift now → Capture now"), the shift modal's capture tabs, and A4's "quick wins" catch-up.
A dedicated affordance would duplicate it; fold any refinement into A-phase surfaces instead.

## Decisions (locked from the specs)

| # | Decision |
|---|----------|
| N1 | **Two families:** self-care daily check-in (foreground slice built) + **shift reminders** (this phase). |
| N2 | **Shift reminder times (ethos D5):** **30 min before** a PLANNED shift's `startAt` (practical prep + "be mindful to capture") and **30 min after** its `endAt` (retrospective "log what you did"), each deep-linking into the shift. (The old spec said 15-before-end/15-after-end; the ethos grill supersedes it to 30-before-start / 30-after-end.) |
| N3 | **Opt-in + per-family toggles** on Profile; respect **quiet hours**; nothing fires for guests or without opt-in. |
| N4 | **Privacy:** copy is generic — "your shift", never who/where, never patient-identifiable or clinical detail. |
| N5 | **Subscriptions are per-device**, server-stored, server-initiated. Dead subs (`410 Gone`) pruned. |
| N6 | **No hours/PAD data leaves in a notification** beyond generic composition. |

## Steps

### D1 — pure scheduling logic (frontend, safe, TDD) — no gate
`src/logic/notificationSchedule.ts` (+ tests): from a `Shift` + `NotificationPref`, compute
the due reminder instants (30-before-start, 30-after-end), skip past times, apply quiet
hours, and produce the **generic** title/body/deep-link for each. Pure — reused by both a
future SW-timer path and the backend sender, so the copy + timing live in one tested place.
- **Acceptance:** given a shift + prefs, returns the correct due instants + privacy-safe copy;
  respects quiet hours + per-family toggles; returns nothing for a guest/opted-out user.
- *(Ships with D3 as its first consumer — not committed dead.)*

### D2 — client service worker + PWA manifest (frontend) — no gate
A minimal `sw.js` (registered in `main.tsx`) handling **`push`** (show the notification) and
**`notificationclick`** (focus/deep-link) events, plus a web-app manifest for installability.
**No `fetch` handler / no asset caching** — avoids the classic stale-SPA trap; Vite's hashed
assets + `index.html` no-cache already handle updates. Wire scope/serving via `vite.config.ts`
(or `public/`).
- **Acceptance:** SW registers on load; an injected test `push` payload shows a notification
  that deep-links correctly; no change to asset/navigation caching; reduced-motion/permission
  states handled.

### D3 — opt-in UX + `NotificationPref` + subscription capture (frontend + 1 entity) — needs G1's public key
- `NotificationPref` entity (per user: `selfCareEnabled`, `shiftRemindersEnabled`, quiet-hours
  start/end) — additive Dexie store + zod (`gen:zod`), synced like user data. Repo methods
  `getNotificationPrefs` / `setNotificationPrefs` across interface/Dexie/Dynamo/Api.
- Profile "Notifications" panel: enable toggle (requests browser permission), per-family
  toggles, quiet-hours. On enable, `PushManager.subscribe({ applicationServerKey: <VAPID pub> })`
  and send the subscription to the backend (D4).
- **Acceptance:** toggles persist + sync; enabling prompts for permission and captures a
  subscription; disabling unsubscribes; honest copy (no promise of delivery until D5 is live).

### D4 — subscription + pref storage (backend) — needs G1
- `PushSubscription` entity (per user+device: `endpoint`, `p256dh`, `auth`, `createdAt`) in the
  owner partition. Repo `savePushSubscription` / `listPushSubscriptions` / `deletePushSubscription`.
  Per-device: device-local registration + a server copy (NOT synced like user data — see the
  sync-layer note in `spec-backend-dynamodb.md`).
- Router allow-list + Cedar verb/tier for the new methods (owner-scoped).
- **Acceptance:** a captured subscription round-trips to DynamoDB; a signed-in user's subs are
  listable server-side; delete prunes.

### D5 — scheduler + sender Lambdas (backend infra) — needs G1 + G2
- **Sender Lambda:** VAPID-signs (`web-push`) and POSTs to each of a user's subscriptions;
  composes generic copy via D1; prunes `410 Gone`.
- **Scheduler:** compute due reminders from synced `Shift` `startAt`/`endAt` + prefs. Choose
  **EventBridge Scheduler one-shots per shift** (created/updated/deleted alongside shift sync)
  **or** a periodic **sweep Lambda** (every ~5 min, fires due reminders, idempotent via a
  "last-fired" marker). Sweep is simpler + more robust to shift edits — recommended.
- Infra in `infra/` (cdk): the two Lambdas, the schedule/rule, IAM, VAPID secret read.
- **Acceptance:** a planned shift produces both notifications at the right times to a real
  subscribed device; quiet hours + toggles respected; nothing for guests/opted-out; idempotent
  (no double-fire); dead subs pruned.

### D6 — end-to-end verification + gentle rollout — needs G2
Real-device test (subscribe → schedule a near-future shift → receive both pushes → deep-links
land on the shift's capture). Roll out behind the opt-in; monitor sender errors/alerting.

## Suggested sequence
**D1 → D2 → D3** are frontend/light-schema and safely shippable once G1's public key exists
(D3). **D4 → D5 → D6** are the backend infra behind G1 + G2. If you want motion now: I can
build **D1 + D2** immediately (no secrets, no prod-infra risk), then pause for G1 to do D3+.

## Out of scope
- Changing the built foreground self-care "simulate" slice.
- Offline caching / full PWA app-shell (explicitly avoided in D2 to dodge stale-asset risk).
- Native app wrappers / APNs/FCM (Web Push only).
