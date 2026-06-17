import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository, LOCAL_USER_ID } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";

function freshRepo() {
  // Unique DB name per test for isolation.
  return new DexieRepository(new PlannerDb("test-" + Math.random().toString(36).slice(2)));
}

function mkLog(id: string, userId: string, entityId: string, createdAt: string) {
  return {
    id,
    userId,
    entityType: "SHIFT",
    entityId,
    action: "SHIFT_CREATED",
    summary: "",
    createdAt,
  };
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

  it("stamps id + createdAt when appending a log item", async () => {
    const user = await repo.getCurrentUser();
    const item = await repo.createLogItem({
      userId: user.id,
      entityType: "SHIFT",
      entityId: "shift-x",
      action: "SHIFT_CREATED",
      summary: "Logged a shift",
    });
    expect(item.id).toBeTruthy();
    expect(item.createdAt).toBeTruthy();
    const listed = await repo.listLogItems(user.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(item.id);
  });

  it("lists log items newest first, scoped by entity", async () => {
    const db = new PlannerDb("test-log-" + Math.random().toString(36).slice(2));
    const r = new DexieRepository(db);
    const user = await r.getCurrentUser();
    // Direct puts with explicit timestamps so the ordering check is deterministic.
    await db.logItems.bulkPut([
      mkLog("l1", user.id, "shift-1", "2026-06-16T09:00:00.000Z"),
      mkLog("l2", user.id, "shift-1", "2026-06-16T10:00:00.000Z"),
      mkLog("l3", user.id, "shift-2", "2026-06-16T09:30:00.000Z"),
    ]);

    const all = await r.listLogItems(user.id);
    expect(all.map((i) => i.id)).toEqual(["l2", "l3", "l1"]); // newest first across entities

    const forShift1 = await r.listLogItems(user.id, { entityType: "SHIFT", entityId: "shift-1" });
    expect(forShift1.map((i) => i.id)).toEqual(["l2", "l1"]);
    expect(forShift1.every((i) => i.entityId === "shift-1")).toBe(true);
  });

  it("migrates v2 shift times (startTime/endTime) to full UTC ISO startAt/endAt", async () => {
    const name = "test-migrate-" + Math.random().toString(36).slice(2);
    // Create the DB at the old (v2) schema and insert old-shape shifts.
    const old = new Dexie(name);
    old.version(1).stores({
      users: "id",
      breakRules: "id, userId, orderIndex",
      placements: "id, userId, createdAt",
      shifts: "id, userId, [userId+date], status",
    });
    old.version(2).stores({ logItems: "id, userId, [entityType+entityId], createdAt" });
    await old.open();
    const base = {
      userId: "u",
      date: "2026-06-10",
      shiftType: "LONG_DAY",
      entryMode: "RAW",
      netHours: 11.5,
      isSimulated: false,
      status: "PLANNED",
      createdAt: "",
      updatedAt: "",
    };
    await old.table("shifts").bulkPut([
      { ...base, id: "day", startTime: "07:30", endTime: "20:00" },
      { ...base, id: "night", startTime: "20:00", endTime: "08:00" },
      { ...base, id: "allday", entryMode: "NET", netHours: 8 },
    ]);
    old.close();

    // Re-open at v4 via PlannerDb → runs the v3 then v4 upgrades.
    const repo = new DexieRepository(new PlannerDb(name));
    const byId = Object.fromEntries((await repo.listShifts("u")).map((s) => [s.id, s]));
    // Stored as full UTC ISO; assert the local wall-clock round-trips (TZ-safe).
    const lp = (iso: string) => {
      const d = new Date(iso);
      return { date: d.getDate(), h: d.getHours(), min: d.getMinutes() };
    };
    expect(byId.day.startAt).toMatch(/Z$/);
    expect(lp(byId.day.startAt!)).toEqual({ date: 10, h: 7, min: 30 });
    expect(lp(byId.day.endAt!)).toEqual({ date: 10, h: 20, min: 0 });
    expect(lp(byId.night.startAt!)).toEqual({ date: 10, h: 20, min: 0 });
    expect(lp(byId.night.endAt!)).toEqual({ date: 11, h: 8, min: 0 }); // overnight → next day
    expect(byId.allday.startAt).toBeUndefined();
    expect(byId.allday.endAt).toBeUndefined();
    // Old fields are dropped.
    expect((byId.day as unknown as Record<string, unknown>).startTime).toBeUndefined();
    expect((byId.day as unknown as Record<string, unknown>).endTime).toBeUndefined();
  });

  it("round-trips medications, conditions, logs and calc drills", async () => {
    const user = await repo.getCurrentUser();
    const med = await repo.createMedication({
      userId: user.id,
      name: "Amoxicillin",
      drugClass: "Antibiotic",
      bodySystem: "Infection",
    });
    expect(med.id).toBeTruthy();
    expect((await repo.getMedication(med.id))?.name).toBe("Amoxicillin");

    // Appendable conditions (unique-ish per med).
    await repo.addMedicationCondition(med.id, "Chest infection");
    await repo.addMedicationCondition(med.id, "Cellulitis");
    const conds = await repo.listMedicationConditions(med.id);
    expect(conds.map((c) => c.condition).sort()).toEqual(["Cellulitis", "Chest infection"]);

    // Med log (no patient data).
    await repo.createMedicationLog({
      userId: user.id,
      medicationId: med.id,
      type: "OBSERVED",
      date: "2026-06-18",
      route: "Oral",
    });
    const logs = await repo.listMedicationLogs(user.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("OBSERVED");

    // Calc drill, scoped by medication.
    const drill = await repo.createCalcDrill({
      userId: user.id,
      medicationId: med.id,
      calcType: "TABLET_DOSE",
      prompt: "Stock 250 mg, prescribed 500 mg?",
      answer: "2 tablets",
    });
    const updated = await repo.updateCalcDrill(drill.id, { lastCorrect: true });
    expect(updated.lastCorrect).toBe(true);
    expect(await repo.listCalcDrills(user.id, { medicationId: med.id })).toHaveLength(1);

    // Deleting the med cascades its conditions.
    await repo.deleteMedication(med.id);
    expect(await repo.getMedication(med.id)).toBeUndefined();
    expect(await repo.listMedicationConditions(med.id)).toHaveLength(0);
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
