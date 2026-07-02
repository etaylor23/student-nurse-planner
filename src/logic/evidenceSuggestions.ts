import type {
  EvidenceLink,
  MedicationLog,
  Proficiency,
  ProficiencyProgress,
  Shift,
  Skill,
  SkillProgress,
} from "../domain/types";

/**
 * "You already have evidence for this" — dumb, explainable rules that turn
 * evidence-linking from a chore into recognition. Given a proficiency and the
 * student's activity, surface records they could attach in one click; given a shift,
 * surface the gaps it could plausibly evidence (used by the post-shift debrief, U1).
 *
 * Pure — no repository, fully unit-tested. "Unlinked" always means: no existing
 * `EvidenceLink` for *this* proficiency pointing at that record.
 */

const MAX_MED_LOGS = 5;
const MAX_SHIFTS = 3;
const MAX_SHIFT_GAPS = 3;

/** A proficiency's competence is demonstrated (in part) by drug-calc / med activity. */
function isMedicationRelated(p: Proficiency): boolean {
  return p.platform === 4 || p.code.startsWith("B11");
}

/** Newest-first by ISO date string (descending). */
function byDateDesc<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface EvidenceSuggestion {
  /** Recent unlinked med logs (only for Platform 4 / B11 proficiencies). */
  medLogs: MedicationLog[];
  /** The 1:1 baseline skill (Annexe B only) when it has progress and isn't linked. */
  skill?: { skill: Skill; progress?: SkillProgress };
  /** Recent completed, unlinked shifts (all proficiencies). */
  shifts: Shift[];
}

export interface EvidenceSuggestionInput {
  shifts: Shift[];
  medLogs: MedicationLog[];
  skills: Skill[];
  skillProgress: SkillProgress[];
  links: EvidenceLink[];
}

/** Suggest records the student could attach as evidence for one proficiency. */
export function suggestEvidence(
  proficiency: Proficiency,
  input: EvidenceSuggestionInput,
): EvidenceSuggestion {
  const linkedOfType = (type: EvidenceLink["evidenceType"]) =>
    new Set(
      input.links
        .filter((l) => l.proficiencyId === proficiency.id && l.evidenceType === type)
        .map((l) => l.evidenceId),
    );

  // Med logs — only where medication/drug-calc activity is the relevant evidence.
  const linkedMedLogs = linkedOfType("MED_LOG");
  const medLogs = isMedicationRelated(proficiency)
    ? byDateDesc(input.medLogs.filter((l) => !linkedMedLogs.has(l.id))).slice(0, MAX_MED_LOGS)
    : [];

  // The 1:1 Annexe B skill (skill_<code>) — suggest once it's been started/signed off
  // and isn't already attached here.
  let skill: EvidenceSuggestion["skill"];
  if (proficiency.annexe === "B") {
    const skillId = `skill_${proficiency.code}`;
    const match = input.skills.find((s) => s.id === skillId);
    const progress = input.skillProgress.find((p) => p.skillId === skillId);
    const linkedSkills = linkedOfType("SKILL");
    if (match && progress && !linkedSkills.has(match.id)) {
      skill = { skill: match, progress };
    }
  }

  // Recent completed shifts not yet linked here — relevant to any proficiency.
  const linkedShifts = linkedOfType("SHIFT");
  const shifts = byDateDesc(
    input.shifts.filter((s) => s.status === "COMPLETED" && !linkedShifts.has(s.id)),
  ).slice(0, MAX_SHIFTS);

  return { medLogs, skill, shifts };
}

/** True when a suggestion has anything worth showing. */
export function hasEvidenceSuggestion(s: EvidenceSuggestion): boolean {
  return s.medLogs.length > 0 || !!s.skill || s.shifts.length > 0;
}

export interface ShiftGapInput {
  proficiencies: Proficiency[];
  progress: ProficiencyProgress[];
  links: EvidenceLink[];
  medLogs: MedicationLog[];
}

/**
 * The top gaps a shift could plausibly evidence — the inverse of `suggestEvidence`,
 * for the post-shift debrief (U1). "Gap" is kept simple: any proficiency not yet
 * achieved and not already linked to this shift. When the shift carries med logs,
 * medication-related gaps (Platform 4 / B11) float to the top.
 */
export function suggestProficienciesForShift(shift: Shift, input: ShiftGapInput): Proficiency[] {
  const statusByProf = new Map(input.progress.map((p) => [p.proficiencyId, p.status]));
  const linkedToShift = new Set(
    input.links
      .filter((l) => l.evidenceType === "SHIFT" && l.evidenceId === shift.id)
      .map((l) => l.proficiencyId),
  );
  const shiftHasMeds = input.medLogs.some((l) => l.shiftId === shift.id);

  const candidates = input.proficiencies.filter(
    (p) =>
      (statusByProf.get(p.id) ?? "NOT_YET_ACHIEVED") !== "ACHIEVED" && !linkedToShift.has(p.id),
  );

  const rank = (p: Proficiency): number => {
    const medBoost = shiftHasMeds && isMedicationRelated(p) ? 0 : 1;
    const statusRank =
      (statusByProf.get(p.id) ?? "NOT_YET_ACHIEVED") === "NOT_YET_ACHIEVED" ? 0 : 1;
    return medBoost * 10 + statusRank;
  };
  return [...candidates]
    .sort((a, b) => rank(a) - rank(b) || a.orderIndex - b.orderIndex)
    .slice(0, MAX_SHIFT_GAPS);
}
