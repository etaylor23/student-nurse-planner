import type {
  EvidenceLink,
  MedicationLog,
  Reflection,
  Shift,
  SkillProgress,
} from "../domain/types";

/**
 * What a shift *counted toward* — the derived, at-a-glance summary shown on the
 * shift itself (ethos D9: a shift is a first-class spine unit that carries its
 * contribution). Everything here is derived from existing records — the shift's
 * own hours, the captures pinned to it (`shiftId`), and the evidence links those
 * feed — so nothing is stored twice and a shift's hours are never double-counted.
 */
export interface ShiftContribution {
  /** The shift's counted hours (only counts once it's COMPLETED). */
  netHours: number;
  /** True once the shift is marked worked — its hours are counting. */
  counted: boolean;
  /** Distinct proficiencies this shift feeds: linked directly + via its captures. */
  proficienciesEvidenced: number;
  /** Clinical skills recorded/signed off on this shift. */
  skills: number;
  /** Reflections written on this shift. */
  reflections: number;
  /** Medications logged on this shift. */
  medLogs: number;
  /** True when the shift has produced nothing yet (a bare planned shift). */
  isEmpty: boolean;
}

export interface ShiftContributionInput {
  evidenceLinks: EvidenceLink[];
  skillProgress: SkillProgress[];
  reflections: Reflection[];
  medLogs: MedicationLog[];
}

/**
 * Derive a shift's contribution. A proficiency counts as "evidenced" by the shift
 * when the shift is linked to it directly (a SHIFT evidence link) *or* when a
 * capture pinned to the shift — a signed-off skill, a reflection, a med log — is
 * itself linked to it. Counted once per proficiency (a Set), never per capture.
 */
export function shiftContribution(
  shift: Shift,
  { evidenceLinks, skillProgress, reflections, medLogs }: ShiftContributionInput,
): ShiftContribution {
  const counted = shift.status === "COMPLETED";
  const netHours = counted ? shift.netHours : 0;

  // Ids of the captures pinned to this shift, by evidence type.
  const skillIds = new Set(
    skillProgress.filter((p) => p.shiftId === shift.id).map((p) => p.skillId),
  );
  const reflectionIds = new Set(reflections.filter((r) => r.shiftId === shift.id).map((r) => r.id));
  const medLogIds = new Set(medLogs.filter((l) => l.shiftId === shift.id).map((l) => l.id));

  // Distinct proficiencies fed by the shift itself or anything captured on it.
  const proficiencyIds = new Set<string>();
  for (const link of evidenceLinks) {
    const feeds =
      (link.evidenceType === "SHIFT" && link.evidenceId === shift.id) ||
      (link.evidenceType === "SKILL" && skillIds.has(link.evidenceId)) ||
      (link.evidenceType === "REFLECTION" && reflectionIds.has(link.evidenceId)) ||
      (link.evidenceType === "MED_LOG" && medLogIds.has(link.evidenceId));
    if (feeds) proficiencyIds.add(link.proficiencyId);
  }

  const proficienciesEvidenced = proficiencyIds.size;
  const skills = skillIds.size;
  const reflectionsCount = reflectionIds.size;
  const medLogsCount = medLogIds.size;

  return {
    netHours,
    counted,
    proficienciesEvidenced,
    skills,
    reflections: reflectionsCount,
    medLogs: medLogsCount,
    isEmpty:
      netHours === 0 &&
      proficienciesEvidenced === 0 &&
      skills === 0 &&
      reflectionsCount === 0 &&
      medLogsCount === 0,
  };
}
