import { describe, expect, it } from "vitest";
import {
  calcStatSchema,
  proficiencyStatusSchema,
  reflectionDraftSchema,
  shiftDraftSchema,
  shiftTypeSchema,
  skillSchema,
  skillSignOffSchema,
} from "../src/domain/schemas.generated";

// Smoke test for the ts-to-zod codegen (spec-backend-dynamodb.md §7). ts-to-zod's own
// generation step validates the schemas' inferred types against the source TS; this
// guards the runtime behaviour and pins the seam the server input-validation relies on.
// If `types.ts` changes without re-running `npm run gen:zod`, `gen:zod:check` fails in CI.

describe("generated zod schemas — string-union enums", () => {
  it("accepts valid enum members and rejects others", () => {
    expect(shiftTypeSchema.parse("LONG_DAY")).toBe("LONG_DAY");
    expect(shiftTypeSchema.safeParse("BREAKFAST").success).toBe(false);
    expect(proficiencyStatusSchema.parse("ACHIEVED")).toBe("ACHIEVED");
    expect(proficiencyStatusSchema.safeParse("MASTERED").success).toBe(false);
  });
});

describe("generated zod schemas — *Draft (Omit) shapes", () => {
  const validShiftDraft = {
    date: "2026-07-09",
    shiftType: "EARLY",
    entryMode: "NET",
    netHours: 7.5,
    isSimulated: false,
    status: "PLANNED",
  };

  it("accepts a well-formed ShiftDraft", () => {
    expect(shiftDraftSchema.safeParse(validShiftDraft).success).toBe(true);
  });

  it("rejects a bad enum value", () => {
    expect(shiftDraftSchema.safeParse({ ...validShiftDraft, shiftType: "NOON" }).success).toBe(
      false,
    );
  });

  it("rejects a wrong primitive type", () => {
    expect(shiftDraftSchema.safeParse({ ...validShiftDraft, netHours: "lots" }).success).toBe(
      false,
    );
  });

  it("strips server-stamped fields from the Draft type (Omit worked)", () => {
    // id/userId/createdAt/updatedAt are omitted, so a Draft without them is valid.
    expect("userId" in shiftDraftSchema.parse(validShiftDraft)).toBe(false);
  });

  it("accepts a minimal ReflectionDraft", () => {
    expect(
      reflectionDraftSchema.safeParse({
        title: "First medication round",
        model: "GIBBS",
        isLocked: false,
        piiAcknowledged: true,
      }).success,
    ).toBe(true);
  });
});

describe("generated zod schemas — Pick + nullable + composite", () => {
  it("SkillSignOff picks only the sign-off fields", () => {
    const parsed = skillSignOffSchema.parse({ signOffByName: "RN Bloggs" });
    expect(parsed.signOffByName).toBe("RN Bloggs");
  });

  it("Skill.userId is nullable (baseline vs custom)", () => {
    const baseline = {
      id: "skill_B2.1",
      userId: null,
      name: "Venepuncture",
      category: "Procedures",
      source: "ANNEXE_B",
      orderIndex: 0,
    };
    expect(skillSchema.safeParse(baseline).success).toBe(true);
    expect(skillSchema.safeParse({ ...baseline, userId: "user_1" }).success).toBe(true);
  });

  it("CalcStat requires its aggregate counters", () => {
    expect(
      calcStatSchema.safeParse({
        id: "user_1:IV_RATE",
        userId: "user_1",
        calcType: "IV_RATE",
        attempts: 10,
        correct: 8,
        lastAttempted: "2026-07-09T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(calcStatSchema.safeParse({ id: "x", userId: "u", calcType: "IV_RATE" }).success).toBe(
      false,
    );
  });
});
