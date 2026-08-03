import { PlacementBreakdown } from "student-nurse-planner";

const placement = (id, name, settingType, startDate, endDate) => ({
  id,
  userId: "u1",
  createdAt: "2026-01-02T09:00:00.000Z",
  name,
  settingType,
  startDate,
  endDate,
});

const PLACEMENTS = [
  placement("p1", "Ward 9 — Acute Medical Unit", "Hospital", "2026-01-12", "2026-03-20"),
  placement("p2", "Emergency Department", "Hospital", "2026-03-30", "2026-05-15"),
  placement("p3", "Meadow View Community Team", "Community", "2026-05-25", "2026-07-10"),
];

let n = 0;
const shift = (placementId, date, netHours, shiftType = "LONG_DAY", isSimulated = false) => ({
  id: `s${++n}`,
  userId: "u1",
  createdAt: `${date}T21:00:00.000Z`,
  updatedAt: `${date}T21:00:00.000Z`,
  placementId,
  date,
  shiftType,
  entryMode: "RAW",
  netHours,
  isSimulated,
  status: "COMPLETED",
});

const SHIFTS = [
  ...Array.from({ length: 14 }, (_, i) =>
    shift("p1", `2026-0${i < 9 ? 1 : 2}-${String((i % 28) + 1).padStart(2, "0")}`, 11.5),
  ),
  ...Array.from({ length: 9 }, (_, i) =>
    shift("p2", `2026-04-${String(i + 1).padStart(2, "0")}`, 12.5, "NIGHT"),
  ),
  ...Array.from({ length: 8 }, (_, i) =>
    shift("p3", `2026-06-${String(i + 1).padStart(2, "0")}`, 7.5, "EARLY"),
  ),
];

/** Hours split by placement — the view a student checks before an interview. */
export function Default() {
  return <PlacementBreakdown shifts={SHIFTS} placements={PLACEMENTS} />;
}

/** With medication counts folded in per placement. */
export function WithMedCounts() {
  return (
    <PlacementBreakdown
      shifts={SHIFTS}
      placements={PLACEMENTS}
      medCounts={
        new Map([
          ["p1", { total: 24, distinct: 11 }],
          ["p2", { total: 9, distinct: 7 }],
          ["p3", { total: 3, distinct: 3 }],
        ])
      }
    />
  );
}

/** A single placement, early on — one row rather than a table of them. */
export function SinglePlacement() {
  return (
    <PlacementBreakdown shifts={SHIFTS.slice(0, 4)} placements={[PLACEMENTS[0]]} />
  );
}

/** Nothing logged yet. */
export function Empty() {
  return <PlacementBreakdown shifts={[]} placements={PLACEMENTS} />;
}
