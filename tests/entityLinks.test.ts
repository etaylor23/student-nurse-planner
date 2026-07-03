import { describe, expect, it } from "vitest";
import { hrefForEntity } from "../src/logic/entityLinks";

describe("hrefForEntity", () => {
  it("maps each linkable entity type to its route", () => {
    expect(hrefForEntity("SHIFT", "s1")).toBe("/planner/s1");
    expect(hrefForEntity("PROFICIENCY", "prof_B2.1")).toBe("/competencies/proficiency/prof_B2.1");
    expect(hrefForEntity("SKILL", "skill_B2.1")).toBe("/skills/skill_B2.1");
    expect(hrefForEntity("REFLECTION", "r1")).toBe("/reflection/r1");
    expect(hrefForEntity("MEDICATION", "m1")).toBe("/medications/m1");
    expect(hrefForEntity("PROFILE", "u1")).toBe("/profile");
  });

  it("sends a med-log entry to the log (its medication id isn't in the feed)", () => {
    expect(hrefForEntity("MEDICATION_LOG", "log1")).toBe("/medications/log");
  });

  it("returns null for unknown / unroutable entity types", () => {
    expect(hrefForEntity("REVISION", "x1")).toBeNull();
    expect(hrefForEntity("", "x")).toBeNull();
  });
});
