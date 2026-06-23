import type { ProficiencyStatus } from "../../../domain/types";
import { PROFICIENCY_STATUS_LABEL } from "../../../domain/types";
import { PROFICIENCY_SOURCE } from "../../../data/seed/proficiencies";

/** Pill styling per PAD status — slate (not yet) → amber (developing) → emerald (achieved). */
const STATUS_PILL: Record<ProficiencyStatus, string> = {
  NOT_YET_ACHIEVED: "bg-slate-100 text-slate-600 ring-slate-200",
  DEVELOPING: "bg-amber-50 text-amber-700 ring-amber-100",
  ACHIEVED: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

export function StatusPill({ status }: { status: ProficiencyStatus }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 " +
        STATUS_PILL[status]
      }
    >
      {PROFICIENCY_STATUS_LABEL[status]}
    </span>
  );
}

/** A thin progress bar (0..100). */
export function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-emerald-500 transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/** A small "N evidence" badge for a proficiency row (hidden when zero). */
export function EvidenceBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-100"
      title={`${count} piece${count === 1 ? "" : "s"} of evidence attached`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-3 w-3"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
        />
      </svg>
      {count}
    </span>
  );
}

/** Visible provenance for the seeded proficiency list (the NMC's wording). */
export function SourceCredit() {
  const s = PROFICIENCY_SOURCE;
  return (
    <p className="text-xs leading-relaxed text-slate-400">
      Proficiency statements are the {s.author}'s wording, from{" "}
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-emerald-700"
      >
        {s.title} ({s.edition})
      </a>
      . Retrieved {s.retrievedOn}. Your PAD remains the official signed record.
    </p>
  );
}
