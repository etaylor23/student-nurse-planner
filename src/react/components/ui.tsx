import type { ReactNode } from "react";
import { Link } from "react-router-dom";

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
 * Tokens (card / inputCls / btn* / pill*) and primitives (PageHero /
 * SectionHeading / Panel / StatTile / MetricTile) are shared so a new feature
 * drops straight into this look.
 */

// `min-w-0` lets the box shrink inside a grid/flex parent so wide content
// (tables, long text) scrolls within it instead of forcing page overflow.
export const card =
  "min-w-0 rounded-2xl bg-white p-6 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_18px_44px_-28px_rgba(16,24,40,0.22)]";

export const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-ink shadow-sm transition placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/25";

export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 active:scale-[.99]";

// Secondary CTA — NHS blue. The trust-coloured counterpart to the emerald
// primary, for actions that sit alongside (not competing with) the main CTA.
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-secondary-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-secondary-700 active:scale-[.99]";

export const btnGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[.99]";

export const btnGhostSm =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-[.99]";

/**
 * Header pill geometry — one shape for every control in the app-bar's right
 * cluster (Photo, Synced, Feedback). They used to be three different heights and
 * radii, which read as three unrelated widgets crowding the corner; sharing the
 * geometry lets tone alone carry the difference in rank.
 *
 * Compose as `${pillBase} ${pillNeutral}` (status/secondary) or
 * `${pillBase} ${pillPrimary}` (the emerald one that wants to be found).
 */
export const pillBase =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40";

export const pillNeutral =
  "border border-slate-200 bg-white text-slate-600 hover:border-primary-300 hover:text-slate-900";

export const pillPrimary =
  "border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100 hover:text-primary-800";

// Inline text link — NHS blue, the conventional link colour. Use for links
// that sit inside body copy (not for buttons or nav).
export const link =
  "font-medium text-secondary-700 underline-offset-2 transition-colors hover:text-secondary-800 hover:underline";

/**
 * Which brand ramp the eyebrow is tinted with. Emerald is the default; NHS blue
 * marks a section about the long arc (progress toward registration) rather than
 * about today.
 */
export type EyebrowTone = "primary" | "secondary";

/**
 * How loud the heading is. `page` is the screen's single h1, `section` a chapter
 * within it, `panel` the heading on one widget.
 */
export type HeadingSize = "page" | "section" | "panel";

const EYEBROW: Record<EyebrowTone, string> = {
  primary: "text-[11px] font-semibold uppercase tracking-wider text-primary-600",
  secondary: "text-[11px] font-semibold uppercase tracking-wider text-secondary-600",
};

const TITLE: Record<HeadingSize, string> = {
  page: "text-2xl font-semibold tracking-tight text-ink",
  section: "text-lg font-semibold tracking-tight text-ink",
  panel: "text-sm font-semibold text-slate-800",
};

const SUBTITLE: Record<HeadingSize, string> = {
  page: "mt-1 max-w-md text-sm text-slate-500",
  section: "mt-1 max-w-xl text-sm text-slate-500",
  panel: "mt-0.5 text-xs text-slate-400",
};

const ALIGN = { start: "items-start", center: "items-center", end: "items-end" } as const;

// Literal classes, not interpolated: Tailwind only emits utilities it can see as
// whole strings in the source.
const GAP = { sm: "gap-3", md: "gap-4", lg: "gap-6" } as const;

/**
 * The one heading row: an optional eyebrow, a title, an optional subtitle, and an
 * optional action on the right.
 *
 * Every chapter on a page wears the same eyebrow + title voice through this, so a
 * screen reads as an ordered set of chapters rather than a pile of sibling cards.
 * `leading` takes a marker that sits beside the text (a step badge, an icon).
 */
export function SectionHeading({
  eyebrow,
  eyebrowTone = "primary",
  title,
  subtitle,
  size = "section",
  as,
  align = "end",
  gap = "sm",
  leading,
  action,
  actionFluid = false,
  className = "",
}: {
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  title: string;
  subtitle?: ReactNode;
  size?: HeadingSize;
  /** Heading level. Defaults to `h1` at `page` size, `h2` otherwise. */
  as?: "h1" | "h2" | "h3";
  align?: keyof typeof ALIGN;
  gap?: keyof typeof GAP;
  leading?: ReactNode;
  action?: ReactNode;
  /**
   * The action is a block with wrappable text, not a button. A button must keep its
   * shape (`shrink-0`), but a block holding a long line has to be allowed to shrink,
   * or its max-content width pushes the whole page into horizontal overflow.
   */
  actionFluid?: boolean;
  className?: string;
}) {
  const Heading = as ?? (size === "page" ? "h1" : "h2");
  return (
    <div className={`flex flex-wrap justify-between ${ALIGN[align]} ${GAP[gap]} ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {leading}
        <div className="min-w-0">
          {eyebrow && <p className={EYEBROW[eyebrowTone]}>{eyebrow}</p>}
          <Heading className={`${eyebrow ? "mt-1 " : ""}${TITLE[size]}`}>{title}</Heading>
          {subtitle && <p className={SUBTITLE[size]}>{subtitle}</p>}
        </div>
      </div>
      {action && <div className={actionFluid ? "min-w-0 max-w-full" : "shrink-0"}>{action}</div>}
    </div>
  );
}

/**
 * The page hero: an eyebrow, title and subtitle on the left, an optional metric
 * block on the right, and optional content underneath (progress bar, stats…).
 *
 * `aside` is right-aligned text by default (a headline number). Pass `asideBlock`
 * when the aside is a card or panel of its own instead: the row then centres the
 * two sides and leaves the aside's own alignment alone.
 *
 * `children` is content of the hero's own (a progress bar, stats). `footer` is a
 * hairline-separated strip at the bottom, for a row of things that belong *with* the
 * hero but aren't part of its heading, and would otherwise become another card
 * stacked under it.
 */
export function PageHero({
  eyebrow,
  eyebrowTone = "primary",
  title,
  subtitle,
  aside,
  asideBlock = false,
  children,
  footer,
}: {
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  asideBlock?: boolean;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={card} aria-label={title}>
      <SectionHeading
        eyebrow={eyebrow}
        eyebrowTone={eyebrowTone}
        title={title}
        subtitle={subtitle}
        size="page"
        align={asideBlock ? "center" : "end"}
        gap={asideBlock ? "lg" : "md"}
        actionFluid={asideBlock}
        action={aside && (asideBlock ? aside : <div className="text-right">{aside}</div>)}
      />
      {children && <div className="mt-5">{children}</div>}
      {/* Full-bleed to the card's own edges and tinted, so it reads as the bottom shelf
          OF this card. A hairline alone left it looking like a separate strip that
          happened to land underneath. `-m*-6` matches `card`'s `p-6`. */}
      {footer && (
        <div className="-mx-6 -mb-6 mt-5 rounded-b-2xl border-t border-slate-200/70 bg-slate-50/70 px-6 py-2">
          {footer}
        </div>
      )}
    </section>
  );
}

/**
 * A titled card with an optional numbered step badge, short hint, and an
 * action slot on the right. The step badges turn a page into an obvious
 * 1 → 2 → 3 flow without extra copy.
 *
 * `eyebrow` promotes a panel to a named chapter of the page — the same eyebrow
 * voice the bigger `SectionHeading` sizes use, so a panel can head a section
 * without growing a second heading style.
 */
export function Panel({
  step,
  eyebrow,
  eyebrowTone,
  title,
  hint,
  action,
  className = "",
  children,
}: {
  step?: string | number;
  eyebrow?: string;
  eyebrowTone?: EyebrowTone;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${card} ${className}`}>
      <SectionHeading
        eyebrow={eyebrow}
        eyebrowTone={eyebrowTone}
        title={title}
        subtitle={hint}
        size="panel"
        align="start"
        leading={
          step != null && (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">
              {step}
            </span>
          )
        }
        action={action}
      />
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
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

/**
 * A stat that is going somewhere: label, value, a thin progress bar and a caption.
 * `StatTile` states a number; this one states a number's position on a journey, so
 * it's the tile for anything with a target — hours toward 2,300, competencies
 * achieved, skills signed off.
 *
 * With `to` the whole tile is the link to the detail screen (and needs a router
 * ancestor); without it, it's a plain tile.
 */
export function MetricTile({
  label,
  value,
  caption,
  pct,
  to,
}: {
  label: string;
  value: string;
  caption?: ReactNode;
  /** 0–100; clamped. Omit for a tile with no bar. */
  pct?: number;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {to && (
          <span
            aria-hidden="true"
            className="text-xs text-slate-300 transition group-hover:text-primary-500"
          >
            →
          </span>
        )}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-ink">{value}</div>
      {pct != null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
          <div
            className="h-full rounded-full bg-emerald-500"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
        </div>
      )}
      {caption && <div className="mt-1.5 text-xs text-slate-400">{caption}</div>}
    </>
  );

  const shell = "group block rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60";
  return to ? (
    <Link to={to} className={`${shell} transition hover:ring-primary-200`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
