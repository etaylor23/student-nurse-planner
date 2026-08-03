import { Tabs } from "student-nurse-planner";

/**
 * `underline` (the default) — in-surface tabs, as used inside the shift modal.
 * Active state is passed here; omit `active` and it derives from the route.
 */
export function Underline() {
  return (
    <Tabs
      ariaLabel="Shift details"
      items={[
        { to: "#hours", label: "Hours", active: true },
        { to: "#skills", label: "Skills", active: false },
        { to: "#medications", label: "Medications", active: false },
        { to: "#notes", label: "Notes", active: false },
      ]}
    />
  );
}

/** `segmented` — the pill tray used by the feature-page shells. */
export function Segmented() {
  return (
    <Tabs
      variant="segmented"
      ariaLabel="Revision sections"
      items={[
        { to: "#due", label: "Due now", active: true },
        { to: "#subjects", label: "Subjects", active: false },
        { to: "#timetable", label: "Timetable", active: false },
        { to: "#targets", label: "Targets", active: false },
      ]}
    />
  );
}

/** Labels are ReactNode, so a tab can carry a count alongside its name. */
export function WithCounts() {
  return (
    <Tabs
      variant="segmented"
      ariaLabel="Proficiencies"
      items={[
        {
          to: "#all",
          label: (
            <>
              All <span className="text-slate-400">219</span>
            </>
          ),
          active: true,
        },
        {
          to: "#gaps",
          label: (
            <>
              Gaps <span className="text-accent-600">8</span>
            </>
          ),
          active: false,
        },
        {
          to: "#signed",
          label: (
            <>
              Signed off <span className="text-primary-600">14</span>
            </>
          ),
          active: false,
        },
      ]}
    />
  );
}

/** Underline tabs scroll horizontally rather than wrap when the set is long. */
export function ManyTabs() {
  return (
    <Tabs
      ariaLabel="Platforms"
      items={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
        to: `#platform-${n}`,
        label: `Platform ${n}`,
        active: n === 3,
      }))}
    />
  );
}
