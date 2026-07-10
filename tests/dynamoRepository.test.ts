import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";

// Repository contract (Placements/Shifts slice) run against DynamoRepository on an
// in-process DynamoDB — spec-implementation-roadmap.md Phase 1. Each repo gets a unique
// `sub`, so every test operates in its own owner partition (isolation without teardown).

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

let counter = 0;
function repoFor(email = "sam.jones@example.com") {
  const sub = `sub-${counter++}-${Math.random().toString(36).slice(2)}`;
  return new DynamoRepository({
    doc: ddb.doc,
    tableName: ddb.tableName,
    principal: { sub, email },
  });
}

describe("DynamoRepository — user (lazy-create from the token)", () => {
  it("lazy-creates a profile from the JWT sub + email on first getCurrentUser", async () => {
    const repo = repoFor("aisha.khan@example.com");
    const user = await repo.getCurrentUser();
    expect(user.id).toMatch(/^sub-/); // id is the Cognito sub
    expect(user.email).toBe("aisha.khan@example.com");
    expect(user.displayName).toBe("aisha.khan"); // email local-part
    expect(user.field).toBe("ADULT");
    expect(user.currentPart).toBe(1);
    expect(user.totalParts).toBe(3);
  });

  it("is idempotent — a second getCurrentUser returns the same profile", async () => {
    const repo = repoFor();
    const a = await repo.getCurrentUser();
    const b = await repo.getCurrentUser();
    expect(b.id).toBe(a.id);
    expect(b.createdAt).toBe(a.createdAt);
  });

  it("falls back to 'Me' when the token has no email", async () => {
    const sub = `sub-noemail-${counter++}`;
    const repo = new DynamoRepository({
      doc: ddb.doc,
      tableName: ddb.tableName,
      principal: { sub },
    });
    const user = await repo.getCurrentUser();
    expect(user.displayName).toBe("Me");
    expect(user.email).toBeUndefined();
  });

  it("updateUser merges a patch and bumps updatedAt", async () => {
    const repo = repoFor();
    const before = await repo.getCurrentUser();
    const updated = await repo.updateUser({ displayName: "Sam", currentPart: 2, totalParts: 3 });
    expect(updated.displayName).toBe("Sam");
    expect(updated.currentPart).toBe(2);
    expect(updated.id).toBe(before.id);
    // Persisted.
    expect((await repo.getCurrentUser()).displayName).toBe("Sam");
  });
});

describe("DynamoRepository — placements + shifts round-trip", () => {
  it("round-trips a placement and shift scoped to the principal", async () => {
    const repo = repoFor();
    const user = await repo.getCurrentUser();
    const placement = await repo.createPlacement({ userId: user.id, name: "Ward 7" });
    expect(placement.userId).toBe(user.id);

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
    // No infra/key attributes leak into the domain object.
    expect(shifts[0]).not.toHaveProperty("PK");
    expect(shifts[0]).not.toHaveProperty("owner");
    expect(shifts[0]).not.toHaveProperty("version");
  });

  it("lists shifts newest date first", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const base = {
      userId: u.id,
      shiftType: "EARLY",
      entryMode: "NET",
      netHours: 7,
      isSimulated: false,
      status: "PLANNED",
    } as const;
    await repo.createShift({ ...base, date: "2026-03-01" });
    await repo.createShift({ ...base, date: "2026-03-10" });
    await repo.createShift({ ...base, date: "2026-03-05" });
    const dates = (await repo.listShifts(u.id)).map((s) => s.date);
    expect(dates).toEqual(["2026-03-10", "2026-03-05", "2026-03-01"]);
  });

  it("updates a shift and reflects the change", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const shift = await repo.createShift({
      userId: u.id,
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
    expect(await repo.getShift(shift.id)).toMatchObject({ status: "COMPLETED" });
  });

  it("deletes a shift", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const shift = await repo.createShift({
      userId: u.id,
      date: "2026-03-01",
      shiftType: "LATE",
      entryMode: "NET",
      netHours: 8,
      isSimulated: false,
      status: "PLANNED",
    });
    await repo.deleteShift(shift.id);
    expect(await repo.getShift(shift.id)).toBeUndefined();
    expect(await repo.listShifts(u.id)).toHaveLength(0);
  });

  it("lists placements newest-created first; updates and deletes", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const p1 = await repo.createPlacement({ userId: u.id, name: "First" });
    const p2 = await repo.createPlacement({ userId: u.id, name: "Second" });
    const names = (await repo.listPlacements(u.id)).map((p) => p.name);
    expect(names[0]).toBe("Second"); // newest first
    const updated = await repo.updatePlacement(p1.id, { name: "First (edited)" });
    expect(updated.name).toBe("First (edited)");
    await repo.deletePlacement(p2.id);
    expect((await repo.listPlacements(u.id)).map((p) => p.id)).toEqual([p1.id]);
  });
});

describe("DynamoRepository — activity log", () => {
  it("appends log items and lists them newest-first, filtered by entity", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    await repo.createLogItem({
      userId: u.id,
      entityType: "SHIFT",
      entityId: "s1",
      action: "SHIFT_CREATED",
      summary: "a",
    });
    await new Promise((r) => setTimeout(r, 5));
    await repo.createLogItem({
      userId: u.id,
      entityType: "SHIFT",
      entityId: "s2",
      action: "SHIFT_CREATED",
      summary: "b",
    });
    await new Promise((r) => setTimeout(r, 5));
    await repo.createLogItem({
      userId: u.id,
      entityType: "SHIFT",
      entityId: "s1",
      action: "SHIFT_COMPLETED",
      summary: "c",
    });

    const all = await repo.listLogItems(u.id);
    expect(all.map((i) => i.summary)).toEqual(["c", "b", "a"]); // newest first
    const forS1 = await repo.listLogItems(u.id, { entityType: "SHIFT", entityId: "s1" });
    expect(forS1.map((i) => i.summary)).toEqual(["c", "a"]);
    expect(forS1.every((i) => i.entityId === "s1")).toBe(true);
  });
});

describe("DynamoRepository — break rules (custom only; defaults are the client's job)", () => {
  it("returns [] when the user has no custom rules (no server-side defaults)", async () => {
    const repo = repoFor();
    expect(await repo.getBreakRules("ignored")).toEqual([]);
  });

  it("saves custom rules and returns them ordered; reset clears them", async () => {
    const repo = repoFor();
    const saved = await repo.saveBreakRules("ignored", [
      { minShiftMins: 0, maxShiftMins: 360, breakMins: 0 },
      { minShiftMins: 361, maxShiftMins: 540, breakMins: 30 },
    ]);
    expect(saved).toHaveLength(2);
    const got = await repo.getBreakRules("ignored");
    expect(got.map((r) => r.breakMins)).toEqual([0, 30]);
    expect(got.map((r) => r.orderIndex)).toEqual([0, 1]);
    await repo.resetBreakRules("ignored");
    expect(await repo.getBreakRules("ignored")).toEqual([]);
  });
});

describe("DynamoRepository — the Phase 1 proof: JWT scoping", () => {
  it("scopes every op to the principal — a second user cannot see the first's data", async () => {
    const alice = repoFor("alice@example.com");
    const bob = repoFor("bob@example.com");
    const au = await alice.getCurrentUser();

    const shift = await alice.createShift({
      userId: au.id,
      date: "2026-04-01",
      shiftType: "NIGHT",
      entryMode: "NET",
      netHours: 11,
      isSimulated: false,
      status: "PLANNED",
    });
    await alice.createPlacement({ userId: au.id, name: "Alice's ward" });

    // Bob (a different sub) sees none of it.
    expect(await bob.listShifts("whatever")).toHaveLength(0);
    expect(await bob.listPlacements("whatever")).toHaveLength(0);
    expect(await bob.getShift(shift.id)).toBeUndefined();

    // Alice still sees her own.
    expect(await alice.listShifts("whatever")).toHaveLength(1);
  });

  it("ignores a client-supplied userId — the server owns the identity", async () => {
    const repo = repoFor("real@example.com");
    const me = await repo.getCurrentUser();
    // Attempt to write as someone else.
    const shift = await repo.createShift({
      userId: "attacker-sub",
      date: "2026-04-02",
      shiftType: "EARLY",
      entryMode: "NET",
      netHours: 7,
      isSimulated: false,
      status: "PLANNED",
    });
    expect(shift.userId).toBe(me.id); // overridden to the principal, not "attacker-sub"
    const placement = await repo.createPlacement({ userId: "attacker-sub", name: "x" });
    expect(placement.userId).toBe(me.id);
  });
});
