import { SKILL_STAGE_LABEL, type SkillStage } from "../../../domain/types";

/** Pill styling per stage — progression from sky → amber → emerald; slate when unstarted. */
const STAGE_PILL: Record<SkillStage, string> = {
  OBSERVED: "bg-sky-50 text-sky-700 ring-sky-100",
  ASSISTED: "bg-amber-50 text-amber-700 ring-amber-100",
  PERFORMED_UNDER_SUPERVISION: "bg-emerald-50 text-emerald-700 ring-emerald-100",
};

/** The skill's current stage, or a muted "Not started" when there's no progress yet. */
export function SkillStageBadge({ stage }: { stage: SkillStage | null }) {
  const cls = stage ? STAGE_PILL[stage] : "bg-slate-100 text-slate-500 ring-slate-200";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 " +
        cls
      }
    >
      {stage ? SKILL_STAGE_LABEL[stage] : "Not started"}
    </span>
  );
}

/** Solid emerald marker for a signed-off skill — the terminal, permanent state. */
export function SignedOffBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3 w-3"
        aria-hidden="true"
      >
        <path d="m5 13 4 4L19 7" />
      </svg>
      Signed off
    </span>
  );
}
