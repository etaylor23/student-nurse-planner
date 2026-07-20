import { Link, useNavigate } from "react-router-dom";
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
import { NudgeList } from "./Nudge";
import { TopGaps } from "./competencies/TopGaps";
import { SignedOffBadge, SkillStageBadge } from "./skills/shared";
import { PageHero, Panel, btnGhost, btnGhostSm, btnPrimary, link } from "./ui";

/**
 * Home / Today (U2) — the hub landing page. New data of its own; it just mounts the
 * existing hooks/components so cross-surfacing is structural: what's happening now,
 * hours pace, top gaps, skills on the go, and recent activity — the natural phone
 * entry point. `/` redirects here (it's the first enabled nav item).
 */
export function HomePage() {
  const { user } = useRepository();
  const { shifts, summary, projection } = useShifts();
  const { placements } = usePlacements();
  const { skills, progress: skillProgress } = useSkills();
  const navigate = useNavigate();
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
      <PageHero
        eyebrow="Today"
        title={`Hi, ${firstName}`}
        subtitle="Your day at a glance — pick up where you left off, and capture as you go."
        aside={
          <>
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-ink">
              {summary.practiceHours}
              <span className="text-base font-normal text-slate-400">
                {" "}
                / {summary.targetHours.toLocaleString()} h
              </span>
            </div>
            <div className="text-xs font-medium text-emerald-600">{pct}% counted</div>
          </>
        }
      >
        <AiRecallTeaser />
      </PageHero>

      {/* Uniform next-step nudges — the canonical prompt surface (logic/nudges.ts). */}
      <NudgeList nudges={nudges} />

      {/* Two-column dashboard: left = stacked hours / shifts / skills; right =
          the getting-started tour, or recent activity once the tour is hidden. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Left — onboarding mindmap (adjacent to "Your first steps"), then hours pace,
            upcoming shifts, skills in progress, stacked. */}
        <div className="space-y-6">
          {showTour && <MindmapBand />}
          <Panel
            title="Hours pace"
            hint="Counting toward your practice hours"
            action={
              <Link to="/placement-hours" className={btnGhostSm}>
                Hours log
              </Link>
            }
          >
            <div className="text-2xl font-semibold tabular-nums text-ink">
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
          </Panel>

          {current ? (
            <Panel title="On shift now" hint={label(current)}>
              <p className="mb-3 text-sm text-slate-500">
                You're in a shift — capture what you see while it's fresh.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate("/medications/log", { state: { prefillShiftId: current.id } })
                  }
                  className={btnPrimary}
                >
                  Log a medication
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/skills", { state: { prefillShiftId: current.id } })}
                  className={btnGhost}
                >
                  Update a skill
                </button>
                <Link to={`/planner/${current.id}`} className={btnGhost}>
                  Open in planner
                </Link>
              </div>
            </Panel>
          ) : upcoming ? (
            <Panel
              title="Next shift"
              hint={`${formatHumanDate(upcoming.date)} · ${label(upcoming)}`}
            >
              <div className="flex flex-wrap gap-2">
                <Link to={`/planner/${upcoming.id}`} className={btnPrimary}>
                  Open in planner
                </Link>
              </div>
            </Panel>
          ) : (
            <Panel title="No upcoming shifts">
              <p className="text-sm text-slate-500">
                Plan your next shift on the{" "}
                <Link to="/planner" className={link}>
                  weekly planner
                </Link>
                .
              </p>
            </Panel>
          )}

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

      <TopGaps />

      {/* While the tour occupies the right column, activity gets its own full-width row. */}
      {showTour && <ActivityLog />}
    </div>
  );
}
