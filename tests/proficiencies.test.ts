import { describe, expect, it } from "vitest";
import type {
  Proficiency,
  ProficiencyProgress,
  ProficiencyStatus,
  User,
} from "../src/domain/types";
import {
  isEscalating,
  isGap,
  overallPercentAchieved,
  summarisePlatforms,
  surfaceGaps,
} from "../src/logic/proficiencies";

function mkProf(
  id: string,
  platform: number,
  annexe: "NONE" | "A" | "B",
  orderIndex: number,
): Proficiency {
  return {
    id,
    platform,
    platformTitle: annexe === "NONE" ? `Platform ${platform}` : `Annexe ${annexe}`,
    annexe,
    code: id,
    statement: `statement ${id}`,
    orderIndex,
  };
}

function mkProgress(
  proficiencyId: string,
  status: ProficiencyStatus,
  targetPart?: number,
): ProficiencyProgress {
  return {
    id: `pr_${proficiencyId}`,
    userId: "u1",
    proficiencyId,
    status,
    targetPart,
    updatedAt: "",
  };
}

function mkUser(currentPart: number, totalParts: number): User {
  return {
    id: "u1",
    displayName: "Me",
    field: "ADULT",
    programmeType: "BSC_3YR",
    currentPart,
    totalParts,
    createdAt: "",
    updatedAt: "",
  };
}

describe("summarisePlatforms", () => {
  const profs = [
    mkProf("1.1", 1, "NONE", 0),
    mkProf("1.2", 1, "NONE", 1),
    mkProf("1.3", 1, "NONE", 2),
    mkProf("2.1", 2, "NONE", 3),
    mkProf("A1.1", 0, "A", 4),
    mkProf("B1.1", 0, "B", 5),
  ];

  it("counts statuses and computes % achieved per group", () => {
    const progress = [mkProgress("1.1", "ACHIEVED"), mkProgress("1.2", "DEVELOPING")];
    const groups = summarisePlatforms(profs, progress);
    const p1 = groups.find((g) => g.key === "1")!;
    expect(p1.total).toBe(3);
    expect(p1.achieved).toBe(1);
    expect(p1.developing).toBe(1);
    expect(p1.notYetAchieved).toBe(1);
    expect(p1.percentAchieved).toBe(33); // 1/3 rounded
  });

  it("groups annexes separately from platforms and orders P1..7 then A then B", () => {
    const groups = summarisePlatforms(profs, []);
    expect(groups.map((g) => g.key)).toEqual(["1", "2", "A", "B"]);
    expect(groups.find((g) => g.key === "A")!.platform).toBe(0);
    expect(groups.find((g) => g.key === "A")!.annexe).toBe("A");
  });

  it("untouched proficiencies default to not-yet-achieved, 0%", () => {
    const groups = summarisePlatforms(profs, []);
    const p1 = groups.find((g) => g.key === "1")!;
    expect(p1.notYetAchieved).toBe(3);
    expect(p1.percentAchieved).toBe(0);
  });
});

describe("isGap", () => {
  it("achieved is never a gap", () => {
    expect(isGap(mkProgress("x", "ACHIEVED"), mkUser(1, 3))).toBe(false);
    expect(isGap(mkProgress("x", "ACHIEVED", 1), mkUser(3, 3))).toBe(false);
  });

  it("with a target part: a gap once that part is reached", () => {
    expect(isGap(mkProgress("x", "DEVELOPING", 2), mkUser(1, 3))).toBe(false); // not reached
    expect(isGap(mkProgress("x", "DEVELOPING", 2), mkUser(2, 3))).toBe(true); // reached
    expect(isGap(mkProgress("x", "NOT_YET_ACHIEVED", 1), mkUser(3, 3))).toBe(true); // overdue
  });

  it("without a target part: a gap only in the final part", () => {
    expect(isGap(undefined, mkUser(1, 3))).toBe(false);
    expect(isGap(undefined, mkUser(3, 3))).toBe(true);
    expect(isGap(mkProgress("x", "DEVELOPING"), mkUser(2, 3))).toBe(false);
    expect(isGap(mkProgress("x", "DEVELOPING"), mkUser(3, 3))).toBe(true);
  });
});

describe("isEscalating", () => {
  it("target part equal to current part escalates", () => {
    expect(isEscalating(mkProgress("x", "DEVELOPING", 2), mkUser(2, 3))).toBe(true);
    expect(isEscalating(mkProgress("x", "DEVELOPING", 1), mkUser(2, 3))).toBe(false); // overdue but past
  });

  it("untagged, final part, still not-yet-achieved escalates", () => {
    expect(isEscalating(undefined, mkUser(3, 3))).toBe(true);
    expect(isEscalating(mkProgress("x", "DEVELOPING"), mkUser(3, 3))).toBe(false);
  });
});

describe("surfaceGaps", () => {
  it("orders escalating first, then not-yet before developing, then by orderIndex", () => {
    const profs = [
      mkProf("a", 1, "NONE", 0), // developing, target=current -> escalating
      mkProf("b", 1, "NONE", 1), // not-yet, target reached -> gap, not escalating
      mkProf("c", 1, "NONE", 2), // developing, target reached -> gap
      mkProf("d", 1, "NONE", 3), // achieved -> not a gap
    ];
    const user = mkUser(2, 3);
    const progress = [
      mkProgress("a", "DEVELOPING", 2),
      mkProgress("b", "NOT_YET_ACHIEVED", 1),
      mkProgress("c", "DEVELOPING", 1),
      mkProgress("d", "ACHIEVED", 1),
    ];
    const gaps = surfaceGaps(profs, progress, user);
    expect(gaps.map((g) => g.proficiency.id)).toEqual(["a", "b", "c"]);
    expect(gaps[0].escalating).toBe(true);
  });
});

describe("overallPercentAchieved", () => {
  it("is the achieved fraction across all proficiencies", () => {
    const profs = [mkProf("1.1", 1, "NONE", 0), mkProf("1.2", 1, "NONE", 1)];
    expect(overallPercentAchieved(profs, [mkProgress("1.1", "ACHIEVED")])).toBe(50);
    expect(overallPercentAchieved([], [])).toBe(0);
  });
});
