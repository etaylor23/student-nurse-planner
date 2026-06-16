import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository, LOCAL_USER_ID } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";

function freshRepo() {
  // Unique DB name per test for isolation.
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

describe("DexieRepository", () => {
  let repo: DexieRepository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("seeds a local user and default break rules", async () => {
    const user = await repo.getCurrentUser();
    expect(user.id).toBe(LOCAL_USER_ID);
    expect(user.field).toBe("ADULT");
    const rules = await repo.getBreakRules(user.id);
    expect(rules.length).toBe(3);
    expect(rules[2].breakMins).toBe(60);
  });

  it("round-trips a placement and shift", async () => {
    const user = await repo.getCurrentUser();
    const placement = await repo.createPlacement({ userId: user.id, name: "Ward 7" });
    const shift = await repo.createShift({
      userId: user.id,
      placementId: placement.id,
      date: "2026-03-01",
      shiftType: "LONG_DAY",
      entryMode: "RAW",
      rawDurationMins: 750,
      breakMins: 60,
      netHours: 11.5,
      isSimulated: false,
      status: "COMPLETED",
      supervisingRnName: "Jo Smith",
    });

    const shifts = await repo.listShifts(user.id);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].id).toBe(shift.id);
    expect(shifts[0].netHours).toBe(11.5);
    expect(shifts[0].supervisingRnName).toBe("Jo Smith");
  });

  it("updates a shift and reflects the change", async () => {
    const user = await repo.getCurrentUser();
    const shift = await repo.createShift({
      userId: user.id,
      date: "2026-03-01",
      shiftType: "LONG_DAY",
      entryMode: "NET",
      netHours: 10,
      isSimulated: false,
      status: "PLANNED",
    });
    const updated = await repo.updateShift(shift.id, {
      status: "COMPLETED",
      supervisingRnName: "Pat Lee",
    });
    expect(updated.status).toBe("COMPLETED");
    expect(updated.supervisingRnName).toBe("Pat Lee");
    expect(updated.updatedAt).not.toBe("");
  });

  it("prefers user-specific break rules over defaults when present", async () => {
    const db = new PlannerDb("test-shared");
    // Use a repo that shares a db so we can inject a custom rule.
    const r2 = new DexieRepository(db);
    const u2 = await r2.getCurrentUser();
    await db.breakRules.put({
      id: "custom-1",
      userId: u2.id,
      minShiftMins: 0,
      maxShiftMins: 1000,
      breakMins: 45,
      orderIndex: 0,
    });
    const rules = await r2.getBreakRules(u2.id);
    expect(rules).toHaveLength(1);
    expect(rules[0].breakMins).toBe(45);
  });
});
