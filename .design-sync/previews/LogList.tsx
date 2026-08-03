import { LogList, Panel } from "student-nurse-planner";

const entry = (id, createdAt, action, summary, entityLabel) => ({
  id,
  userId: "u1",
  createdAt,
  entityType: "SHIFT",
  entityId: `shift-${id}`,
  entityLabel,
  action,
  summary,
});

const ITEMS = [
  entry(
    "1",
    "2026-06-18T20:40:00.000Z",
    "SHIFT_COMPLETED",
    "Marked complete — 12.5 h counted",
    "Ward 9 · Thu 18 Jun",
  ),
  entry(
    "2",
    "2026-06-18T07:32:00.000Z",
    "SHIFT_STARTED",
    "Clocked in at 07:30",
    "Ward 9 · Thu 18 Jun",
  ),
  entry(
    "3",
    "2026-06-16T19:05:00.000Z",
    "SHIFT_COMPLETED",
    "Marked complete — 11.5 h counted",
    "Ward 9 · Tue 16 Jun",
  ),
  entry(
    "4",
    "2026-06-15T09:12:00.000Z",
    "SHIFT_REACTIVATED",
    "Reopened to correct the break length",
    "ED · Mon 15 Jun",
  ),
];

/** The activity history — grouped by day, newest first. */
export function Default() {
  return <LogList items={ITEMS} />;
}

/** `showLabel` adds the entity descriptor recorded at the time of the action. */
export function WithLabels() {
  return <LogList items={ITEMS} showLabel />;
}

/** A single entry — the list holds its shape when there's barely anything in it. */
export function SingleEntry() {
  return <LogList items={ITEMS.slice(0, 1)} showLabel />;
}

/** In context, boxed by the Panel it usually sits in. */
export function InPanel() {
  return (
    <Panel title="Recent activity" hint="Everything you've changed, newest first">
      <LogList items={ITEMS} showLabel />
    </Panel>
  );
}
