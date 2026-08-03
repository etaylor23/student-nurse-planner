import { findCurrentShift, nextShift } from "../../logic/shiftContext";
import { onboardingProgress } from "../../logic/onboarding";
import { usePlacements, useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { useNudges } from "../useNudges";
import { nudgesCoveredByTour, useOnboardingSteps } from "../useOnboardingSteps";
import { ActivityDigest } from "./home/ActivityDigest";
import { HowItWorksBand } from "./home/HowItWorksBand";
import { NextShiftCard } from "./home/NextShiftCard";
import { RegistrationProgress } from "./home/RegistrationProgress";
import { SkillsInProgress } from "./home/SkillsInProgress";
import { NudgeList } from "./Nudge";
import { TopGaps } from "./competencies/TopGaps";
import { PageHero } from "./ui";

/**
 * Home / Today — the hub landing page, restructured per `spec-home-redesign.md`.
 *
 * The page is four chapters in a fixed order, each opened by an eyebrow + title in the
 * same voice, so it reads as one story rather than a grid of sibling cards:
 *
 *   1. TODAY               — greeting, and the one next action.
 *   2. YOUR PROGRESS       — the single progress story, then skills | top gaps.
 *   3. HOW PLACEMATE WORKS — the mindmap and the first-steps checklist, merged.
 *   4. YOUR RECORD         — an activity digest, full log one click away.
 *
 * The returning student is the spine (decision 1): the first thing on the page answers
 * "what should I do next?", and the teaching material sits below the progress it
 * explains. First-run mechanisms are all kept, just consolidated into chapter 3.
 *
 * No data of its own — it mounts the existing hooks and components, so cross-surfacing
 * is structural.
 */
export function HomePage() {
  const { user } = useRepository();
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const nudges = useNudges();
  const steps = useOnboardingSteps();

  if (!user) return <div className="text-sm text-slate-500">Loading…</div>;

  const now = Date.now();
  const current = findCurrentShift(shifts, now);
  const upcoming = nextShift(shifts, now);

  const firstName = user.displayName.trim().split(/\s+/)[0] || "there";

  // While the first-steps checklist is on screen it is already making the case for the
  // steps that are still outstanding, so the nudges repeating them are demoted into the
  // collapsed queue rather than taking the one visible slot (decision 6).
  //
  // Demotion, not suppression: on day one *every* nudge duplicates a step, and hiding
  // them all would leave a strip with nothing in it. Demoting means a non-duplicate wins
  // the visible slot whenever one exists, and the mockup's first-run state — one
  // duplicate visible, the rest collapsed — is what you get when none does.
  const { allDone } = onboardingProgress(steps);
  const tourVisible = !user.onboardingTourDismissedAt && !allDone;

  return (
    // A flex column, not `space-y-6`: the mobile reorder below needs `order-*`, which
    // only applies to flex/grid children — and `space-y` would put its margins in DOM
    // order rather than visual order once things move.
    <div className="flex flex-col gap-6">
      {/* ---------- 1 · TODAY ---------- */}
      <PageHero
        eyebrow="Today"
        title={`Hi, ${firstName}`}
        subtitle="Your day at a glance — pick up where you left off, and capture as you go."
        asideBlock
        aside={<NextShiftCard current={current} upcoming={upcoming} placements={placements} />}
      />

      {/* One suggestion visible, the queue collapsed beneath it (decision 6). */}
      <NudgeList
        nudges={nudges}
        max={4}
        collapseAfter={1}
        demoteIds={tourVisible ? nudgesCoveredByTour(steps) : undefined}
      />

      {/* ---------- 2 · YOUR PROGRESS ---------- */}
      {/* On mobile, chapter 3 floats above this while the tour is showing, so a new
          user meets the guide before the progress it explains. `lg:order-none`
          restores source order once there's room for two columns. */}
      <div className={`space-y-6 ${tourVisible ? "order-2 lg:order-none" : ""}`}>
        <RegistrationProgress />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
          <SkillsInProgress />
          <TopGaps />
        </div>
      </div>

      {/* ---------- 3 · HOW PLACEMATE WORKS ---------- */}
      <div className={tourVisible ? "order-1 lg:order-none" : ""}>
        <HowItWorksBand />
      </div>

      {/* ---------- 4 · YOUR RECORD ---------- */}
      <div className={tourVisible ? "order-3 lg:order-none" : ""}>
        <ActivityDigest />
      </div>
    </div>
  );
}
