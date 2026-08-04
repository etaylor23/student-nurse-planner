import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { PlannerDb } from "../src/data/dexie/db";
import type { Repository } from "../src/data/repository";
import {
  AllocateError,
  absorbSubBlocks,
  allocateBlock,
  gibbsSections,
  keepBlock,
  restoreSubBlocks,
  titleFrom,
  unallocateBlock,
} from "../src/logic/allocateBlock";
import type { NoteBlock, NoteBlockDraft, Shift } from "../src/domain/types";

/**
 * Allocation and un-allocation (spec-note-capture.md P4/P19).
 *
 * This is what Gate 3 tests: a photographed note becoming a real `Reflection` and a real
 * `MedicationLog`, both traceable back to the block, and both reversible.
 */

const USER = "alloc-user";
let repo: Repository;
let n = 0;

beforeEach(() => {
  repo = new DexieRepository(new PlannerDb(`alloc-${n++}`)) as unknown as Repository;
});

async function makeShift(date = "2026-07-22"): Promise<Shift> {
  return repo.createShift({
    userId: USER,
    date,
    shiftType: "LATE",
    entryMode: "RAW",
    rawDurationMins: 480,
    netHours: 8,
    isSimulated: false,
    status: "COMPLETED",
  } as Parameters<Repository["createShift"]>[0]);
}

async function makeBlock(over: Partial<NoteBlockDraft> = {}): Promise<NoteBlock> {
  return repo.createNoteBlock({
    userId: USER,
    captureId: "cap-1",
    imageIndex: 0,
    rawText: "Aciclovir - antiviral medication for HSV in haematology patients.",
    text: "Aciclovir - antiviral medication for HSV in haematology patients.",
    kind: "MEDICATION",
    confidence: 1,
    bboxX0: 0,
    bboxY0: 0,
    bboxX1: 1,
    bboxY1: 1,
    rotationDeg: 0,
    status: "PENDING",
    ...over,
  } as NoteBlockDraft & { userId: string });
}

describe("titleFrom", () => {
  it("uses the first sentence, truncated", () => {
    expect(titleFrom("Felt out of my depth. Froze completely.")).toBe("Felt out of my depth");
    expect(titleFrom("a".repeat(80))).toHaveLength(58); // 57 + ellipsis
  });

  it("never produces an empty title", () => {
    expect(titleFrom("   ")).toBe("Captured note");
  });
});

describe("gibbsSections", () => {
  it("keeps only the stages the classifier filled, in cycle order", () => {
    const out = gibbsSections({ ACTION_PLAN: "next time ask", DESCRIPTION: "family asked" }, "x");
    expect(out.map((s) => s.stage)).toEqual(["DESCRIPTION", "ACTION_PLAN"]);
  });

  it("never invents content for an empty stage", () => {
    const out = gibbsSections({ DESCRIPTION: "a", FEELINGS: "   " }, "x");
    expect(out.map((s) => s.stage)).toEqual(["DESCRIPTION"]);
  });

  it("falls back to the whole note in DESCRIPTION rather than producing nothing", () => {
    expect(gibbsSections(undefined, "the whole note")).toEqual([
      { stage: "DESCRIPTION", content: "the whole note" },
    ]);
  });
});

describe("allocateBlock — REFLECTION", () => {
  it("creates a real Reflection with sections, provenance and the shift", async () => {
    const shift = await makeShift();
    const block = await makeBlock({
      kind: "REFLECTION",
      shiftId: shift.id,
      text: "Felt out of my depth when family asked about discharge.",
    });

    const { block: after, created } = await allocateBlock(repo, USER, {
      block,
      targetType: "REFLECTION",
      gibbs: { DESCRIPTION: "family asked about discharge", FEELINGS: "out of my depth" },
      tags: ["Haematology"],
    });

    const reflections = await repo.listReflections(USER);
    expect(reflections).toHaveLength(1);
    const r = reflections[0];
    // A GENUINE Reflection — it appears in the normal list with no special casing (P4).
    expect(r.model).toBe("GIBBS");
    expect(r.shiftId).toBe(shift.id); // inherited from the block (P6)
    // Provenance both ways (P5).
    expect(r.sourceType).toBe("NOTE_BLOCK");
    expect(r.sourceId).toBe(block.id);
    expect(after.targetId).toBe(r.id);
    expect(after.status).toBe("ALLOCATED");
    expect(created.label).toBe("Reflection");

    const sections = await repo.listReflectionSections(r.id);
    expect(sections.map((s) => s.stage).sort()).toEqual(["DESCRIPTION", "FEELINGS"]);
    const tags = await repo.listTags(USER);
    expect(tags.map((t) => t.label)).toContain("Haematology");
  });
});

describe("allocateBlock — MED_LOG", () => {
  it("creates a MedicationLog dated to the shift, marked OBSERVED", async () => {
    const shift = await makeShift("2026-07-22");
    const block = await makeBlock({ shiftId: shift.id });

    const { block: after } = await allocateBlock(repo, USER, {
      block,
      targetType: "MED_LOG",
      shiftFallbackShift: shift,
    });

    const logs = await repo.listMedicationLogs(USER);
    expect(logs).toHaveLength(1);
    // OBSERVED, never ADMINISTERED — the student wrote about the drug, they didn't give it.
    expect(logs[0].type).toBe("OBSERVED");
    expect(logs[0].date).toBe("2026-07-22");
    expect(logs[0].sourceId).toBe(block.id);
    expect(after.status).toBe("ALLOCATED");
  });
});

describe("allocateBlock — PROFICIENCY_EVENT", () => {
  it("REFUSES to file without a confirmed proficiency rather than guessing", async () => {
    const block = await makeBlock({ kind: "CLINICAL_SKILL" });
    await expect(
      allocateBlock(repo, USER, { block, targetType: "PROFICIENCY_EVENT" }),
    ).rejects.toThrow(AllocateError);
  });

  it("records the note against the chosen proficiency", async () => {
    const block = await makeBlock({ kind: "CLINICAL_SKILL", text: "Took vital signs manually." });
    const { block: after } = await allocateBlock(repo, USER, {
      block,
      targetType: "PROFICIENCY_EVENT",
      proficiencyId: "prof_B2.1",
    });
    const progress = await repo.listProficiencyProgress(USER);
    expect(progress.some((p) => p.proficiencyId === "prof_B2.1")).toBe(true);
    expect(after.status).toBe("ALLOCATED");
  });
});

describe("allocateBlock — SHIFT_NOTES", () => {
  it("appends to the shift's notes and records exactly what it appended (P7)", async () => {
    const shift = await makeShift();
    await repo.updateShift(shift.id, { notes: "My own earlier note." });
    const block = await makeBlock({ kind: "OBSERVATION", shiftId: shift.id, text: "BP 138/86" });

    const { block: after } = await allocateBlock(repo, USER, { block, targetType: "SHIFT_NOTES" });

    const updated = await repo.getShift(shift.id);
    expect(updated?.notes).toBe("My own earlier note.\n\nBP 138/86");
    // No targetId — nothing was created. The verbatim append is what un-allocation needs.
    expect(after.targetId).toBeUndefined();
    expect(after.appendedTo).toBe(shift.id);
    expect(after.appendedText).toBe("BP 138/86");
  });

  it("refuses without a shift rather than inventing one", async () => {
    const block = await makeBlock({ kind: "OBSERVATION" });
    await expect(allocateBlock(repo, USER, { block, targetType: "SHIFT_NOTES" })).rejects.toThrow(
      /Attach this to a shift/,
    );
  });
});

describe("allocateBlock — idempotency (P4)", () => {
  it("a second allocate is a NO-OP, so a retry can't duplicate a row", async () => {
    const shift = await makeShift();
    const block = await makeBlock({ shiftId: shift.id });

    const first = await allocateBlock(repo, USER, {
      block,
      targetType: "MED_LOG",
      shiftFallbackShift: shift,
    });
    const second = await allocateBlock(repo, USER, { block: first.block, targetType: "MED_LOG" });

    expect(await repo.listMedicationLogs(USER)).toHaveLength(1);
    expect(second.created.label).toBe("Already filed");
  });

  it("a second SHIFT_NOTES allocate can't double-append", async () => {
    const shift = await makeShift();
    const block = await makeBlock({ kind: "OBSERVATION", shiftId: shift.id, text: "BP 138/86" });

    const first = await allocateBlock(repo, USER, { block, targetType: "SHIFT_NOTES" });
    await allocateBlock(repo, USER, { block: first.block, targetType: "SHIFT_NOTES" });

    const updated = await repo.getShift(shift.id);
    expect(updated?.notes?.match(/BP 138\/86/g)).toHaveLength(1);
  });

  it("refuses when no target has been chosen", async () => {
    const block = await makeBlock({ kind: "UNKNOWN", targetType: undefined });
    await expect(allocateBlock(repo, USER, { block })).rejects.toThrow(/Choose where/);
  });
});

describe("unallocateBlock (P19)", () => {
  it("deletes the Reflection and returns the block to PENDING", async () => {
    const block = await makeBlock({ kind: "REFLECTION" });
    const { block: allocated } = await allocateBlock(repo, USER, {
      block,
      targetType: "REFLECTION",
    });
    expect(await repo.listReflections(USER)).toHaveLength(1);

    const { block: after, warning } = await unallocateBlock(repo, allocated);

    expect(await repo.listReflections(USER)).toHaveLength(0);
    expect(after.status).toBe("PENDING");
    expect(after.targetId).toBeUndefined();
    expect(warning).toBeUndefined();
  });

  it("strips appended shift notes when they still match verbatim", async () => {
    const shift = await makeShift();
    await repo.updateShift(shift.id, { notes: "My own earlier note." });
    const block = await makeBlock({ kind: "OBSERVATION", shiftId: shift.id, text: "BP 138/86" });
    const { block: allocated } = await allocateBlock(repo, USER, {
      block,
      targetType: "SHIFT_NOTES",
    });

    const { warning } = await unallocateBlock(repo, allocated);

    expect((await repo.getShift(shift.id))?.notes).toBe("My own earlier note.");
    expect(warning).toBeUndefined();
  });

  it("LEAVES edited shift notes alone and says so, rather than deleting the student's words", async () => {
    const shift = await makeShift();
    const block = await makeBlock({ kind: "OBSERVATION", shiftId: shift.id, text: "BP 138/86" });
    const { block: allocated } = await allocateBlock(repo, USER, {
      block,
      targetType: "SHIFT_NOTES",
    });
    // The student rewrites around the appended text.
    await repo.updateShift(shift.id, { notes: "BP was 138/86 at handover, rechecked later." });

    const { block: after, warning } = await unallocateBlock(repo, allocated);

    expect((await repo.getShift(shift.id))?.notes).toBe(
      "BP was 138/86 at handover, rechecked later.",
    );
    expect(warning).toMatch(/edited/i);
    expect(after.status).toBe("PENDING");
  });

  it("does NOT silently revert proficiency evidence, and says why", async () => {
    const block = await makeBlock({ kind: "CLINICAL_SKILL" });
    const { block: allocated } = await allocateBlock(repo, USER, {
      block,
      targetType: "PROFICIENCY_EVENT",
      proficiencyId: "prof_B2.1",
    });

    const { warning } = await unallocateBlock(repo, allocated);

    // There is no honest "un-set" for a status change, so it stays and the student is told.
    expect(warning).toMatch(/proficiency/i);
    const progress = await repo.listProficiencyProgress(USER);
    expect(progress.some((p) => p.proficiencyId === "prof_B2.1")).toBe(true);
  });

  it("is a no-op on a block that was never allocated", async () => {
    const block = await makeBlock();
    const { block: after } = await unallocateBlock(repo, block);
    expect(after.status).toBe("PENDING");
  });
});

describe("keepBlock (P43 — a diagram kept with its page)", () => {
  it("marks the block KEPT without creating any domain row", async () => {
    const block = await makeBlock({ kind: "DIAGRAM" });

    const kept = await keepBlock(repo, block);

    expect(kept.status).toBe("KEPT");
    expect(kept.targetType).toBeUndefined();
    expect(kept.targetId).toBeUndefined();
    // Nothing materialised anywhere — the photo is the artefact.
    expect(await repo.listReflections(USER)).toHaveLength(0);
    expect(await repo.listMedicationLogs(USER)).toHaveLength(0);
  });

  it("is idempotent, like allocate", async () => {
    const block = await makeBlock({ kind: "DIAGRAM" });
    const once = await keepBlock(repo, block);
    const twice = await keepBlock(repo, once);
    expect(twice.status).toBe("KEPT");
  });

  it("un-keeping is just a status reset — there is no row to delete", async () => {
    const block = await makeBlock({ kind: "DIAGRAM" });
    const kept = await keepBlock(repo, block);

    const { block: after, warning } = await unallocateBlock(repo, kept);

    expect(after.status).toBe("PENDING");
    expect(warning).toBeUndefined();
  });
});

describe("absorb / restore sub-blocks (P45 — notes stored inside their drawing)", () => {
  it("absorbs only PENDING sub-blocks; filed ones stay exactly as they are", async () => {
    const pending = await makeBlock({ kind: "TODO" });
    const filed = { ...(await makeBlock({ kind: "MEDICATION" })), status: "ALLOCATED" as const };

    const out = await absorbSubBlocks(repo, [pending, filed]);

    expect(out[0].status).toBe("ABSORBED");
    expect(out[1].status).toBe("ALLOCATED");
  });

  it("restores only ABSORBED sub-blocks, back to questions", async () => {
    const b = await makeBlock({ kind: "TODO" });
    const [absorbed] = await absorbSubBlocks(repo, [b]);

    const out = await restoreSubBlocks(repo, [absorbed]);
    expect(out[0].status).toBe("PENDING");
  });

  it("un-doing an ABSORBED block directly is just a status reset", async () => {
    const b = await makeBlock();
    const [absorbed] = await absorbSubBlocks(repo, [b]);
    const { block: after, warning } = await unallocateBlock(repo, absorbed);
    expect(after.status).toBe("PENDING");
    expect(warning).toBeUndefined();
  });
});
