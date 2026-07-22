import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";
import { seedProficiencies } from "../src/data/seed/proficiencies";

function freshRepo() {
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

describe("DexieRepository — competency tracker", () => {
  let repo: DexieRepository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("seeds the national proficiency master list once", async () => {
    const list = await repo.listProficiencies();
    expect(list.length).toBe(seedProficiencies.length);
    // Returned in natural order.
    expect(list[0].orderIndex).toBe(0);
    expect(list[1].orderIndex).toBe(1);
    // Stable, code-derived ids.
    expect(await repo.getProficiency("prof_1.1")).toBeDefined();
  });

  it("upserts status and appends a dated history event", async () => {
    const user = await repo.getCurrentUser();
    const pid = "prof_1.1";

    const p1 = await repo.setProficiencyStatus(user.id, pid, {
      status: "DEVELOPING",
      partIndex: 1,
      occurredAt: "2026-02-01",
      assessorName: "Jo Smith",
      note: "good progress",
    });
    expect(p1.status).toBe("DEVELOPING");

    const p2 = await repo.setProficiencyStatus(user.id, pid, {
      status: "ACHIEVED",
      partIndex: 2,
      occurredAt: "2026-06-01",
    });
    // Same progress row updated, not duplicated.
    expect(p2.id).toBe(p1.id);
    expect((await repo.listProficiencyProgress(user.id)).length).toBe(1);
    expect((await repo.getProficiencyProgress(user.id, pid))!.status).toBe("ACHIEVED");

    const events = await repo.listProficiencyStatusEvents(p1.id);
    expect(events.length).toBe(2);
    expect(events[0].status).toBe("ACHIEVED"); // newest first
    expect(events[1].assessorName).toBe("Jo Smith");
  });

  it("sets and clears the target part without recording a status event", async () => {
    const user = await repo.getCurrentUser();
    const pid = "prof_2.1";
    const p = await repo.setProficiencyTargetPart(user.id, pid, 2);
    expect(p.status).toBe("NOT_YET_ACHIEVED");
    expect(p.targetPart).toBe(2);
    expect((await repo.listProficiencyStatusEvents(p.id)).length).toBe(0);

    // Setting status preserves the existing target part.
    const after = await repo.setProficiencyStatus(user.id, pid, {
      status: "DEVELOPING",
      partIndex: 2,
      occurredAt: "2026-06-01",
    });
    expect(after.targetPart).toBe(2);

    const cleared = await repo.setProficiencyTargetPart(user.id, pid, undefined);
    expect(cleared.targetPart).toBeUndefined();
    expect(cleared.status).toBe("DEVELOPING"); // status preserved
  });

  it("marks a PAD sign-off, preserves it across edits, and clears it", async () => {
    const user = await repo.getCurrentUser();
    const pid = "prof_1.2";

    // Give it a status + target first, then officially sign it off in the PAD.
    await repo.setProficiencyStatus(user.id, pid, {
      status: "ACHIEVED",
      partIndex: 2,
      occurredAt: "2026-06-01",
    });
    await repo.setProficiencyTargetPart(user.id, pid, 2);
    const signed = await repo.setProficiencyPadSignOff(user.id, pid, {
      padSignOffByName: "  A. Assessor  ",
      padSignOffLocation: "Ward 9",
      padSignOffDate: "2026-06-02",
    });
    expect(signed.padSignedOff).toBe(true);
    expect(signed.padSignOffByName).toBe("A. Assessor"); // trimmed
    expect(signed.status).toBe("ACHIEVED"); // status preserved
    expect(signed.targetPart).toBe(2); // target preserved

    // A later status change must NOT drop the PAD sign-off.
    const afterStatus = await repo.setProficiencyStatus(user.id, pid, {
      status: "DEVELOPING",
      partIndex: 3,
      occurredAt: "2026-07-01",
    });
    expect(afterStatus.padSignedOff).toBe(true);
    expect(afterStatus.padSignOffLocation).toBe("Ward 9");

    // A target-part edit must NOT drop it either.
    const afterTarget = await repo.setProficiencyTargetPart(user.id, pid, 3);
    expect(afterTarget.padSignedOff).toBe(true);

    // Clearing (null) removes the sign-off + its meta, keeping status/target.
    const cleared = await repo.setProficiencyPadSignOff(user.id, pid, null);
    expect(cleared.padSignedOff).toBe(false);
    expect(cleared.padSignOffByName).toBeUndefined();
    expect(cleared.status).toBe("DEVELOPING");
    expect(cleared.targetPart).toBe(3);
  });

  it("creates, lists and deletes evidence links", async () => {
    const user = await repo.getCurrentUser();
    const link = await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: "prof_4.14",
      evidenceType: "MED_LOG",
      evidenceId: "medlog-123",
    });
    await repo.createEvidenceLink({
      userId: user.id,
      proficiencyId: "prof_4.14",
      evidenceType: "SHIFT",
      evidenceId: "shift-456",
    });

    expect((await repo.listEvidenceLinks("prof_4.14")).length).toBe(2);
    expect((await repo.listEvidenceLinksForUser(user.id)).length).toBe(2);

    await repo.deleteEvidenceLink(link.id);
    expect((await repo.listEvidenceLinks("prof_4.14")).length).toBe(1);
  });
});
