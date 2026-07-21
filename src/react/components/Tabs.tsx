import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";

export interface TabItem {
  /** Route the tab links to. */
  to: string;
  label: ReactNode;
  /** Route-mode only: exact-match so sub-routes don't keep an index tab active. */
  end?: boolean;
  /**
   * Controlled-mode: when provided, the caller owns the active state (a Link is
   * rendered). When omitted, active is derived from the URL (a NavLink is used).
   */
  active?: boolean;
}

/**
 * The one tab-set component for the whole app — a horizontal nav whose active tab
 * is derived from the route (NavLink) or supplied by the caller (`active`), so
 * tabs are deep-linkable and the back button works. Used by the shift modal, its
 * Medications sub-tabs, and the feature shells (skills / reflection / medication
 * notes / revision / competencies).
 *
 * Two looks: `underline` (default) for in-surface tabs like the modal; `segmented`
 * (pill tray) for the feature-page shells. Small single-select toggles and list
 * filters are deliberately NOT this — they aren't tab sets.
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
  const wrap =
    variant === "segmented"
      ? "flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 "
      : "flex gap-1 overflow-x-auto border-b border-slate-200/70 ";

  const styleFor = (isActive: boolean) =>
    variant === "segmented"
      ? "rounded-lg px-3.5 py-2 text-sm font-medium transition " +
        (isActive ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700")
      : "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition " +
        (isActive
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-slate-500 hover:text-slate-700");

  return (
    <nav aria-label={ariaLabel} className={wrap + className}>
      {items.map((t) =>
        t.active === undefined ? (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => styleFor(isActive)}
          >
            {t.label}
          </NavLink>
        ) : (
          <Link
            key={t.to}
            to={t.to}
            aria-current={t.active ? "page" : undefined}
            className={styleFor(t.active)}
          >
            {t.label}
          </Link>
        ),
      )}
    </nav>
  );
}
