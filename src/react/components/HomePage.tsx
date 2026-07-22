import { Link } from "react-router-dom";
import type { Shift } from "../../domain/types";
import { formatHumanDate, hhmm } from "../../logic/calendar";
import { findCurrentShift, nextShift } from "../../logic/shiftContext";
import { usePlacements, useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { useNudges } from "../useNudges";
import { ActivityLog } from "./ActivityLog";
import { AiRecallTeaser } from "./home/AiRecallTeaser";
import { CatchUpShifts } from "./home/CatchUpShifts";
import { ExampleFlow } from "./home/ExampleFlow";
import { MindmapBand } from "./home/MindmapBand";
import { RegistrationProgress } from "./home/RegistrationProgress";
import { NudgeList } from "./Nudge";
import { btnPrimary, card } from "./ui";

/**
 * Home — the one hub (ethos D6). It answers both questions on a single screen:
 * "what do I do now?" (top: the current/next shift with one-tap capture, quick
 * wins to catch up on, and the natural next step) and "how far to registration?"
 * (the momentum-framed narrative + the connected-record map). No separate
 * Registration screen; each block is the single home for its data.
 */
export function HomePage() {
  const { user } = useRepository();
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const nudges = useNudges();

  if (!user) return <div className="text-sm text-slate-500">Loading…</div>;

  const now = Date.now();
  const current = findCurrentShift(shifts, now);
  const upcoming = nextShift(shifts, now);
  const firstName = user.displayName.trim().split(/\s+/)[0] || "there";
  const showTour = !user.onboardingTourDismissedAt;

  const placeName = new Map(placements.map((p) => [p.id, p.name]));
  const label = (s: Shift) => {
    const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
    const times =
      s.startAt && s.endAt ? ` · ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
    return `${place}${times}`;
  };

  return (
    <div className="space-y-6">
      {/* ---- What now? The one thing to pick up ---- */}
      <section className={card} aria-label="Today">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">Today</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Hi, {firstName}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pick up where you left off — capture as you go, and watch it count.
        </p>

        <div className="mt-5">
          {current ? (
            <div className="flex flex-col gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-xs font-medium text-emerald-700">You're on shift now</span>
                <p className="mt-0.5 text-sm font-medium text-ink">{label(current)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Capture what you see while it's fresh — it all counts.
                </p>
              </div>
              <Link to={`/planner/${current.id}`} className={`${btnPrimary} shrink-0`}>
                Capture now
              </Link>
            </div>
          ) : upcoming ? (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-500">Next shift</span>
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {formatHumanDate(upcoming.date)}
                </p>
                <p className="text-xs text-slate-400">{label(upcoming)}</p>
              </div>
              <Link to={`/planner/${upcoming.id}`} className={`${btnPrimary} shrink-0`}>
                Open shift
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-500">No upcoming shifts</span>
                <p className="mt-0.5 text-sm text-slate-500">
                  Plan your next shift so your hours keep counting.
                </p>
              </div>
              <Link to="/planner" className={`${btnPrimary} shrink-0`}>
                Plan a shift
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Uniform next-step nudges — the canonical prompt surface (logic/nudges.ts). */}
      <NudgeList nudges={nudges} />

      {/* Worked shifts with nothing captured yet — easy wins (renders nothing if none). */}
      <CatchUpShifts />

      {/* New users meet the guided example flow first. */}
      {showTour && <ExampleFlow />}

      {/* ---- How far to registration? The momentum narrative + the connected map ---- */}
      <RegistrationProgress />

      <MindmapBand />

      <AiRecallTeaser />

      <ActivityLog />
    </div>
  );
}
