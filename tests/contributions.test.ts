import { describe, expect, it } from "vitest";
import { shiftContribution } from "../src/logic/contributions";
import type {
  EvidenceLink,
  MedicationLog,
  Reflection,
  Shift,
  SkillProgress,
} from "../src/domain/types";

function shift(partial: Partial<Shift>): Shift {
  return {
    id: "shift1",
    userId: "u",
    date: "2026-01-01",
    shiftType: "LONG_DAY",
    entryMode: "NET",
    netHours: 12,
    isSimulated: false,
    status: "COMPLETED",
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function link(partial: Partial<EvidenceLink>): EvidenceLink {
  return {
    id: partial.id ?? "l",
    userId: "u",
    proficiencyId: "p1",
    evidenceType: "SHIFT",
    evidenceId: "shift1",
    createdAt: "",
    ...partial,
  };
}

function skill(partial: Partial<SkillProgress>): SkillProgress {
  return {
    id: partial.id ?? "sp",
    userId: "u",
    skillId: partial.skillId ?? "sk1",
    stage: "PERFORMED_UNDER_SUPERVISION",
    signedOff: true,
    updatedAt: "",
    ...partial,
  } as SkillProgress;
}

function reflection(partial: Partial<Reflection>): Reflection {
  return {
    id: partial.id ?? "r",
    userId: "u",
    title: "R",
    model: "GIBBS",
    isLocked: false,
    createdAt: "",
    updatedAt: "",
    ...partial,
  } as Reflection;
}

function medLog(partial: Partial<MedicationLog>): MedicationLog {
  return {
    id: partial.id ?? "ml",
    userId: "u",
    type: "OBSERVED",
    date: "2026-01-01",
    createdAt: "",
    ...partial,
  } as MedicationLog;
}

const empty = { evidenceLinks: [], skillProgress: [], reflections: [], medLogs: [] };

describe("shiftContribution", () => {
  it("counts hours only once the shift is completed", () => {
    expect(shiftContribution(shift({ status: "COMPLETED", netHours: 12 }), empty).netHours).toBe(
      12,
    );
    const planned = shiftContribution(shift({ status: "PLANNED", netHours: 12 }), empty);
    expect(planned.netHours).toBe(0);
    expect(planned.counted).toBe(false);
  });

  it("flags a bare shift with nothing captured as empty", () => {
    expect(shiftContribution(shift({ status: "PLANNED", netHours: 0 }), empty).isEmpty).toBe(true);
    expect(shiftContribution(shift({ status: "COMPLETED", netHours: 12 }), empty).isEmpty).toBe(
      false,
    );
  });

  it("counts captures pinned to the shift by shiftId", () => {
    const c = shiftContribution(shift({ id: "shift1" }), {
      evidenceLinks: [],
      skillProgress: [
        skill({ id: "a", skillId: "sk1", shiftId: "shift1" }),
        skill({ id: "b", skillId: "sk2", shiftId: "other" }),
      ],
      reflections: [reflection({ id: "r1", shiftId: "shift1" })],
      medLogs: [medLog({ id: "m1", shiftId: "shift1" }), medLog({ id: "m2", shiftId: "shift1" })],
    });
    expect(c.skills).toBe(1);
    expect(c.reflections).toBe(1);
    expect(c.medLogs).toBe(2);
  });

  it("counts distinct proficiencies fed directly and via captures on the shift", () => {
    const c = shiftContribution(shift({ id: "shift1" }), {
      evidenceLinks: [
        link({ id: "l1", proficiencyId: "p1", evidenceType: "SHIFT", evidenceId: "shift1" }),
        link({ id: "l2", proficiencyId: "p2", evidenceType: "SKILL", evidenceId: "sk1" }),
        link({ id: "l3", proficiencyId: "p1", evidenceType: "REFLECTION", evidenceId: "r1" }), // dup of p1
        link({ id: "l4", proficiencyId: "p9", evidenceType: "SHIFT", evidenceId: "otherShift" }), // not this shift
      ],
      skillProgress: [skill({ id: "sp1", skillId: "sk1", shiftId: "shift1" })],
      reflections: [reflection({ id: "r1", shiftId: "shift1" })],
      medLogs: [],
    });
    // p1 (direct + via reflection, de-duped) and p2 (via skill) → 2 distinct; p9 excluded.
    expect(c.proficienciesEvidenced).toBe(2);
  });

  it("does not count a proficiency fed by a capture on a different shift", () => {
    const c = shiftContribution(shift({ id: "shift1" }), {
      evidenceLinks: [link({ proficiencyId: "p2", evidenceType: "SKILL", evidenceId: "sk1" })],
      skillProgress: [skill({ id: "sp1", skillId: "sk1", shiftId: "other" })],
      reflections: [],
      medLogs: [],
    });
    expect(c.proficienciesEvidenced).toBe(0);
  });
});
