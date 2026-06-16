# Spec — Activity Log & Shift Locking  (Status: PLANNED)

A generic **audit trail** — a history of what the student has done, in the style
of Jira's issue history — plus the **locking** of completed shifts that the trail
records. Both are built on one new entity, `LogItem`.

## Why

Counted practice hours feed an official target, so a **COMPLETED shift must not be
silently changed**: once a shift is marked as worked it is **locked** (every field
and its calendar position) until the student deliberately **reactivates** it. Every
lock/unlock — and the other shift lifecycle events — is recorded as a `LogItem`, so
there is an honest history of who-did-what-when behind the hours.

## Decisions (locked)

- **Generic action log.** `LogItem` is deliberately entity-agnostic: it records an
  `action`, the `entityType` + `entityId` it happened to, and a human-readable
  `summary`. v1 only logs **shifts**, but the same table will later log placements,
  reflections, skill sign-offs, etc. — one audit trail, not one per feature.
- **Append-only.** Log items are never edited or deleted by the app. Deleting the
  underlying entity (e.g. a shift) leaves its history in place as an audit record.
- **Completed = locked.** A shift with `status = COMPLETED` is read-only:
  - the shift form opens in a locked state (all fields disabled, no Save, no Delete);
  - the calendar event can't be dragged or resized;
  - the timesheet hides the row's delete action.
- **Unlock = reactivate.** A single **Unlock** action flips `COMPLETED → PLANNED`
  (it does **not** wipe the RN name or hours — re-completing is one click). After
  unlocking, the shift is fully editable again. Both completing and reactivating
  write a `LogItem`.
- **History is per-entity (v1).** A shift's history shows in its editor panel,
  newest first — like Jira's "History" tab on an issue. A global activity stream is
  a later enhancement (see *Not yet built*).

## Data model

`LogItem` — see the canonical Prisma model in `spec-architecture.md`. PoC shape:

```ts
interface LogItem {
  id: string;
  userId: string;
  entityType: string; // "SHIFT" today; generic for future entities
  entityId: string;   // the shift id (kept even if the shift is later deleted)
  action: string;     // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary: string;    // human line shown in the history
  createdAt: string;  // ISO timestamp
}
```

Stored in its own IndexedDB store (Dexie version 2), indexed by `userId` and by
`[entityType+entityId]` so a single entity's history is a cheap lookup.

## Logged actions (v1 — shifts)

| action              | when                                              | example summary                              |
| ------------------- | ------------------------------------------------- | -------------------------------------------- |
| `SHIFT_CREATED`     | a new shift is logged (still planned)             | "Logged a shift on Thu 18 Jun"               |
| `SHIFT_UPDATED`     | an unlocked shift's details are edited            | "Edited the Thu 18 Jun shift"                |
| `SHIFT_COMPLETED`   | a shift is marked as worked (mark-worked or form) | "Marked the Thu 18 Jun shift as worked (with Jo Smith)" |
| `SHIFT_REACTIVATED` | a completed shift is unlocked                     | "Reactivated the Thu 18 Jun shift"           |
| `SHIFT_DELETED`     | a shift is deleted                                | "Deleted the Thu 18 Jun shift"               |

All shift mutations funnel through `useShiftActions` (see `spec-architecture.md`),
so logging lives in one place and can't be bypassed by one of the two views.

## Screens / UX

- **Lock state** — opening a completed shift (planner sidebar or hours-log panel)
  shows the form **disabled** with a lock notice and an **Unlock to edit** button;
  there is no Save or Delete until it's unlocked.
- **Lock icon** — completed shifts show a small padlock on their calendar chip and
  in the timesheet row; completed calendar events are not draggable/resizable.
- **History** — below the shift editor, a **History** list shows that shift's
  `LogItem`s newest-first (a dot, the summary, and a timestamp), like Jira.

## Repository

```ts
createLogItem(input: Omit<LogItem, "id" | "createdAt">): Promise<LogItem>;
listLogItems(userId, filter?: { entityType?; entityId? }): Promise<LogItem[]>; // newest first
```

## Tests

- Dexie round-trip: create log items, list by user, filter by `entityType+entityId`,
  newest-first ordering (fake-indexeddb).

## Not yet built (future)

- **Global activity stream** — one screen listing every `LogItem` across entities
  (the home for deleted-entity history). v1 only surfaces per-shift history.
- **Field-level diffs** — Jira-style "changed start 07:00 → 08:00"; v1 summaries are
  whole-action sentences.
- **Logging other entities** — placements, reflections, skill sign-offs reuse the
  same `LogItem` table when those features add audit needs.
