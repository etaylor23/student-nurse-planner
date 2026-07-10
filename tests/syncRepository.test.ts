import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DirectSyncTransport } from "./helpers/directSyncTransport";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { SyncRepository } from "../src/data/sync/syncRepository";
import { PlannerDb } from "../src/data/dexie/db";
import type { SyncTransport } from "../src/data/sync/protocol";

// Two proofs for SyncRepository (spec-backend-dynamodb.md §5):
//  1. LOCAL PARITY — behaves exactly like the underlying DexieRepository for reads/writes
//     (the instrumented outbox capture must be transparent to feature code). No sync runs.
//  2. ROUND-TRIP — multi-row/cascade mutations captured into the outbox converge to a
//     second device through the real server, including tombstone cascades.

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

let n = 0;
function server(sub: string) {
  return new DynamoRepository({ doc: ddb.doc, tableName: ddb.tableName, principal: { sub } });
}
/** A local-only device (never synced) — proves parity without any transport traffic. */
function localDevice(sub = `parity-${n}`) {
  const noop: SyncTransport = { pull: async () => [], push: async (r) => r };
  return new SyncRepository({
    db: new PlannerDb(`parity-${n++}-${Math.random().toString(36).slice(2)}`),
    userId: sub,
    transport: noop,
    autoSync: false,
  });
}
/** A device wired to the shared dynalite server for `sub`. */
function device(sub: string) {
  return new SyncRepository({
    db: new PlannerDb(`rt-${n++}-${Math.random().toString(36).slice(2)}`),
    userId: sub,
    transport: new DirectSyncTransport(server(sub)),
    autoSync: false,
  });
}

describe("SyncRepository — local parity with DexieRepository", () => {
  it("seeds the local user (keyed by the given id) + default break rules + reference data", async () => {
    const repo = localDevice("sub-parity-user");
    const user = await repo.getCurrentUser();
    expect(user.id).toBe("sub-parity-user"); // keyed by the sub, not LOCAL_USER_ID
    expect(user.field).toBe("ADULT");
    const rules = await repo.getBreakRules(user.id);
    expect(rules).toHaveLength(3); // bundled defaults, seeded locally
    expect((await repo.listProficiencies()).length).toBeGreaterThan(0); // bundled reference
    const skills = await repo.listSkills(user.id);
    expect(skills.some((s) => s.source === "ANNEXE_B")).toBe(true); // baseline present locally
  });

  it("round-trips placements + shifts (reads reflect writes instantly)", async () => {
    const repo = localDevice();
    const u = await repo.getCurrentUser();
    const placement = await repo.createPlacement({ userId: u.id, name: "Ward 7" });
    const shift = await repo.createShift({
      userId: u.id,
      placementId: placement.id,
      date: "2026-03-01",
      shiftType: "LONG_DAY",
      entryMode: "NET",
      netHours: 11.5,
      isSimulated: false,
      status: "COMPLETED",
      supervisingRnName: "Jo Smith",
    });
    const shifts = await repo.listShifts(u.id);
    expect(shifts.map((s) => s.id)).toEqual([shift.id]);
    expect(shifts[0].netHours).toBe(11.5);
    const updated = await repo.updateShift(shift.id, { status: "PLANNED" });
    expect(updated.status).toBe("PLANNED");
    await repo.deleteShift(shift.id);
    expect(await repo.listShifts(u.id)).toHaveLength(0);
  });

  it("round-trips the medication slice and cascades a delete locally", async () => {
    const repo = localDevice();
    const u = await repo.getCurrentUser();
    const med = await repo.createMedication({ userId: u.id, name: "Amoxicillin" });
    await repo.addMedicationCondition(med.id, "Chest infection");
    await repo.addMedicationCondition(med.id, "Cellulitis");
    expect((await repo.listMedicationConditions(med.id)).length).toBe(2);
    await repo.recordCalcAttempt(u.id, "IV_RATE", true);
    await repo.recordCalcAttempt(u.id, "IV_RATE", false);
    expect((await repo.listCalcStats(u.id)).find((s) => s.calcType === "IV_RATE")).toMatchObject({
      attempts: 2,
      correct: 1,
    });
    await repo.deleteMedication(med.id);
    expect(await repo.getMedication(med.id)).toBeUndefined();
    expect(await repo.listMedicationConditions(med.id)).toHaveLength(0);
  });

  it("round-trips reflections + sections + tags and cascades a delete locally", async () => {
    const repo = localDevice();
    const u = await repo.getCurrentUser();
    const r = await repo.createReflection(
      {
        userId: u.id,
        title: "First cannula",
        model: "GIBBS",
        isLocked: false,
        piiAcknowledged: true,
      },
      [{ stage: "DESCRIPTION", content: "assisted with a cannulation" }],
    );
    await repo.setReflectionTags(u.id, r.id, ["Placement", "Ward"]);
    expect((await repo.listReflectionSections(r.id)).length).toBe(1);
    expect((await repo.listTags(u.id)).length).toBe(2);
    await repo.deleteReflection(r.id);
    expect(await repo.getReflection(r.id)).toBeUndefined();
    expect(await repo.listReflectionSections(r.id)).toHaveLength(0);
    expect(
      (await repo.listReflectionTags(u.id)).filter((t) => t.reflectionId === r.id),
    ).toHaveLength(0);
  });

  it("round-trips proficiency progress + status history + skill progress", async () => {
    const repo = localDevice();
    const u = await repo.getCurrentUser();
    const p = await repo.setProficiencyStatus(u.id, "prof_1.1", {
      status: "DEVELOPING",
      partIndex: 1,
      occurredAt: "2026-02-01",
    });
    expect((await repo.listProficiencyStatusEvents(p.id)).length).toBe(1);
    const sp = await repo.setSkillStage(u.id, "skill_B2.1", "ASSISTED");
    expect(sp.stage).toBe("ASSISTED");
    const signed = await repo.signOffSkill(u.id, "skill_B2.1", { signOffDate: "2026-06-01" });
    expect(signed.signedOff).toBe(true);
  });
});

describe("SyncRepository — cascades round-trip through sync to a second device", () => {
  it("a medication + its conditions sync, then a cascade delete propagates", async () => {
    const sub = `sub-med-rt-${n}`;
    const a = device(sub);
    const b = device(sub);
    const ua = await a.getCurrentUser();
    await b.getCurrentUser();

    const med = await a.createMedication({ userId: ua.id, name: "Furosemide" });
    await a.addMedicationCondition(med.id, "Oedema");
    await a.addMedicationCondition(med.id, "Heart failure");
    await a.sync();
    await b.sync();
    expect((await b.getMedication(med.id))?.name).toBe("Furosemide");
    expect((await b.listMedicationConditions(med.id)).length).toBe(2);

    // Cascade delete on A → both the med and its conditions tombstone and propagate.
    await a.deleteMedication(med.id);
    await a.sync();
    await b.sync();
    expect(await b.getMedication(med.id)).toBeUndefined();
    expect(await b.listMedicationConditions(med.id)).toHaveLength(0);
  });

  it("a reflection with sections + tags syncs, then its cascade delete propagates", async () => {
    const sub = `sub-refl-rt-${n}`;
    const a = device(sub);
    const b = device(sub);
    const ua = await a.getCurrentUser();
    await b.getCurrentUser();

    const r = await a.createReflection(
      { userId: ua.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [
        { stage: "DESCRIPTION", content: "desc" },
        { stage: "FEELINGS", content: "feel" },
      ],
    );
    await a.setReflectionTags(ua.id, r.id, ["Placement"]);
    await a.sync();
    await b.sync();
    expect((await b.getReflection(r.id))?.title).toBe("R");
    expect((await b.listReflectionSections(r.id)).map((s) => s.stage).sort()).toEqual([
      "DESCRIPTION",
      "FEELINGS",
    ]);
    expect((await b.listTags(ua.id)).length).toBe(1);

    await a.deleteReflection(r.id);
    await a.sync();
    await b.sync();
    expect(await b.getReflection(r.id)).toBeUndefined();
    expect(await b.listReflectionSections(r.id)).toHaveLength(0);
  });

  it("a deterministic upsert (skill sign-off) converges to the latest state", async () => {
    const sub = `sub-skill-rt-${n}`;
    const a = device(sub);
    const b = device(sub);
    const ua = await a.getCurrentUser();
    await b.getCurrentUser();

    await a.setSkillStage(ua.id, "skill_B2.1", "OBSERVED");
    await a.sync();
    await b.sync();
    expect((await b.getSkillProgress(ua.id, "skill_B2.1"))?.stage).toBe("OBSERVED");

    await a.signOffSkill(ua.id, "skill_B2.1", {
      signOffByName: "Jo Smith",
      signOffDate: "2026-06-01",
    });
    await a.sync();
    await b.sync();
    const bp = await b.getSkillProgress(ua.id, "skill_B2.1");
    expect(bp?.signedOff).toBe(true);
    expect(bp?.signOffByName).toBe("Jo Smith");
    // Exactly one progress row (deterministic upsert, not a duplicate).
    expect((await b.listSkillProgress(ua.id)).length).toBe(1);
  });
});
