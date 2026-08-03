import { useMemo } from "react";
import { buildOnboardingSteps, type OnboardingStep } from "../logic/onboarding";
import {
  useMedicationLogs,
  usePlacements,
  useProficiencies,
  useReflections,
  useRevision,
  useSelfCare,
  useShifts,
  useSkills,
} from "./hooks";

/**
 * The first-steps checklist, derived from the student's real data (see
 * `logic/onboarding.ts`). Lives in a hook rather than inside the checklist component
 * because two surfaces need the same answer: the checklist renders it, and the nudge
 * strip reads it to avoid saying something the checklist is already saying.
 */
export function useOnboardingSteps(): OnboardingStep[] {
  const { placements } = usePlacements();
  const { shifts } = useShifts();
  const { progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { progress: profProgress } = useProficiencies();
  const { logs: medicationLogs } = useMedicationLogs();
  const { targets, topics, sessions } = useRevision();
  const { checkins } = useSelfCare();

  return useMemo(
    () =>
      buildOnboardingSteps({
        hasPlacement: placements.length > 0,
        hasShift: shifts.length > 0,
        hasLoggedHours: shifts.some((sh) => sh.status === "COMPLETED" || sh.netHours > 0),
        hasSkillProgress: skillProgress.length > 0,
        hasReflection: reflections.length > 0,
        hasCompetencyProgress: profProgress.length > 0,
        hasMedicationLog: medicationLogs.length > 0,
        hasRevisionActivity: targets.length + topics.length + sessions.length > 0,
        hasSelfCareCheckin: checkins.length > 0,
      }),
    [
      placements,
      shifts,
      skillProgress,
      reflections,
      profProgress,
      medicationLogs,
      targets,
      topics,
      sessions,
      checkins,
    ],
  );
}

/**
 * Nudges that repeat an onboarding step, keyed by nudge id (`logic/nudges.ts`) →
 * step id (`logic/onboarding.ts`).
 *
 * The overlap is by design — both answer "what next?" — but while the checklist is on
 * screen the nudge is the second voice saying it, so it gets demoted rather than
 * taking the one visible slot. Nudges with no step here are never demoted.
 */
const NUDGE_TO_STEP: Record<string, string> = {
  placement: "placement",
  "plan-shift": "shift",
  "skill-start": "skill",
  "reflection-start": "reflection",
};

/**
 * Ids of the nudges the visible first-steps checklist already covers — the ones whose
 * matching step is still outstanding. Pass to `NudgeList`'s `demoteIds`.
 */
export function nudgesCoveredByTour(steps: OnboardingStep[]): string[] {
  const outstanding = new Set(steps.filter((s) => !s.done).map((s) => s.id));
  return Object.entries(NUDGE_TO_STEP)
    .filter(([, stepId]) => outstanding.has(stepId))
    .map(([nudgeId]) => nudgeId);
}
