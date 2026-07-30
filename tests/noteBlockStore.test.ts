import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DexieRepository } from "../src/data/dexie/dexieRepository";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { PlannerDb } from "../src/data/dexie/db";
import type { NoteBlockDraft, Repository } from "../src/data/repository";

/**
 * `NoteBlock` persistence (spec-note-capture.md P3/P11/P26).
 *
 * Run against BOTH implementations, because they are the same interface and have drifted
 * before. The property that matters most is that `rawText` is frozen: it is the verbatim
 * transcription, and it is what makes the sanitiser safe to auto-apply and every later edit
 * diffable (P11).
 */

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

const draft = (over: Partial<NoteBlockDraft> = {}): NoteBlockDraft =>
  ({
    captureId: "cap-1",
    imageIndex: 0,
    rawText: "Aciclovir - antiviral medication.",
    text: "Aciclovir - antiviral medication.",
    kind: "MEDICATION",
    confidence: 1,
    bboxX0: 0.1,
    bboxY0: 0.1,
    bboxX1: 0.9,
    bboxY1: 0.2,
    rotationDeg: 0,
    status: "PENDING",
    ...over,
  }) as NoteBlockDraft;

let n = 0;
function impls(): Array<[string, Repository, string]> {
  const sub = `nb-${n++}`;
  return [
    ["dexie", new DexieRepository(new PlannerDb(`nb-test-${sub}`)) as unknown as Repository, sub],
    [
      "dynamo",
      new DynamoRepository({
        doc: ddb.doc,
        tableName: ddb.tableName,
        principal: { sub },
      }) as unknown as Repository,
      sub,
    ],
  ];
}

describe("NoteBlock persistence", () => {
  it("round-trips a block on both implementations", async () => {
    for (const [name, repo, sub] of impls()) {
      const created = await repo.createNoteBlock({ ...draft(), userId: sub });
      expect(created.id, name).toBeTruthy();
      expect(created.status, name).toBe("PENDING"); // nothing filed yet
      const listed = await repo.listNoteBlocks(sub);
      expect(
        listed.map((b) => b.id),
        name,
      ).toContain(created.id);
    }
  });

  it("FREEZES rawText — the verbatim transcription survives every edit (P11)", async () => {
    for (const [name, repo, sub] of impls()) {
      const created = await repo.createNoteBlock({ ...draft(), userId: sub });
      const edited = await repo.updateNoteBlock(created.id, {
        text: "completely rewritten by the student",
        // A cast could smuggle rawText into the patch; the impl must ignore it regardless.
        ...({ rawText: "TAMPERED" } as Record<string, unknown>),
      });
      expect(edited.text, name).toBe("completely rewritten by the student");
      expect(edited.rawText, name).toBe("Aciclovir - antiviral medication.");
    }
  });

  it("scopes a list to one capture", async () => {
    for (const [name, repo, sub] of impls()) {
      await repo.createNoteBlock({ ...draft({ captureId: "cap-A" }), userId: sub });
      await repo.createNoteBlock({ ...draft({ captureId: "cap-B" }), userId: sub });
      const onlyA = await repo.listNoteBlocks(sub, "cap-A");
      expect(onlyA, name).toHaveLength(1);
      expect(onlyA[0].captureId, name).toBe("cap-A");
    }
  });

  it("returns blocks in page order across a multi-page capture (P20)", async () => {
    for (const [name, repo, sub] of impls()) {
      await repo.createNoteBlock({ ...draft({ imageIndex: 2, text: "page three" }), userId: sub });
      await repo.createNoteBlock({ ...draft({ imageIndex: 0, text: "page one" }), userId: sub });
      await repo.createNoteBlock({ ...draft({ imageIndex: 1, text: "page two" }), userId: sub });
      const listed = await repo.listNoteBlocks(sub, "cap-1");
      expect(
        listed.map((b) => b.imageIndex),
        name,
      ).toEqual([0, 1, 2]);
    }
  });

  it("keeps the classifier's suggestions as SUGGESTIONS, not applied state", async () => {
    for (const [name, repo, sub] of impls()) {
      const created = await repo.createNoteBlock({
        ...draft({
          candidateCodes: "4.14,4.15,3.3",
          suggestedTags: "haematology,Antiviral",
          medicationCandidate: "Aciclovir",
          targetType: "MED_LOG",
        }),
        userId: sub,
      });
      // A suggested target does NOT mean anything was filed — that's `status`, and it's PENDING.
      expect(created.targetType, name).toBe("MED_LOG");
      expect(created.status, name).toBe("PENDING");
      expect(created.targetId, name).toBeUndefined();
      expect(created.candidateCodes, name).toBe("4.14,4.15,3.3");
    }
  });

  it("deletes a block", async () => {
    for (const [name, repo, sub] of impls()) {
      const created = await repo.createNoteBlock({ ...draft(), userId: sub });
      await repo.deleteNoteBlock(created.id);
      const listed = await repo.listNoteBlocks(sub);
      expect(
        listed.map((b) => b.id),
        name,
      ).not.toContain(created.id);
    }
  });
});
