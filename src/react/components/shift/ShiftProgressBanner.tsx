import { Link, useNavigate } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { isHardShift } from "../../../logic/selfCare";
import { useShifts } from "../../hooks";

/**
 * The celebratory progress moment shown in the modal core the instant a shift is
 * marked worked — the heart of the old post-shift debrief, now inline so you never
 * leave the shift. It names the hours this shift banked, the live running total,
 * and points straight at turning the shift into competency evidence. After a
 * long/heavy shift it adds a gentle self-care nudge.
 */
export function ShiftProgressBanner({ shift, onDismiss }: { shift: Shift; onDismiss: () => void }) {
  const { summary, projection } = useShifts();
  const navigate = useNavigate();
  const pct = Math.round(summary.progressFraction * 100);
  const toGo = projection.shiftsToGo;
  const delta = shift.netHours > 0 ? `+${shift.netHours} h — ` : "";

  return (
    <div className="mb-5 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-emerald-800">Shift logged ✓</p>
          <p className="mt-0.5 text-sm text-emerald-700">
            {delta}that's <strong className="tabular-nums">{summary.practiceHours} h</strong> of{" "}
            {summary.targetHours.toLocaleString()} ({pct}%)
            {toGo != null ? ` — about ${toGo} more shift${toGo === 1 ? "" : "s"} to go` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-emerald-500 transition hover:bg-emerald-100 hover:text-emerald-700"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-emerald-700/80">
        While it's fresh, turn it into progress toward your PAD —{" "}
        <Link
          to={`/planner/${shift.id}/competencies`}
          className="font-medium text-emerald-800 underline-offset-2 hover:underline"
        >
          link the gaps it can evidence
        </Link>
        , or log a medication, skill or reflection in the tabs below.
      </p>

      {isHardShift(shift) && (
        <button
          type="button"
          onClick={() => navigate("/self-care", { state: { prefillShiftId: shift.id } })}
          className="mt-3 flex w-full items-center gap-2 rounded-xl bg-teal-50 px-3.5 py-2.5 text-left text-sm text-teal-900 ring-1 ring-teal-100 transition hover:bg-teal-100/70"
        >
          <span aria-hidden>🌱</span>
          That was a long one — take a moment to check in with yourself.
        </button>
      )}
    </div>
  );
}
