/**
 * Ordered navigation config for the app shell.
 *
 * Each feature has an `enabled` flag. Disabled items render as non-clickable
 * with a "Soon" badge in the fly-over nav. As features are built, flip the
 * flag and wire up the route in `App.tsx`.
 */
export interface NavItem {
  /** react-router path. */
  path: string;
  /** Label shown in the nav. */
  label: string;
  /** Whether the feature is built and routable yet. */
  enabled: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/competencies", label: "NMC competency tracker", enabled: false },
  { path: "/placement-hours", label: "Placement hours log", enabled: true },
  { path: "/reflection", label: "Reflection on practice", enabled: false },
  { path: "/skills", label: "Clinical skills tracker", enabled: false },
  { path: "/planner", label: "Weekly shift planner", enabled: false },
  { path: "/medications", label: "Medication notes", enabled: false },
  { path: "/self-care", label: "Self-care checklist", enabled: false },
  { path: "/revision", label: "Revision timetable", enabled: false },
];

/** First enabled route — `/` and unknown paths redirect here. */
export const DEFAULT_ROUTE =
  NAV_ITEMS.find((item) => item.enabled)?.path ?? "/placement-hours";
