import { PlacementPalette } from "student-nurse-planner";

const placement = (id, name, settingType, startDate, endDate) => ({
  id,
  userId: "u1",
  createdAt: "2026-01-02T09:00:00.000Z",
  name,
  settingType,
  startDate,
  endDate,
});

/**
 * The draggable placement chips that sit beside the planner calendar — drag one
 * onto a day to create a shift there.
 */
export function Default() {
  return (
    <PlacementPalette
      placements={[
        placement("p1", "Ward 9 — Acute Medical Unit", "Hospital", "2026-01-12", "2026-03-20"),
        placement("p2", "Emergency Department", "Hospital", "2026-03-30", "2026-05-15"),
        placement("p3", "Meadow View Community Team", "Community", "2026-05-25", "2026-07-10"),
      ]}
    />
  );
}

/** A single placement — the common case early in a course. */
export function SinglePlacement() {
  return (
    <PlacementPalette
      placements={[
        placement("p1", "Ward 9 — Acute Medical Unit", "Hospital", "2026-01-12", "2026-03-20"),
      ]}
    />
  );
}

/** No placements yet — the empty state points at adding one. */
export function Empty() {
  return <PlacementPalette placements={[]} />;
}
