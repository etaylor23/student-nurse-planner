import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";
import { seedSkills } from "../src/data/seed/skills";

function freshRepo() {
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

describe("DexieRepository — clinical skills", () => {
  let repo: DexieRepository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("seeds the Annexe B baseline once, as built-ins", async () => {
    const user = await repo.getCurrentUser();
    const list = await repo.listSkills(user.id);
    expect(list.length).toBe(seedSkills.length);
    expect(list.every((s) => s.source === "ANNEXE_B" && s.userId === null)).toBe(true);
    // Sorted by orderIndex.
    expect(list[0].orderIndex).toBeLessThanOrEqual(list[1].orderIndex);
    expect(await repo.getSkill("skill_B2.1")).toBeDefined();
  });

  it("upserts a stage as one row per user+skill, preserving sign-off", async () => {
    const user = await repo.getCurrentUser();
    const id = "skill_B2.1";

    const p1 = await repo.setSkillStage(user.id, id, "OBSERVED");
    expect(p1.stage).toBe("OBSERVED");
    expect(p1.signedOff).toBe(false);

    const p2 = await repo.setSkillStage(user.id, id, "ASSISTED");
    expect(p2.id).toBe(p1.id); // same row updated, not duplicated
    expect((await repo.listSkillProgress(user.id)).length).toBe(1);
    expect((await repo.getSkillProgress(user.id, id))!.stage).toBe("ASSISTED");
  });

  it("makes sign-off permanent and survives a later stage change", async () => {
    const user = await repo.getCurrentUser();
    const id = "skill_B2.1";

    const signed = await repo.signOffSkill(user.id, id, {
      signOffByName: "Jo Smith",
      signOffLocation: "Ward 7",
      signOffDate: "2026-06-01",
      evidenceNote: "Observed direct practice",
    });
    expect(signed.signedOff).toBe(true);
    expect(signed.signOffByName).toBe("Jo Smith");

    // Changing the stage afterwards must not un-sign-off the skill.
    const after = await repo.setSkillStage(user.id, id, "PERFORMED_UNDER_SUPERVISION");
    expect(after.signedOff).toBe(true);
    expect(after.signOffByName).toBe("Jo Smith");
    expect(after.stage).toBe("PERFORMED_UNDER_SUPERVISION");
  });

  it("signs off a skill that has no prior progress row", async () => {
    const user = await repo.getCurrentUser();
    const signed = await repo.signOffSkill(user.id, "skill_B3.1", { signOffDate: "2026-06-02" });
    expect(signed.signedOff).toBe(true);
    expect(signed.stage).toBe("OBSERVED"); // default stage
  });

  it("adds, lists and deletes a custom skill (and its progress)", async () => {
    const user = await repo.getCurrentUser();
    const before = (await repo.listSkills(user.id)).length;

    const custom = await repo.addCustomSkill(user.id, {
      name: "Insulin pump set-up",
      category: "Diabetes care",
    });
    expect(custom.source).toBe("CUSTOM");
    expect(custom.userId).toBe(user.id);
    expect(custom.orderIndex).toBeGreaterThanOrEqual(1000); // sorts after every built-in

    const withCustom = await repo.listSkills(user.id);
    expect(withCustom.length).toBe(before + 1);
    expect(withCustom[withCustom.length - 1].id).toBe(custom.id);

    await repo.setSkillStage(user.id, custom.id, "ASSISTED");
    expect((await repo.listSkillProgress(user.id)).length).toBe(1);

    await repo.deleteCustomSkill(custom.id);
    expect((await repo.listSkills(user.id)).length).toBe(before);
    expect((await repo.listSkillProgress(user.id)).length).toBe(0);
  });

  it("refuses to delete a built-in baseline skill", async () => {
    await repo.getCurrentUser();
    await expect(repo.deleteCustomSkill("skill_B2.1")).rejects.toThrow();
  });
});
