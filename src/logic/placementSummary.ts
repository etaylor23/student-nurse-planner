import type {
  EvidenceLink,
  MedicationLog,
  Reflection,
  Shift,
  SkillProgress,
} from "../domain/types";

/**
 * "What did this placement give me?" (U3) — the in-memory joins that reframe a
 * placement from a name on a timesheet into a container of growth: its shifts and
 * hours, the meds seen there, the proficiencies it evidenced, and the skills signed
 * off in it. Everything hangs off the shift → placement link and the universal
 * `shiftId` capture join. Pure + unit-tested; the page resolves ids to names/labels.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PlacementSummary {
  shifts: Shift[]; // shifts at this placement, newest-first
  shiftCount: number;
  countedHours: number; // netHours of COMPLETED shifts here
  plannedHours: number; // netHours of PLANNED shifts here
  dateSpan: { from: string; to: string } | null; // earliest → latest shift date
  medLogs: MedicationLog[]; // logs whose shift is at this placement, newest-first
  proficiencyIds: string[]; // distinct proficiencies evidenced via SHIFT links to these shifts
  signedOffSkillIds: string[]; // distinct skills signed off in these shifts (SkillProgress.shiftId)
  reflectionIds: string[]; // distinct reflections written about these shifts (Reflection.shiftId)
}

export interface PlacementSummaryInput {
  shifts: Shift[];
  medLogs: MedicationLog[];
  evidenceLinks: EvidenceLink[];
  skillProgress: SkillProgress[];
  reflections: Reflection[];
}

/** Aggregate everything that happened at one placement, via its shifts. */
export function summarisePlacement(
  placementId: string,
  input: PlacementSummaryInput,
): PlacementSummary {
  const shifts = input.shifts
    .filter((s) => s.placementId === placementId)
    .sort((a, b) =>
      a.date !== b.date
        ? a.date < b.date
          ? 1
          : -1
        : (b.startAt ?? "").localeCompare(a.startAt ?? ""),
    );
  const shiftIds = new Set(shifts.map((s) => s.id));

  let countedHours = 0;
  let plannedHours = 0;
  for (const s of shifts) {
    if (s.status === "COMPLETED") countedHours += s.netHours;
    else plannedHours += s.netHours;
  }

  const dates = shifts.map((s) => s.date);
  const dateSpan =
    dates.length > 0
      ? {
          from: dates.reduce((a, b) => (a < b ? a : b)),
          to: dates.reduce((a, b) => (a > b ? a : b)),
        }
      : null;

  const medLogs = input.medLogs
    .filter((l) => l.shiftId != null && shiftIds.has(l.shiftId))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const proficiencyIds = [
    ...new Set(
      input.evidenceLinks
        .filter((l) => l.evidenceType === "SHIFT" && shiftIds.has(l.evidenceId))
        .map((l) => l.proficiencyId),
    ),
  ];

  const signedOffSkillIds = [
    ...new Set(
      input.skillProgress
        .filter((p) => p.signedOff && p.shiftId != null && shiftIds.has(p.shiftId))
        .map((p) => p.skillId),
    ),
  ];

  const reflectionIds = [
    ...new Set(
      input.reflections
        .filter((r) => r.shiftId != null && shiftIds.has(r.shiftId))
        .map((r) => r.id),
    ),
  ];

  return {
    shifts,
    shiftCount: shifts.length,
    countedHours: round2(countedHours),
    plannedHours: round2(plannedHours),
    dateSpan,
    medLogs,
    proficiencyIds,
    signedOffSkillIds,
    reflectionIds,
  };
}
