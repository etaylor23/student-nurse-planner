/**
 * Ordered navigation config for the app shell, grouped into "suites of views".
 *
 * Each feature has an `enabled` flag. Disabled items render as non-clickable
 * with a "Soon" badge. A section with a `heading` renders that subheading above
 * its items; a section without one renders ungrouped. As features are built,
 * flip the flag and wire up the route in `App.tsx`.
 */
export interface NavItem {
  /** react-router path. */
  path: string;
  /** Label shown in the nav. */
  label: string;
  /** Whether the feature is built and routable yet. */
  enabled: boolean;
}

export interface NavSection {
  /** Optional subheading; omit for an ungrouped section. */
  heading?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: "Shifts & hours",
    items: [
      { path: "/placement-hours", label: "Placement hours log", enabled: true },
      { path: "/planner", label: "Weekly shift planner", enabled: true },
    ],
  },
  {
    items: [
      { path: "/competencies", label: "NMC competency tracker", enabled: true },
      { path: "/reflection", label: "Reflection on practice", enabled: false },
      { path: "/skills", label: "Clinical skills tracker", enabled: false },
      { path: "/medications", label: "Medication notes", enabled: true },
      { path: "/self-care", label: "Self-care checklist", enabled: false },
      { path: "/revision", label: "Revision timetable", enabled: false },
    ],
  },
  {
    heading: "Account",
    items: [{ path: "/profile", label: "Profile", enabled: true }],
  },
];

/** Flat list of all items (kept for routing/default-route consumers). */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** First enabled route — `/` and unknown paths redirect here. */
export const DEFAULT_ROUTE = NAV_ITEMS.find((item) => item.enabled)?.path ?? "/placement-hours";
