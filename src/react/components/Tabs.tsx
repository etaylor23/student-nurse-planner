import { NavLink } from "react-router-dom";

export interface TabItem {
  /** Route the tab links to. Active state is derived from the URL (NavLink). */
  to: string;
  label: string;
  /** Exact-match the route (use for an index tab so sub-routes don't keep it active). */
  end?: boolean;
}

/**
 * The one tab-set component for the whole app — a URL-driven horizontal nav whose
 * active tab is derived from the route (so tabs are deep-linkable and the back
 * button works). Used by the shift modal, its Medications sub-tabs, and the
 * feature shells (skills / reflection / medication notes …).
 *
 * Two looks, same component: `underline` (default) for in-surface tabs like the
 * modal; `segmented` (pill tray) for the feature-page shells. Small single-select
 * toggles and list filters are deliberately NOT this — they aren't tab sets.
 */
export function Tabs({
  items,
  variant = "underline",
  ariaLabel,
  className = "",
}: {
  items: TabItem[];
  variant?: "underline" | "segmented";
  ariaLabel: string;
  className?: string;
}) {
  if (variant === "segmented") {
    return (
      <nav
        aria-label={ariaLabel}
        className={"flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 " + className}
      >
        {items.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              "rounded-lg px-3.5 py-2 text-sm font-medium transition " +
              (isActive
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700")
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={"flex gap-1 overflow-x-auto border-b border-slate-200/70 " + className}
    >
      {items.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
            (isActive
              ? "border-primary-600 text-primary-700"
              : "border-transparent text-slate-500 hover:text-slate-700")
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
