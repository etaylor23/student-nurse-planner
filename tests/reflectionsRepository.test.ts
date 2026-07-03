import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";

function freshRepo() {
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

describe("DexieRepository — reflections", () => {
  let repo: DexieRepository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("creates a reflection with sections and round-trips them", async () => {
    const user = await repo.getCurrentUser();
    const created = await repo.createReflection(
      {
        userId: user.id,
        title: "First cannula",
        model: "GIBBS",
        occurredOn: "2026-06-10",
        shiftId: "shift-1",
        isLocked: false,
        piiAcknowledged: true,
      },
      [
        { stage: "DESCRIPTION", content: "I assisted with a cannulation." },
        { stage: "FEELINGS", content: "Nervous but supported." },
        { stage: "EVALUATION", content: "   " }, // blank → not persisted
      ],
    );

    expect(created.id).toBeTruthy();
    expect(created.shiftId).toBe("shift-1"); // unindexed optional join round-trips

    const list = await repo.listReflections(user.id);
    expect(list.map((r) => r.id)).toEqual([created.id]);

    const sections = await repo.listReflectionSections(created.id);
    expect(sections.map((s) => s.stage).sort()).toEqual(["DESCRIPTION", "FEELINGS"]);
    expect(sections.find((s) => s.stage === "DESCRIPTION")!.content).toBe(
      "I assisted with a cannulation.",
    );
  });

  it("orders reflections newest-first by occurredOn, else createdAt", async () => {
    const user = await repo.getCurrentUser();
    const older = await repo.createReflection(
      { userId: user.id, title: "Older", model: "GIBBS", occurredOn: "2026-06-01", isLocked: false, piiAcknowledged: true }, // prettier-ignore
      [],
    );
    const newer = await repo.createReflection(
      { userId: user.id, title: "Newer", model: "GIBBS", occurredOn: "2026-06-20", isLocked: false, piiAcknowledged: true }, // prettier-ignore
      [],
    );
    const list = await repo.listReflections(user.id);
    expect(list.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it("replaces sections on update, clearing a stage that goes blank", async () => {
    const user = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: user.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [
        { stage: "DESCRIPTION", content: "desc" },
        { stage: "FEELINGS", content: "feel" },
      ],
    );

    await repo.updateReflection(r.id, { title: "R (edited)" }, [
      { stage: "DESCRIPTION", content: "desc v2" },
      { stage: "FEELINGS", content: "" }, // cleared
      { stage: "ACTION_PLAN", content: "next time" },
    ]);

    const updated = await repo.getReflection(r.id);
    expect(updated!.title).toBe("R (edited)");
    const sections = await repo.listReflectionSections(r.id);
    expect(sections.map((s) => s.stage).sort()).toEqual(["ACTION_PLAN", "DESCRIPTION"]);
    expect(sections.find((s) => s.stage === "DESCRIPTION")!.content).toBe("desc v2");
  });

  it("upserts tags by (user,label), deduping case-insensitively, and rewrites the join", async () => {
    const user = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: user.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );

    const first = await repo.setReflectionTags(user.id, r.id, ["Placement", "placement", "  Ward  ", ""]); // prettier-ignore
    expect(first.map((t) => t.label).sort()).toEqual(["Placement", "Ward"]); // dedupe + trim + drop blank

    // Reusing an existing label must not create a duplicate Tag row.
    const r2 = await repo.createReflection(
      { userId: user.id, title: "R2", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await repo.setReflectionTags(user.id, r2.id, ["placement"]);
    expect((await repo.listTags(user.id)).length).toBe(2); // Placement + Ward, not 3

    // Rewriting a reflection's tags replaces its join rows.
    await repo.setReflectionTags(user.id, r.id, ["Ward"]);
    const links = (await repo.listReflectionTags(user.id)).filter((l) => l.reflectionId === r.id);
    expect(links.length).toBe(1);
  });

  it("deletes a reflection and cascades sections, tag links and REFLECTION evidence", async () => {
    const user = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: user.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [{ stage: "DESCRIPTION", content: "desc" }],
    );
    await repo.setReflectionTags(user.id, r.id, ["Placement"]);
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: "prof_1.1",
      evidenceType: "REFLECTION",
      evidenceId: r.id,
    });
    // An unrelated link on the same proficiency must survive.
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: "prof_1.1",
      evidenceType: "SHIFT",
      evidenceId: "shift-9",
    });

    await repo.deleteReflection(r.id);

    expect(await repo.getReflection(r.id)).toBeUndefined();
    expect((await repo.listReflectionSections(r.id)).length).toBe(0);
    expect((await repo.listReflectionTags(user.id)).length).toBe(0);
    const links = await repo.listEvidenceLinks("prof_1.1");
    expect(links.map((l) => l.evidenceType)).toEqual(["SHIFT"]); // only the reflection link dropped
  });
});
