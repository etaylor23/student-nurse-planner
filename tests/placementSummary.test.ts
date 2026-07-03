import { describe, expect, it } from "vitest";
import { summarisePlacement } from "../src/logic/placementSummary";
import type {
  EvidenceLink,
  MedicationLog,
  Reflection,
  Shift,
  SkillProgress,
} from "../src/domain/types";

const shift = (p: Partial<Shift> & Pick<Shift, "id">): Shift => ({
  userId: "u",
  createdAt: "",
  updatedAt: "",
  date: "2026-06-01",
  shiftType: "LONG_DAY",
  entryMode: "RAW",
  netHours: 10,
  isSimulated: false,
  status: "COMPLETED",
  ...p,
});

const medLog = (p: Partial<MedicationLog> & Pick<MedicationLog, "id" | "date">): MedicationLog => ({
  userId: "u",
  createdAt: "",
  type: "OBSERVED",
  ...p,
});

const link = (evidenceId: string, proficiencyId: string): EvidenceLink => ({
  id: `${proficiencyId}-${evidenceId}`,
  userId: "u",
  proficiencyId,
  evidenceType: "SHIFT",
  evidenceId,
  createdAt: "",
});

const skillProgress = (
  p: Partial<SkillProgress> & Pick<SkillProgress, "id" | "skillId">,
): SkillProgress => ({
  userId: "u",
  stage: "PERFORMED_UNDER_SUPERVISION",
  signedOff: true,
  updatedAt: "",
  ...p,
});

const reflection = (p: Partial<Reflection> & Pick<Reflection, "id">): Reflection => ({
  userId: "u",
  title: "R",
  model: "GIBBS",
  isLocked: false,
  piiAcknowledged: true,
  createdAt: "",
  updatedAt: "",
  ...p,
});

const EMPTY = {
  shifts: [],
  medLogs: [],
  evidenceLinks: [],
  skillProgress: [],
  reflections: [],
};

describe("summarisePlacement", () => {
  const shifts = [
    shift({ id: "a", placementId: "p1", date: "2026-06-10", netHours: 11, status: "COMPLETED" }),
    shift({ id: "b", placementId: "p1", date: "2026-06-01", netHours: 8, status: "COMPLETED" }),
    shift({ id: "c", placementId: "p1", date: "2026-06-20", netHours: 12, status: "PLANNED" }),
    shift({ id: "x", placementId: "p2", date: "2026-06-05", netHours: 9 }),
  ];

  it("aggregates hours, count and date span for the placement's shifts only", () => {
    const s = summarisePlacement("p1", { ...EMPTY, shifts });
    expect(s.shiftCount).toBe(3);
    expect(s.countedHours).toBe(19); // 11 + 8 (completed only)
    expect(s.plannedHours).toBe(12);
    expect(s.dateSpan).toEqual({ from: "2026-06-01", to: "2026-06-20" });
    expect(s.shifts.map((x) => x.id)).toEqual(["c", "a", "b"]); // newest-first
  });

  it("collects meds, evidenced proficiencies, signed-off skills and reflections via the shifts", () => {
    const s = summarisePlacement("p1", {
      shifts,
      medLogs: [
        medLog({ id: "m1", date: "2026-06-10", shiftId: "a" }),
        medLog({ id: "m2", date: "2026-06-05", shiftId: "x" }), // other placement's shift
        medLog({ id: "m3", date: "2026-06-01", shiftId: undefined }), // unlinked
      ],
      evidenceLinks: [
        link("a", "prof_1.1"),
        link("b", "prof_1.1"), // dup proficiency across two shifts → deduped
        link("x", "prof_9.9"), // other placement
        { ...link("a", "prof_2.2"), evidenceType: "MED_LOG" }, // not a SHIFT link
      ],
      skillProgress: [
        skillProgress({ id: "sp1", skillId: "skill_B2.1", shiftId: "a" }),
        skillProgress({ id: "sp2", skillId: "skill_B2.2", shiftId: "x" }), // other placement
        skillProgress({ id: "sp3", skillId: "skill_B2.3", shiftId: "b", signedOff: false }), // not signed off
      ],
      reflections: [
        reflection({ id: "r1", shiftId: "a" }),
        reflection({ id: "r2", shiftId: "x" }), // other placement's shift
        reflection({ id: "r3", shiftId: undefined }), // not linked to a shift
      ],
    });
    expect(s.medLogs.map((m) => m.id)).toEqual(["m1"]);
    expect(s.proficiencyIds).toEqual(["prof_1.1"]);
    expect(s.signedOffSkillIds).toEqual(["skill_B2.1"]);
    expect(s.reflectionIds).toEqual(["r1"]);
  });

  it("returns empty aggregates when the placement has no shifts", () => {
    const s = summarisePlacement("nope", { ...EMPTY, shifts });
    expect(s.shiftCount).toBe(0);
    expect(s.dateSpan).toBeNull();
    expect(s.countedHours).toBe(0);
  });
});
