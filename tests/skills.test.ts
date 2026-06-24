import { describe, expect, it } from "vitest";
import type { Skill, SkillProgress } from "../src/domain/types";
import {
  groupSkillsByCategory,
  skillCategories,
  skillMatchesFilter,
  skillMatchesQuery,
  skillStageOf,
  summariseSkills,
} from "../src/logic/skills";
import { annexeCodeOf, annexeProficiencyIdOf, seedSkills } from "../src/data/seed/skills";

function mkSkill(id: string, category: string, name = `name ${id}`, order = 0): Skill {
  return { id, userId: null, name, category, source: "ANNEXE_B", orderIndex: order };
}
function mkProgress(skillId: string, over: Partial<SkillProgress> = {}): SkillProgress {
  return {
    id: `sp_${skillId}`,
    userId: "u",
    skillId,
    stage: "OBSERVED",
    signedOff: false,
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  };
}

describe("clinical-skills seed (derived from Annexe B)", () => {
  it("derives one baseline skill per Annexe B procedure", () => {
    expect(seedSkills.length).toBe(84);
    expect(seedSkills.every((s) => s.source === "ANNEXE_B" && s.userId === null)).toBe(true);
  });

  it("uses stable code-derived ids mapping 1:1 to a proficiency", () => {
    const vitals = seedSkills.find((s) => s.id === "skill_B2.1");
    expect(vitals).toBeDefined();
    expect(annexeCodeOf(vitals!)).toBe("B2.1");
    expect(annexeProficiencyIdOf(vitals!)).toBe("prof_B2.1");
  });

  it("splits the two parts into short categories", () => {
    const cats = new Set(seedSkills.map((s) => s.category));
    expect(cats).toEqual(new Set(["Assessing needs", "Planning & managing care"]));
  });

  it("returns no proficiency mapping for custom skills", () => {
    const custom: Skill = { ...mkSkill("x", "Custom skills"), source: "CUSTOM", userId: "u" };
    expect(annexeProficiencyIdOf(custom)).toBeNull();
  });
});

describe("skills grouping + filtering", () => {
  const skills = [
    mkSkill("a", "Assessing needs", "vitals", 1),
    mkSkill("b", "Assessing needs", "venepuncture", 2),
    mkSkill("c", "Planning & managing care", "wound care", 3),
  ];

  it("groups by category preserving order", () => {
    const groups = groupSkillsByCategory(skills);
    expect(groups.map((g) => g.category)).toEqual(["Assessing needs", "Planning & managing care"]);
    expect(groups[0].skills.map((s) => s.id)).toEqual(["a", "b"]);
    expect(skillCategories(skills)).toEqual(["Assessing needs", "Planning & managing care"]);
  });

  it("matches a query against name and category", () => {
    expect(skillMatchesQuery(skills[0], "vital")).toBe(true);
    expect(skillMatchesQuery(skills[0], "assessing")).toBe(true);
    expect(skillMatchesQuery(skills[0], "wound")).toBe(false);
    expect(skillMatchesQuery(skills[0], "")).toBe(true);
  });

  it("filters by stage and sign-off", () => {
    const obs = mkProgress("a", { stage: "OBSERVED" });
    const signed = mkProgress("b", { stage: "ASSISTED", signedOff: true });
    expect(skillMatchesFilter(obs, "ALL")).toBe(true);
    expect(skillMatchesFilter(obs, "OBSERVED")).toBe(true);
    expect(skillMatchesFilter(obs, "ASSISTED")).toBe(false);
    expect(skillMatchesFilter(signed, "SIGNED_OFF")).toBe(true);
    expect(skillMatchesFilter(obs, "SIGNED_OFF")).toBe(false);
    // An unstarted skill (no progress) only matches "All".
    expect(skillMatchesFilter(undefined, "ALL")).toBe(true);
    expect(skillMatchesFilter(undefined, "OBSERVED")).toBe(false);
  });

  it("reports the stage, or null when unstarted", () => {
    expect(skillStageOf(mkProgress("a", { stage: "ASSISTED" }))).toBe("ASSISTED");
    expect(skillStageOf(undefined)).toBeNull();
  });

  it("summarises signed-off vs in-progress vs total", () => {
    const progress = [
      mkProgress("a", { stage: "OBSERVED" }),
      mkProgress("b", { stage: "ASSISTED", signedOff: true }),
    ];
    expect(summariseSkills(skills, progress)).toEqual({ total: 3, signedOff: 1, inProgress: 1 });
  });
});
