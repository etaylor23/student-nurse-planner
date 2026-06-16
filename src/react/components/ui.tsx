import type { ReactNode } from "react";

/**
 * Shared design system for every feature page.
 *
 * The canonical feature page is:
 *
 *   <div className="space-y-6">
 *     <PageHero eyebrow="…" title="…" subtitle="…" aside={…}>
 *       …optional progress / summary…
 *     </PageHero>
 *
 *     <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
 *       <div className="min-w-0 space-y-6 xl:col-span-1">
 *         <Panel step="1" title="…" hint="…">…</Panel>
 *         <Panel step="2" title="…" hint="…">…</Panel>
 *       </div>
 *       <Panel title="…" className="xl:col-span-2">…</Panel>
 *     </div>
 *   </div>
 *
 * Every white widget renders through the same `card` box: full width on mobile,
 * width customised on larger screens via a `col-span-*` (or `max-w-*`) class on
 * the widget. Always start the layout grid with `grid-cols-1` and give multi-
 * column wrappers `min-w-0` so a wide child (e.g. a table) can't force overflow.
 *
 * Tokens (card / inputCls / btn*) and primitives (PageHero / Panel / StatTile)
 * are shared so a new feature drops straight into this look.
 */

// `min-w-0` lets the box shrink inside a grid/flex parent so wide content
// (tables, long text) scrolls within it instead of forcing page overflow.
export const card =
  "min-w-0 rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-28px_rgba(16,24,40,0.22)]";

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-[.99]";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.99]";

export const btnGhostSm =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-[.99]";

/**
 * The page hero: an eyebrow, title and subtitle on the left, an optional metric
 * block on the right, and optional content underneath (progress bar, stats…).
 */
export function PageHero({
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className={card} aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1 max-w-md text-sm text-slate-500">{subtitle}</p>}
        </div>
        {aside && <div className="text-right">{aside}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

/**
 * A titled card with an optional numbered step badge, short hint, and an
 * action slot on the right. The step badges turn a page into an obvious
 * 1 → 2 → 3 flow without extra copy.
 */
export function Panel({
  step,
  title,
  hint,
  action,
  className = "",
  children,
}: {
  step?: string | number;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${card} ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {step != null && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
              {step}
            </span>
          )}
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
            {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** A compact stat with a colour dot, label, big value and short caption. */
export function StatTile({
  dot,
  label,
  value,
  sub,
}: {
  dot?: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60">
      <div className="flex items-center gap-1.5">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
