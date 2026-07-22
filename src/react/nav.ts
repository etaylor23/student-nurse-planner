/**
 * Ordered navigation config for the app shell, re-tiered around PlaceMate's spine.
 *
 * The nav is two tiers, not a flat menu of equals. The **spine** sections
 * (`tier` unset) are the core loop — the shift and everything a shift feeds:
 * hours, competency, skills, reflection, meds. The **support** tier (revision,
 * self-care) is framed as aids alongside placement and rendered visually
 * secondary. `Account` is a plain trailing section.
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
  /** Optional framing line under the heading (used for the secondary support tier). */
  note?: string;
  /** Visual tier — "support" renders muted/secondary; unset is the primary spine. */
  tier?: "support";
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    // Ungrouped first section; its first enabled item is the DEFAULT_ROUTE, so `/`
    // lands on Home.
    items: [{ path: "/home", label: "Home", enabled: true }],
  },
  // ---- The spine: the shift, and everything it counts toward ----
  {
    heading: "Shifts & hours",
    items: [
      { path: "/planner", label: "Weekly shift planner", enabled: true },
      { path: "/placement-hours", label: "Placement hours log", enabled: true },
    ],
  },
  {
    heading: "Competency & skills",
    items: [
      { path: "/competencies", label: "NMC competency tracker", enabled: true },
      { path: "/skills", label: "Clinical skills tracker", enabled: true },
    ],
  },
  {
    heading: "Reflection & meds",
    items: [
      { path: "/reflection", label: "Reflection on practice", enabled: true },
      { path: "/medications", label: "Medication notes", enabled: true },
    ],
  },
  // ---- Support: aids alongside placement, clearly secondary ----
  {
    heading: "Support",
    note: "Alongside your placement — dip in when they help.",
    tier: "support",
    items: [
      { path: "/revision", label: "Revision timetable", enabled: true },
      { path: "/self-care", label: "Self-care checklist", enabled: true },
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
