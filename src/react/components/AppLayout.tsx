import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { NAV_ITEMS, type NavItem } from "../nav";

/** Minimal line icons keyed by nav path. Inherit color + size from the parent. */
const ICONS: Record<string, ReactNode> = {
  "/competencies": (
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
  ),
  "/placement-hours": <path d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  "/reflection": (
    <path d="M12 6.5C10.5 5 8.5 4.5 6 4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1c2.5 0 4.5.5 6 2m0-15c1.5-1.5 3.5-2 6-2a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1c-2.5 0-4.5.5-6 2m0-15v15" />
  ),
  "/skills": <path d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  "/planner": (
    <path d="M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
  ),
  "/medications": (
    <path d="m10.5 13.5 3-3M8 16a4 4 0 0 1 0-5.66l2.34-2.34a4 4 0 0 1 5.66 5.66l-2.34 2.34A4 4 0 0 1 8 16Z" />
  ),
  "/self-care": (
    <path d="M12 20s-7-4.35-7-9.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 7 3.5C19 15.65 12 20 12 20Z" />
  ),
  "/revision": <path d="M12 4 3 9l9 5 9-5-9-5Zm0 10v6m-5-9v4a5 3 0 0 0 10 0v-4" />,
};

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) =>
        item.enabled ? (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            className={({ isActive }) =>
              "group/link flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors " +
              (isActive
                ? "bg-emerald-50 font-medium text-emerald-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")
            }
          >
            <NavIcon item={item} />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ) : (
          <span
            key={item.path}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400"
          >
            <NavIcon item={item} />
            <span className="truncate">{item.label}</span>
            <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Soon
            </span>
          </span>
        ),
      )}
    </nav>
  );
}

function NavIcon({ item }: { item: NavItem }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      {ICONS[item.path]}
    </svg>
  );
}

function PanelContents({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-3 pb-6 pt-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white">
          SN
        </span>
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          Student Nurse Planner
        </span>
      </div>
      <NavList onNavigate={onNavigate} />
      <p className="mt-auto px-3 pt-6 text-xs leading-relaxed text-slate-400">
        A personal study aid. Your PAD remains the official signed record.
      </p>
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen bg-slate-50 text-slate-900">
      {/* Soft, brand-tinted wash at the top — depth without distraction. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-emerald-50/70 via-emerald-50/10 to-transparent"
      />

      {/* ---------- Desktop fly-over (lg+) ---------- */}
      {/* The group IS the left margin hover strip; the panel floats out of it
          on hover and stays open while the pointer is over the panel itself. */}
      <div className="group fixed inset-y-0 left-0 z-40 hidden w-20 lg:block xl:w-24">
        {/* Discoverable handle, fades out as the panel slides in. */}
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-opacity duration-200 group-hover:opacity-0">
          <span className="flex h-11 w-7 flex-col items-center justify-center gap-1 rounded-full border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
            <span className="h-0.5 w-3.5 rounded bg-slate-400" />
            <span className="h-0.5 w-3.5 rounded bg-slate-400" />
            <span className="h-0.5 w-3.5 rounded bg-slate-400" />
          </span>
        </div>

        <aside className="absolute inset-y-0 left-0 flex w-80 -translate-x-full flex-col overflow-y-auto border-r border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur transition-transform duration-300 ease-out group-hover:translate-x-0">
          <PanelContents />
        </aside>
      </div>

      {/* ---------- Mobile menu button + drawer (<lg) ---------- */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white shadow-sm lg:hidden"
        aria-label="Open navigation"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          className="h-5 w-5 text-slate-700"
          aria-hidden="true"
        >
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl">
            <PanelContents onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ---------- Ultra-wide content: ~5rem (lg) / 6rem (xl) side margins ---------- */}
      <main className="relative px-6 py-8 pt-20 sm:px-10 lg:px-20 lg:py-12 lg:pt-12 xl:px-24">
        {children}
      </main>
    </div>
  );
}
