import {
  REVISION_CONFIDENCE_MAX,
  type RevisionMethod,
  REVISION_METHOD_LABEL,
} from "../../../domain/types";

/** Colour for a confidence value (1–2 weak → amber/rose, 3 → amber, 4–5 → emerald). */
function confidenceTone(c: number): string {
  if (c <= 2) return "bg-rose-400";
  if (c === 3) return "bg-amber-400";
  return "bg-emerald-500";
}

/** Read-only confidence dots (n/5). */
export function ConfidenceDots({ confidence }: { confidence: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Confidence ${confidence} of 5`}>
      {Array.from({ length: REVISION_CONFIDENCE_MAX }, (_, i) => (
        <span
          key={i}
          className={
            "h-2 w-2 rounded-full " + (i < confidence ? confidenceTone(confidence) : "bg-slate-200")
          }
        />
      ))}
    </span>
  );
}

/** Interactive 1–5 confidence rating. */
export function ConfidenceRating({
  value,
  onChange,
}: {
  value?: number;
  onChange: (c: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      {Array.from({ length: REVISION_CONFIDENCE_MAX }, (_, i) => i + 1).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Set confidence ${c}`}
          aria-pressed={value === c}
          className={
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ring-1 transition " +
            (value != null && c <= value
              ? "text-white " + confidenceTone(value) + " ring-transparent"
              : "bg-white text-slate-400 ring-slate-200 hover:bg-slate-50")
          }
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** A muted method chip (Spaced repetition / Weekly block / Pomodoro). */
export function MethodBadge({ method }: { method: RevisionMethod }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {REVISION_METHOD_LABEL[method]}
    </span>
  );
}

/** A relative-days countdown badge for a target date. Tone sharpens as it nears. */
export function Countdown({ days }: { days: number }) {
  const tone =
    days < 0
      ? "bg-slate-100 text-slate-500 ring-slate-200"
      : days <= 7
        ? "bg-rose-50 text-rose-700 ring-rose-100"
        : days <= 21
          ? "bg-amber-50 text-amber-700 ring-amber-100"
          : "bg-emerald-50 text-emerald-700 ring-emerald-100";
  const label =
    days < 0
      ? `${Math.abs(days)}d ago`
      : days === 0
        ? "Today"
        : days === 1
          ? "Tomorrow"
          : `in ${days} days`;
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 " +
        tone
      }
    >
      {label}
    </span>
  );
}
