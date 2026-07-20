import { useMemo } from "react";
import { deriveNudges, type Nudge } from "../logic/nudges";
import { surfaceGaps } from "../logic/proficiencies";
import { findCurrentShift, nextShift } from "../logic/shiftContext";
import { useRepository } from "./RepositoryContext";
import { usePlacements, useProficiencies, useReflections, useShifts, useSkills } from "./hooks";

/**
 * The one place that computes the app's next-step nudges from live data (see
 * `logic/nudges.ts` for the rules, `components/Nudge.tsx` for the UI). Any surface can
 * call this and render `<NudgeList>` — so nudging is uniform, not per-screen.
 */
export function useNudges(): Nudge[] {
  const { user } = useRepository();
  const { placements } = usePlacements();
  const { shifts } = useShifts();
  const { progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { proficiencies, progress: profProgress, evidenceLinks } = useProficiencies();

  return useMemo(() => {
    if (!user) return [];
    const now = Date.now();
    const current = findCurrentShift(shifts, now);
    const upcoming = nextShift(shifts, now);

    const skillLinked = new Set(
      evidenceLinks.filter((l) => l.evidenceType === "SKILL").map((l) => l.evidenceId),
    );
    const reflLinked = new Set(
      evidenceLinks.filter((l) => l.evidenceType === "REFLECTION").map((l) => l.evidenceId),
    );
    const trackedSkillIds = new Set(skillProgress.map((p) => p.skillId));
    const skillsUnlinked = [...trackedSkillIds].filter((id) => !skillLinked.has(id)).length;
    const reflectionsUnlinked = reflections.filter((r) => !reflLinked.has(r.id)).length;
    const gapsDue = surfaceGaps(proficiencies, profProgress, user).length;

    return deriveNudges({
      hasPlacement: placements.length > 0,
      onShiftId: current?.id,
      hasUpcomingShift: !!upcoming,
      gapsDue,
      skillsUnlinked,
      reflectionsUnlinked,
      hasSkillProgress: skillProgress.length > 0,
      hasReflection: reflections.length > 0,
    });
  }, [user, placements, shifts, skillProgress, reflections, proficiencies, profProgress, evidenceLinks]);
}
