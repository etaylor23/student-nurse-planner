import { Link } from "react-router-dom";
import type { Shift } from "../../domain/types";
import { formatHumanDate, hhmm } from "../../logic/calendar";
import { findCurrentShift, nextShift } from "../../logic/shiftContext";
import { usePlacements, useShifts, useSkills } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { useNudges } from "../useNudges";
import { ActivityLog } from "./ActivityLog";
import { ExampleFlow } from "./home/ExampleFlow";
import { AiRecallTeaser } from "./home/AiRecallTeaser";
import { MindmapBand } from "./home/MindmapBand";
import { RegistrationProgress } from "./home/RegistrationProgress";
import { NudgeList } from "./Nudge";
import { TopGaps } from "./competencies/TopGaps";
import { SignedOffBadge, SkillStageBadge } from "./skills/shared";
import { Panel, btnGhostSm, btnPrimary, card } from "./ui";

/**
 * Home / Today (U2) — the hub landing page. New data of its own; it just mounts the
 * existing hooks/components so cross-surfacing is structural: what's happening now,
 * hours pace, top gaps, skills on the go, and recent activity — the natural phone
 * entry point. `/` redirects here (it's the first enabled nav item).
 *
 * The "Toward registration" narrative (`RegistrationProgress`) sits just above the
 * top competency gaps — grouped with the competency-progress content.
 */
export function HomePage() {
  const { user } = useRepository();
  const { shifts, summary, projection } = useShifts();
  const { placements } = usePlacements();
  const { skills, progress: skillProgress } = useSkills();
  const nudges = useNudges();

  const placeName = new Map(placements.map((p) => [p.id, p.name]));
  const skillName = new Map(skills.map((s) => [s.id, s.name]));
  const label = (s: Shift) => {
    const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
    const times =
      s.startAt && s.endAt ? ` · ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
    return `${place}${times}`;
  };

  if (!user) return <div className="text-sm text-slate-500">Loading…</div>;

  const now = Date.now();
  const current = findCurrentShift(shifts, now);
  const upcoming = nextShift(shifts, now);
  const pct = Math.round(summary.progressFraction * 100);

  const inProgress = skillProgress.filter((p) => !p.signedOff);
  const recentSkills = [...skillProgress]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 3);

  const firstName = user.displayName.trim().split(/\s+/)[0] || "there";
  const showTour = !user.onboardingTourDismissedAt;

  return (
    <div className="space-y-6">
      {/* Top bar — the greeting, hours pace and next shift merged into one above-
          the-fold band (hours pace + next shift used to be separate left-column
          panels; the hero's hours metric was a duplicate of hours pace). */}
      <section className={card} aria-label="Today">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-stretch xl:justify-between">
          <div className="min-w-0 xl:max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              Today
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Hi, {firstName}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Your day at a glance — pick up where you left off, and capture as you go.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:shrink-0">
            {/* Hours pace */}
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:min-w-[15rem]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-500">Hours pace</span>
                <Link to="/placement-hours" className={btnGhostSm}>
                  Hours log
                </Link>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                {summary.practiceHours}
                <span className="text-base font-normal text-slate-400">
                  {" "}
                  / {summary.targetHours.toLocaleString()} h
                </span>
              </div>
              <div className="text-sm font-medium text-emerald-600">{pct}% complete</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              {projection.shiftsToGo != null && (
                <p className="mt-2 text-xs text-slate-400">
                  ≈ {projection.shiftsToGo.toLocaleString()} shifts to go
                </p>
              )}
            </div>

            {/* Next shift / on shift now */}
            <div className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:min-w-[15rem]">
              {current ? (
                <>
                  <span className="text-xs font-medium text-slate-500">On shift now</span>
                  <p className="mt-1 text-sm font-medium text-ink">{label(current)}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Capture what you see while it's fresh.
                  </p>
                  <Link to={`/planner/${current.id}`} className={`${btnPrimary} mt-3`}>
                    Open in planner
                  </Link>
                </>
              ) : upcoming ? (
                <>
                  <span className="text-xs font-medium text-slate-500">Next shift</span>
                  <p className="mt-1 text-sm font-medium text-ink">
                    {formatHumanDate(upcoming.date)}
                  </p>
                  <p className="text-xs text-slate-400">{label(upcoming)}</p>
                  <Link to={`/planner/${upcoming.id}`} className={`${btnPrimary} mt-3`}>
                    Open in planner
                  </Link>
                </>
              ) : (
                <>
                  <span className="text-xs font-medium text-slate-500">Next shift</span>
                  <p className="mt-1 text-sm text-slate-500">No upcoming shifts.</p>
                  <Link to="/planner" className={`${btnPrimary} mt-3`}>
                    Plan a shift
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <AiRecallTeaser />
        </div>
      </section>

      {/* Uniform next-step nudges — the canonical prompt surface (logic/nudges.ts). */}
      <NudgeList nudges={nudges} />

      {/* Two-column dashboard: left = the connected-record mindmap + skills; right =
          the getting-started tour, or recent activity once the tour is hidden.
          (Hours pace + next shift now live in the top bar.) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Left — the live "connected record" mindmap (always on), then skills. */}
        <div className="space-y-6">
          <MindmapBand />

          <Panel
            title="Skills in progress"
            hint={`${inProgress.length} on the go`}
            action={
              <Link to="/skills" className={btnGhostSm}>
                All skills
              </Link>
            }
          >
            {recentSkills.length === 0 ? (
              <p className="text-sm text-slate-400">No skills started yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentSkills.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/skills/${p.skillId}`}
                      className="flex items-center gap-2 py-2.5 transition first:pt-0 last:pb-0 hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {skillName.get(p.skillId) ?? "Skill"}
                      </span>
                      {p.signedOff ? <SignedOffBadge /> : <SkillStageBadge stage={p.stage} />}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Right — the getting-started tour, or recent activity once it's hidden.
            When the tour exists, `order-first` floats it above the left column on
            mobile (single-column) so new users meet the guide first; `lg:order-none`
            restores source order (left, then right) once the two columns appear. */}
        <div className={`space-y-6 ${showTour ? "order-first lg:order-none" : ""}`}>
          {showTour ? <ExampleFlow /> : <ActivityLog />}
        </div>
      </div>

      {/* The "how far to registration?" narrative — grouped with the competency
          progress it introduces (the top gaps below). */}
      <RegistrationProgress />

      <TopGaps />

      {/* While the tour occupies the right column, activity gets its own full-width row. */}
      {showTour && <ActivityLog />}
    </div>
  );
}
