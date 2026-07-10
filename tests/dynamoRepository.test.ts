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

// ---------------------------------------------------------------------------
// Phase 2 — the remaining entities, mirroring the DexieRepository contract tests
// (competency/reflections/revision/skills + the medication slice in repository.test).
// Server storage is custom-only for skills/subjects (baseline is the client bundle).
// ---------------------------------------------------------------------------

describe("DynamoRepository — medications, conditions, logs, calc drills", () => {
  it("round-trips medications, conditions, logs and calc drills; deleteMedication cascades", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const med = await repo.createMedication({
      userId: u.id,
      name: "Amoxicillin",
      drugClass: "Antibiotic",
      bodySystem: "Infection",
    });
    expect(med.id).toBeTruthy();
    expect(med.userId).toBe(u.id);
    expect((await repo.getMedication(med.id))?.name).toBe("Amoxicillin");
    // No infra/key attributes leak through the schema.
    const fetched = await repo.getMedication(med.id);
    expect(fetched).not.toHaveProperty("PK");
    expect(fetched).not.toHaveProperty("owner");

    await repo.addMedicationCondition(med.id, "Chest infection");
    await repo.addMedicationCondition(med.id, "Cellulitis");
    const conds = await repo.listMedicationConditions(med.id);
    expect(conds.map((c) => c.condition).sort()).toEqual(["Cellulitis", "Chest infection"]);

    await repo.createMedicationLog({
      userId: u.id,
      medicationId: med.id,
      shiftId: "shift-1",
      type: "OBSERVED",
      date: "2026-06-18",
      route: "Oral",
    });
    const logs = await repo.listMedicationLogs(u.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].type).toBe("OBSERVED");
    expect(logs[0].shiftId).toBe("shift-1");
    expect(await repo.listMedicationLogsForShift("shift-1")).toHaveLength(1);
    expect(await repo.listMedicationLogsForShift("other")).toHaveLength(0);
    expect(await repo.listMedicationLogsForMedication(med.id)).toHaveLength(1);

    const drill = await repo.createCalcDrill({
      userId: u.id,
      medicationId: med.id,
      calcType: "TABLET_DOSE",
      prompt: "Stock 250 mg, prescribed 500 mg?",
      answer: "2 tablets",
    });
    const updated = await repo.updateCalcDrill(drill.id, { lastCorrect: true });
    expect(updated.lastCorrect).toBe(true);
    expect(await repo.listCalcDrills(u.id, { medicationId: med.id })).toHaveLength(1);
    expect(await repo.listCalcDrills(u.id, { medicationId: "nope" })).toHaveLength(0);

    await repo.deleteMedication(med.id);
    expect(await repo.getMedication(med.id)).toBeUndefined();
    expect(await repo.listMedicationConditions(med.id)).toHaveLength(0);
  });

  it("lists medications alphabetically by name", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    await repo.createMedication({ userId: u.id, name: "Zopiclone" });
    await repo.createMedication({ userId: u.id, name: "Amoxicillin" });
    await repo.createMedication({ userId: u.id, name: "Metformin" });
    expect((await repo.listMedications(u.id)).map((m) => m.name)).toEqual([
      "Amoxicillin",
      "Metformin",
      "Zopiclone",
    ]);
  });

  it("removes a single condition by id without touching the others", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const med = await repo.createMedication({ userId: u.id, name: "Furosemide" });
    const c1 = await repo.addMedicationCondition(med.id, "Oedema");
    await repo.addMedicationCondition(med.id, "Heart failure");
    await repo.removeMedicationCondition(c1.id);
    const left = await repo.listMedicationConditions(med.id);
    expect(left.map((c) => c.condition)).toEqual(["Heart failure"]);
  });

  it("accumulates calc-attempt stats per type (bounded aggregate)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    await repo.recordCalcAttempt(u.id, "IV_RATE", true);
    await repo.recordCalcAttempt(u.id, "IV_RATE", false);
    await repo.recordCalcAttempt(u.id, "TABLET_DOSE", true);
    const stats = await repo.listCalcStats(u.id);
    expect(stats).toHaveLength(2); // one row per type, not per attempt
    expect(stats.find((s) => s.calcType === "IV_RATE")).toMatchObject({ attempts: 2, correct: 1 });
  });
});

describe("DynamoRepository — competency tracker (progress, history, evidence)", () => {
  it("upserts status and appends a dated history event (newest-first)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const pid = "prof_1.1";

    const p1 = await repo.setProficiencyStatus(u.id, pid, {
      status: "DEVELOPING",
      partIndex: 1,
      occurredAt: "2026-02-01",
      assessorName: "Jo Smith",
      note: "good progress",
    });
    const p2 = await repo.setProficiencyStatus(u.id, pid, {
      status: "ACHIEVED",
      partIndex: 2,
      occurredAt: "2026-06-01",
    });
    expect(p2.id).toBe(p1.id); // same progress row updated, not duplicated
    expect((await repo.listProficiencyProgress(u.id)).length).toBe(1);
    expect((await repo.getProficiencyProgress(u.id, pid))!.status).toBe("ACHIEVED");

    const events = await repo.listProficiencyStatusEvents(p1.id);
    expect(events.length).toBe(2);
    expect(events[0].status).toBe("ACHIEVED"); // newest first (by occurredAt)
    expect(events[1].assessorName).toBe("Jo Smith");
  });

  it("sets and clears the target part without recording a status event", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const pid = "prof_2.1";
    const p = await repo.setProficiencyTargetPart(u.id, pid, 2);
    expect(p.status).toBe("NOT_YET_ACHIEVED");
    expect(p.targetPart).toBe(2);
    expect((await repo.listProficiencyStatusEvents(p.id)).length).toBe(0);

    const after = await repo.setProficiencyStatus(u.id, pid, {
      status: "DEVELOPING",
      partIndex: 2,
      occurredAt: "2026-06-01",
    });
    expect(after.targetPart).toBe(2); // status change preserves the target part

    const cleared = await repo.setProficiencyTargetPart(u.id, pid, undefined);
    expect(cleared.targetPart).toBeUndefined();
    expect(cleared.status).toBe("DEVELOPING"); // status preserved
  });

  it("creates, lists and deletes evidence links", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const link = await repo.createEvidenceLink({
      userId: u.id,
      proficiencyId: "prof_4.14",
      evidenceType: "MED_LOG",
      evidenceId: "medlog-123",
    });
    await repo.createEvidenceLink({
      userId: u.id,
      proficiencyId: "prof_4.14",
      evidenceType: "SHIFT",
      evidenceId: "shift-456",
    });
    expect((await repo.listEvidenceLinks("prof_4.14")).length).toBe(2);
    expect((await repo.listEvidenceLinksForUser(u.id)).length).toBe(2);
    await repo.deleteEvidenceLink(link.id);
    expect((await repo.listEvidenceLinks("prof_4.14")).length).toBe(1);
  });
});

describe("DynamoRepository — clinical skills (custom-only server-side)", () => {
  it("returns no baseline skills (the client merges the bundled Annexe B)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    expect(await repo.listSkills(u.id)).toEqual([]);
    expect(await repo.getSkill("skill_B2.1")).toBeUndefined();
  });

  it("upserts a stage as one row per user+skill, preserving sign-off", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const id = "skill_B2.1";
    const p1 = await repo.setSkillStage(u.id, id, "OBSERVED");
    expect(p1.stage).toBe("OBSERVED");
    expect(p1.signedOff).toBe(false);
    const p2 = await repo.setSkillStage(u.id, id, "ASSISTED");
    expect(p2.id).toBe(p1.id);
    expect((await repo.listSkillProgress(u.id)).length).toBe(1);
    expect((await repo.getSkillProgress(u.id, id))!.stage).toBe("ASSISTED");
  });

  it("makes sign-off permanent and preserves it (and the shiftId) across a stage change", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const id = "skill_B2.1";
    const signed = await repo.signOffSkill(u.id, id, {
      signOffByName: "Jo Smith",
      signOffLocation: "Ward 7",
      signOffDate: "2026-06-01",
      shiftId: "shift-123",
    });
    expect(signed.signedOff).toBe(true);
    expect(signed.signOffByName).toBe("Jo Smith");
    expect(signed.shiftId).toBe("shift-123");

    const after = await repo.setSkillStage(u.id, id, "PERFORMED_UNDER_SUPERVISION");
    expect(after.signedOff).toBe(true);
    expect(after.signOffByName).toBe("Jo Smith");
    expect(after.shiftId).toBe("shift-123");
    expect(after.stage).toBe("PERFORMED_UNDER_SUPERVISION");
  });

  it("signs off a skill with no prior progress row (default stage OBSERVED)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const signed = await repo.signOffSkill(u.id, "skill_B3.1", { signOffDate: "2026-06-02" });
    expect(signed.signedOff).toBe(true);
    expect(signed.stage).toBe("OBSERVED");
  });

  it("adds, lists and deletes a custom skill (and its progress)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const custom = await repo.addCustomSkill(u.id, {
      name: "Insulin pump set-up",
      category: "Diabetes care",
    });
    expect(custom.source).toBe("CUSTOM");
    expect(custom.userId).toBe(u.id);
    expect(custom.orderIndex).toBeGreaterThanOrEqual(1000);
    const list = await repo.listSkills(u.id);
    expect(list.map((s) => s.id)).toEqual([custom.id]); // custom-only

    await repo.setSkillStage(u.id, custom.id, "ASSISTED");
    expect((await repo.listSkillProgress(u.id)).length).toBe(1);

    await repo.deleteCustomSkill(custom.id);
    expect(await repo.listSkills(u.id)).toEqual([]);
    expect((await repo.listSkillProgress(u.id)).length).toBe(0);
  });

  it("treats deleteCustomSkill of a bundled baseline id as a no-op (not stored server-side)", async () => {
    const repo = repoFor();
    await repo.getCurrentUser();
    await expect(repo.deleteCustomSkill("skill_B2.1")).resolves.toBeUndefined();
  });
});

describe("DynamoRepository — reflections, sections, tags", () => {
  it("creates a reflection with sections (blank stages dropped) and round-trips them", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const created = await repo.createReflection(
      {
        userId: u.id,
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
    expect(created.shiftId).toBe("shift-1");
    expect((await repo.listReflections(u.id)).map((r) => r.id)).toEqual([created.id]);
    const sections = await repo.listReflectionSections(created.id);
    expect(sections.map((s) => s.stage).sort()).toEqual(["DESCRIPTION", "FEELINGS"]);
    expect(sections.find((s) => s.stage === "DESCRIPTION")!.content).toBe(
      "I assisted with a cannulation.",
    );
  });

  it("orders reflections newest-first by occurredOn", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const older = await repo.createReflection(
      { userId: u.id, title: "Older", model: "GIBBS", occurredOn: "2026-06-01", isLocked: false, piiAcknowledged: true }, // prettier-ignore
      [],
    );
    const newer = await repo.createReflection(
      { userId: u.id, title: "Newer", model: "GIBBS", occurredOn: "2026-06-20", isLocked: false, piiAcknowledged: true }, // prettier-ignore
      [],
    );
    expect((await repo.listReflections(u.id)).map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it("replaces sections on update, clearing a stage that goes blank", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: u.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
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
    expect((await repo.getReflection(r.id))!.title).toBe("R (edited)");
    const sections = await repo.listReflectionSections(r.id);
    expect(sections.map((s) => s.stage).sort()).toEqual(["ACTION_PLAN", "DESCRIPTION"]);
    expect(sections.find((s) => s.stage === "DESCRIPTION")!.content).toBe("desc v2");
  });

  it("upserts tags by label (case-insensitive dedupe) and rewrites the join", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: u.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    const first = await repo.setReflectionTags(u.id, r.id, ["Placement", "placement", "  Ward  ", ""]); // prettier-ignore
    expect(first.map((t) => t.label).sort()).toEqual(["Placement", "Ward"]);

    const r2 = await repo.createReflection(
      { userId: u.id, title: "R2", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [],
    );
    await repo.setReflectionTags(u.id, r2.id, ["placement"]);
    expect((await repo.listTags(u.id)).length).toBe(2); // reused, not duplicated

    await repo.setReflectionTags(u.id, r.id, ["Ward"]);
    const links = (await repo.listReflectionTags(u.id)).filter((l) => l.reflectionId === r.id);
    expect(links.length).toBe(1);
  });

  it("deletes a reflection and cascades sections, tag links and REFLECTION evidence", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const r = await repo.createReflection(
      { userId: u.id, title: "R", model: "GIBBS", isLocked: false, piiAcknowledged: true },
      [{ stage: "DESCRIPTION", content: "desc" }],
    );
    await repo.setReflectionTags(u.id, r.id, ["Placement"]);
    await repo.createEvidenceLink({
      userId: u.id,
      proficiencyId: "prof_1.1",
      evidenceType: "REFLECTION",
      evidenceId: r.id,
    });
    await repo.createEvidenceLink({
      userId: u.id,
      proficiencyId: "prof_1.1",
      evidenceType: "SHIFT",
      evidenceId: "shift-9",
    });

    await repo.deleteReflection(r.id);
    expect(await repo.getReflection(r.id)).toBeUndefined();
    expect((await repo.listReflectionSections(r.id)).length).toBe(0);
    expect((await repo.listReflectionTags(u.id)).length).toBe(0);
    const links = await repo.listEvidenceLinks("prof_1.1");
    expect(links.map((l) => l.evidenceType)).toEqual(["SHIFT"]); // only the reflection link dropped
  });
});

describe("DynamoRepository — revision timetable (custom subjects, targets, topics, sessions)", () => {
  it("stores subjects custom-only (baseline is bundled) and adds a custom subject", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    expect(await repo.listSubjects(u.id)).toEqual([]);
    const custom = await repo.addSubject(u.id, "Leadership");
    expect(custom.userId).toBe(u.id);
    expect((await repo.listSubjects(u.id)).map((s) => s.name)).toEqual(["Leadership"]);
  });

  it("creates, lists (soonest-first) and deletes revision targets", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    await repo.createRevisionTarget({ userId: u.id, type: "EXAM", title: "Pharmacology exam", date: "2026-08-01" }); // prettier-ignore
    const osce = await repo.createRevisionTarget({ userId: u.id, type: "OSCE", title: "OSCE", date: "2026-07-15" }); // prettier-ignore
    expect((await repo.listRevisionTargets(u.id)).map((t) => t.date)).toEqual([
      "2026-07-15",
      "2026-08-01",
    ]);
    await repo.deleteRevisionTarget(osce.id);
    expect((await repo.listRevisionTargets(u.id)).length).toBe(1);
  });

  it("creates and updates topics (confidence + schedule)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const topic = await repo.createRevisionTopic({
      userId: u.id,
      subjectId: "subject_pharmacology",
      title: "Beta blockers",
      confidence: 2,
    });
    const updated = await repo.updateRevisionTopic(topic.id, {
      confidence: 4,
      lastReviewed: "2026-07-03",
      nextDue: "2026-07-10",
    });
    expect(updated.confidence).toBe(4);
    expect(updated.nextDue).toBe("2026-07-10");
    expect((await repo.listRevisionTopics(u.id)).length).toBe(1);
  });

  it("cascades a topic's sessions when the topic is deleted (general session survives)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const topic = await repo.createRevisionTopic({
      userId: u.id,
      subjectId: "subject_numeracy",
      title: "Infusion rates",
      confidence: 1,
    });
    await repo.createRevisionSession({
      userId: u.id,
      topicId: topic.id,
      method: "POMODORO",
      scheduledStart: "2026-07-04T09:00:00.000Z",
      scheduledEnd: "2026-07-04T09:25:00.000Z",
      completed: false,
    });
    await repo.createRevisionSession({
      userId: u.id,
      method: "FIXED_BLOCK",
      scheduledStart: "2026-07-05T09:00:00.000Z",
      scheduledEnd: "2026-07-05T10:00:00.000Z",
      completed: false,
    });
    expect((await repo.listRevisionSessions(u.id)).length).toBe(2);
    await repo.deleteRevisionTopic(topic.id);
    const remaining = await repo.listRevisionSessions(u.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].topicId).toBeUndefined();
  });

  it("updates a session on completion (confidence + pomodoro count)", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    const session = await repo.createRevisionSession({
      userId: u.id,
      method: "POMODORO",
      scheduledStart: "2026-07-04T09:00:00.000Z",
      scheduledEnd: "2026-07-04T09:25:00.000Z",
      completed: false,
    });
    const done = await repo.updateRevisionSession(session.id, {
      completed: true,
      pomodoroCount: 1,
      confidenceAfter: 4,
    });
    expect(done.completed).toBe(true);
    expect(done.pomodoroCount).toBe(1);
    expect(done.confidenceAfter).toBe(4);
  });
});

describe("DynamoRepository — self-care check-ins", () => {
  it("creates, lists (newest-first) and deletes check-ins", async () => {
    const repo = repoFor();
    const u = await repo.getCurrentUser();
    await repo.createSelfCareCheckin({
      userId: u.id,
      date: "2026-07-01",
      items: "sleep,hydration",
    });
    const later = await repo.createSelfCareCheckin({
      userId: u.id,
      date: "2026-07-08",
      energy: 4,
      items: "rest",
    });
    const list = await repo.listSelfCareCheckins(u.id);
    expect(list.map((c) => c.date)).toEqual(["2026-07-08", "2026-07-01"]); // newest first
    await repo.deleteSelfCareCheckin(later.id);
    expect((await repo.listSelfCareCheckins(u.id)).map((c) => c.date)).toEqual(["2026-07-01"]);
  });
});

describe("DynamoRepository — Phase 2 JWT scoping", () => {
  it("scopes Phase 2 entities to the principal — a second user sees none of the first's data", async () => {
    const alice = repoFor("alice@example.com");
    const bob = repoFor("bob@example.com");
    const au = await alice.getCurrentUser();

    await alice.createMedication({ userId: au.id, name: "Alice's med" });
    await alice.createReflection(
      { userId: au.id, title: "Alice's reflection", model: "GIBBS", isLocked: false, piiAcknowledged: true }, // prettier-ignore
      [{ stage: "DESCRIPTION", content: "private" }],
    );
    await alice.setSkillStage(au.id, "skill_B2.1", "OBSERVED");

    expect(await bob.listMedications("whatever")).toHaveLength(0);
    expect(await bob.listReflections("whatever")).toHaveLength(0);
    expect(await bob.listReflectionSectionsForUser("whatever")).toHaveLength(0);
    expect(await bob.listSkillProgress("whatever")).toHaveLength(0);

    expect(await alice.listMedications("whatever")).toHaveLength(1);
    expect(await alice.listReflections("whatever")).toHaveLength(1);
  });
});
