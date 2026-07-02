import { describe, expect, it } from "vitest";
import {
  hasEvidenceSuggestion,
  suggestEvidence,
  suggestProficienciesForShift,
} from "../src/logic/evidenceSuggestions";
import type {
  EvidenceLink,
  MedicationLog,
  Proficiency,
  ProficiencyProgress,
  ProficiencyStatus,
  Shift,
  Skill,
  SkillProgress,
} from "../src/domain/types";

const prof = (p: Partial<Proficiency> & Pick<Proficiency, "id" | "code">): Proficiency => ({
  platform: 0,
  platformTitle: "",
  annexe: "NONE",
  statement: "",
  orderIndex: 0,
  ...p,
});

const shift = (p: Partial<Shift> & Pick<Shift, "id">): Shift => ({
  userId: "u",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  date: "2026-06-01",
  shiftType: "LONG_DAY",
  entryMode: "RAW",
  netHours: 11.5,
  isSimulated: false,
  status: "COMPLETED",
  ...p,
});

const medLog = (p: Partial<MedicationLog> & Pick<MedicationLog, "id" | "date">): MedicationLog => ({
  userId: "u",
  createdAt: "2026-01-01T00:00:00.000Z",
  type: "OBSERVED",
  ...p,
});

const skill = (id: string): Skill => ({
  id,
  userId: null,
  name: id,
  category: "c",
  source: "ANNEXE_B",
  orderIndex: 0,
});

const skillProgress = (skillId: string): SkillProgress => ({
  id: "sp_" + skillId,
  userId: "u",
  skillId,
  stage: "ASSISTED",
  signedOff: false,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const link = (
  proficiencyId: string,
  evidenceType: EvidenceLink["evidenceType"],
  evidenceId: string,
): EvidenceLink => ({
  id: `${proficiencyId}-${evidenceId}`,
  userId: "u",
  proficiencyId,
  evidenceType,
  evidenceId,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const progress = (proficiencyId: string, status: ProficiencyStatus): ProficiencyProgress => ({
  id: "pp_" + proficiencyId,
  userId: "u",
  proficiencyId,
  status,
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const EMPTY = { shifts: [], medLogs: [], skills: [], skillProgress: [], links: [] };

describe("suggestEvidence", () => {
  it("suggests up to 5 most-recent unlinked med logs for a Platform 4 proficiency", () => {
    const p = prof({ id: "prof_4.1", code: "4.1", platform: 4 });
    const logs = Array.from({ length: 6 }, (_, i) =>
      medLog({ id: "log" + i, date: `2026-06-0${i + 1}` }),
    );
    const s = suggestEvidence(p, {
      ...EMPTY,
      medLogs: logs,
      links: [link("prof_4.1", "MED_LOG", "log5")], // newest is already linked
    });
    expect(s.medLogs).toHaveLength(5);
    expect(s.medLogs.map((l) => l.id)).not.toContain("log5"); // linked excluded
    expect(s.medLogs[0].id).toBe("log4"); // newest remaining, date-desc
    expect(s.skill).toBeUndefined();
  });

  it("suggests no med logs for a non-medication proficiency", () => {
    const p = prof({ id: "prof_1.1", code: "1.1", platform: 1 });
    const s = suggestEvidence(p, { ...EMPTY, medLogs: [medLog({ id: "l", date: "2026-06-01" })] });
    expect(s.medLogs).toHaveLength(0);
  });

  it("suggests the 1:1 Annexe B skill when it has progress and isn't linked", () => {
    const p = prof({ id: "prof_B2.1", code: "B2.1", annexe: "B" });
    const s = suggestEvidence(p, {
      ...EMPTY,
      skills: [skill("skill_B2.1")],
      skillProgress: [skillProgress("skill_B2.1")],
    });
    expect(s.skill?.skill.id).toBe("skill_B2.1");
    expect(s.skill?.progress?.stage).toBe("ASSISTED");
  });

  it("does not suggest the skill when it has no progress, or is already linked", () => {
    const p = prof({ id: "prof_B2.1", code: "B2.1", annexe: "B" });
    // no progress
    expect(suggestEvidence(p, { ...EMPTY, skills: [skill("skill_B2.1")] }).skill).toBeUndefined();
    // already linked
    expect(
      suggestEvidence(p, {
        ...EMPTY,
        skills: [skill("skill_B2.1")],
        skillProgress: [skillProgress("skill_B2.1")],
        links: [link("prof_B2.1", "SKILL", "skill_B2.1")],
      }).skill,
    ).toBeUndefined();
  });

  it("suggests BOTH med logs and the skill for a B11 proficiency", () => {
    const p = prof({ id: "prof_B11.4", code: "B11.4", annexe: "B" });
    const s = suggestEvidence(p, {
      ...EMPTY,
      medLogs: [medLog({ id: "l1", date: "2026-06-01" })],
      skills: [skill("skill_B11.4")],
      skillProgress: [skillProgress("skill_B11.4")],
    });
    expect(s.medLogs).toHaveLength(1);
    expect(s.skill?.skill.id).toBe("skill_B11.4");
  });

  it("suggests up to 3 recent completed unlinked shifts (not planned/linked)", () => {
    const p = prof({ id: "prof_1.1", code: "1.1", platform: 1 });
    const shifts = [
      shift({ id: "s1", date: "2026-06-01" }),
      shift({ id: "s2", date: "2026-06-05" }),
      shift({ id: "s3", date: "2026-06-03" }),
      shift({ id: "s4", date: "2026-06-04", status: "PLANNED" }),
      shift({ id: "s5", date: "2026-06-06" }),
    ];
    const s = suggestEvidence(p, {
      ...EMPTY,
      shifts,
      links: [link("prof_1.1", "SHIFT", "s5")], // newest completed already linked
    });
    expect(s.shifts.map((x) => x.id)).toEqual(["s2", "s3", "s1"]); // date-desc, no planned/linked
  });

  it("hasEvidenceSuggestion reflects emptiness", () => {
    expect(hasEvidenceSuggestion({ medLogs: [], shifts: [] })).toBe(false);
    expect(hasEvidenceSuggestion({ medLogs: [medLog({ id: "l", date: "x" })], shifts: [] })).toBe(
      true,
    );
  });
});

describe("suggestProficienciesForShift", () => {
  const p4 = prof({ id: "prof_4.1", code: "4.1", platform: 4, orderIndex: 40 });
  const p1 = prof({ id: "prof_1.1", code: "1.1", platform: 1, orderIndex: 1 });
  const p2 = prof({ id: "prof_2.1", code: "2.1", platform: 2, orderIndex: 20 });
  const achieved = prof({ id: "prof_3.1", code: "3.1", platform: 3, orderIndex: 30 });
  const proficiencies = [p1, p2, achieved, p4];

  it("returns non-achieved, non-shift-linked proficiencies, max 3", () => {
    const result = suggestProficienciesForShift(shift({ id: "s1" }), {
      proficiencies,
      progress: [progress("prof_3.1", "ACHIEVED")],
      links: [link("prof_1.1", "SHIFT", "s1")], // already linked to this shift
      medLogs: [],
    });
    const ids = result.map((p) => p.id);
    expect(ids).not.toContain("prof_3.1"); // achieved excluded
    expect(ids).not.toContain("prof_1.1"); // already linked excluded
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("floats medication-related gaps to the top when the shift has med logs", () => {
    const result = suggestProficienciesForShift(shift({ id: "s1" }), {
      proficiencies,
      progress: [],
      links: [],
      medLogs: [medLog({ id: "l", date: "2026-06-01", shiftId: "s1" })],
    });
    expect(result[0].id).toBe("prof_4.1"); // med-related boosted above lower orderIndex gaps
  });
});
