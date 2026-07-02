# Spec — Activity Log & Shift Locking  (Status: BUILT)

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
  entityType: string;   // "SHIFT" today; generic for future entities
  entityId: string;     // the shift id (kept even if the shift is later deleted)
  entityLabel?: string; // shift's label at action time ("Ward 7 · Thu 18 Jun")
  action: string;       // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary: string;      // human line shown in the history
  batchId?: string;     // groups the entries written in one save event
  createdAt: string;    // ISO timestamp
}
```

Stored in its own IndexedDB store (Dexie version 2), indexed by `userId` and by
`[entityType+entityId]` so a single entity's history is a cheap lookup.

## Logged actions (v1 — shifts)

| action              | when                                              | example summary                              |
| ------------------- | ------------------------------------------------- | -------------------------------------------- |
| `SHIFT_CREATED`     | a new shift is logged (still planned)             | "Logged a shift on Thu 18 Jun"               |
| `SHIFT_UPDATED`     | an unlocked shift's field is edited (one per field) | "Start time: 19:00 → 20:00"                |
| `SHIFT_COMPLETED`   | a shift is marked as worked (mark-worked or form) | "Marked the Thu 18 Jun shift as worked (with Jo Smith)" |
| `SHIFT_REACTIVATED` | a completed shift is unlocked                     | "Reactivated the Thu 18 Jun shift"           |
| `SHIFT_DELETED`     | a shift is deleted                                | "Deleted the Thu 18 Jun shift"               |

All shift mutations funnel through `useShiftActions` (see `spec-architecture.md`),
so logging lives in one place and can't be bypassed by one of the two views. An
**edit** — a form save in either view, or the planner's drag/resize — records **one
`LogItem` per changed field** (`{field}: {before} → {after}`), computed by diffing
the previous shift against the saved one (pure `logic/shiftDiff.ts`). Status
transitions are excluded (they have their own `SHIFT_COMPLETED`/`SHIFT_REACTIVATED`
entries).

## Screens / UX

- **Lock state** — opening a completed shift (planner sidebar or hours-log panel)
  shows the form **disabled** with a lock notice and an **Unlock to edit** button;
  there is no Save or Delete until it's unlocked.
- **Lock icon** — completed shifts show a small padlock on their calendar chip and
  in the timesheet row; completed calendar events are not draggable/resizable.
- **History** — below the shift editor, a **History** list shows that shift's
  changes newest-first, **grouped by save event** (one timestamped group per save,
  with a line per changed field), like Jira.
- **Activity feed** — a global **Activity** panel listing every change across every
  entity, newest-first and grouped by save event. Mounted at the bottom of both the
  **Weekly Planner** and the **Placement Hours Log** (students logging shifts there
  now see it too). Each group is headed by the entity's **label** (`entityLabel`,
  captured at action time) so you can tell what it was, even after the entity changes
  or is deleted. The header **links to the entity** it's about — a med log opens the
  med log, a `PROFICIENCY_STATUS_CHANGED` opens that proficiency, a shift opens
  `/planner/:id`, etc. — via `hrefForEntity` (`logic/entityLinks.ts`, keyed on
  `entityType` + `entityId`; returns `null`, rendered as plain text, for unroutable
  types). **Filter chips** (All · Shifts · Meds · Competencies · Skills) narrow the
  feed by area. Both the feed and the per-shift history reuse a shared `LogList`
  renderer that groups by `batchId` (`logic/logGroups.ts`); a group now also carries
  its `entityType` (from `entries[0]`). The per-shift history header stays the
  timestamp (not linked).

## Repository

```ts
createLogItem(input: Omit<LogItem, "id" | "createdAt">): Promise<LogItem>;
listLogItems(userId, filter?: { entityType?; entityId? }): Promise<LogItem[]>; // newest first
```

## Tests

- Dexie round-trip: create log items, list by user, filter by `entityType+entityId`,
  newest-first ordering (fake-indexeddb).

## Not yet built (future)

- **Paginate the activity feed** — area filter chips are built (All · Shifts · Meds ·
  Competencies · Skills); a busy log would still want date filters or a "show more".
- **Logging other entities** — placements, reflections, skill sign-offs reuse the
  same `LogItem` table when those features add audit needs.

## Integrations

- **Medication Notes → this feed (built).** Adding, logging (observed/administered)
  and deleting a medication write generic `LogItem`s (`entityType` `MEDICATION` /
  `MEDICATION_LOG`), so med actions show in the global Activity feed next to shift
  changes. The med-log line names the shift it happened in. `LogList` carries dot
  colours for `MEDICATION_ADDED` / `MED_LOGGED` / `MEDICATION_DELETED`.
- **NMC Competency Tracker + Profile → this feed (built).** Proficiency status
  changes (`entityType` `PROFICIENCY`, action `PROFICIENCY_STATUS_CHANGED`), evidence
  link/unlink (`EVIDENCE_LINKED` / `EVIDENCE_UNLINKED`) and profile edits
  (`entityType` `PROFILE`, action `PROFILE_UPDATED`) append `LogItem`s and appear in
  the global feed. `LogList` carries dot colours for each.
- **Clinical Skills → this feed (built).** Stage changes, sign-off and custom
  add/delete (`entityType` `SKILL`, actions `SKILL_STAGE_CHANGED`, `SKILL_SIGNED_OFF`,
  `SKILL_ADDED`, `SKILL_DELETED`) append `LogItem`s via `useSkillActions`; signing off
  a baseline skill also writes the proficiency's `EVIDENCE_LINKED`. `LogList` carries
  dot colours for each.

## Connections

The Activity Log is the **hub every screen feeds**: each auditable action appends a
generic `LogItem` that renders in the one global feed (built unless marked
_(planned)_).

- **← Weekly Planner / Placement Hours Log.** Shift create / edit / complete /
  reactivate / delete.
- **← Medication Notes.** Medication add / delete; med logged (`MED_LOGGED`).
- **← NMC Competency Tracker.** `PROFICIENCY_STATUS_CHANGED`, `EVIDENCE_LINKED`,
  `EVIDENCE_UNLINKED`.
- **← Profile.** `PROFILE_UPDATED`.
- **← Clinical Skills.** `SKILL_STAGE_CHANGED`, `SKILL_SIGNED_OFF`, `SKILL_ADDED`,
  `SKILL_DELETED` (and the proficiency `EVIDENCE_LINKED` on auto-evidence sign-off).
- **← Reflection / Revision** _(planned)_. Will append the same way — no new
  per-feature history store.

## Data reuse

- **Is itself reuse.** `LogItem` is the **shared audit primitive** every feature
  writes to — entity-agnostic (`entityType` / `entityId` / `entityLabel`), composing
  the `Entity` / `UserOwned` / `Created` bases. Shifts and medication actions already
  use it; no feature has its own history table.

**Direction:** a new auditable action appends a `LogItem` (never a per-feature
history store); point at the source row via `entityType` + `entityId`, and group a
multi-field save with `batchId`. See `spec-architecture.md` → Data reuse.
