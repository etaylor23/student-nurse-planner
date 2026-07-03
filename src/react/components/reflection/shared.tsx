import type { GibbsCompleteness } from "../../../logic/gibbs";

/** A muted "Gibbs" chip — the reflective model marker (v1 is Gibbs-only). */
export function ModelBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      Gibbs cycle
    </span>
  );
}

/** A lock marker for a private reflection. */
export function LockBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-white">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      Locked
    </span>
  );
}

/** Small "n/6 stages" completeness bar — turns the six Gibbs stages into visible progress. */
export function CompletenessMeter({ completeness }: { completeness: GibbsCompleteness }) {
  const pct = Math.round(completeness.fraction * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={
            "h-full rounded-full " + (completeness.complete ? "bg-emerald-500" : "bg-emerald-400")
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-slate-400">
        {completeness.filled}/{completeness.total} stages
      </span>
    </div>
  );
}

/** Render tag labels as small chips. */
export function TagPills({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-100"
        >
          #{label}
        </span>
      ))}
    </div>
  );
}
