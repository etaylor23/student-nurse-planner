import { describe, expect, it } from "vitest";
import {
  interruptedCapture,
  needsRecovery,
  pageKeys,
  planRecovery,
} from "../src/react/components/capture/recover";
import type { NoteBlock, NoteCapture } from "../src/domain/types";

/**
 * Resuming a capture the client abandoned (spec-note-capture-hardening.md H9).
 *
 * The failure this fixes is a stuck row: the tab closes mid-parse, the photos are already in
 * S3, and the `PARSING` capture sits there with no review to open and no way back to the pages.
 * What matters here is the decision — which pages still need reading, and when there is nothing
 * left to resume — because a wrong answer either re-reads a page the student has already filed
 * from (spending a read and duplicating rows) or silently strands one.
 */

function capture(over: Partial<NoteCapture> & { id: string }): NoteCapture {
  return {
    userId: "u1",
    imageKeys: "",
    piiAcknowledged: true,
    status: "PARSING",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:00:00.000Z",
    ...over,
  } as NoteCapture;
}

function block(over: Partial<NoteBlock> & { id: string }): NoteBlock {
  return {
    userId: "u1",
    captureId: "c1",
    imageIndex: 0,
    rawText: "x",
    text: "x",
    kind: "OBSERVATION",
    confidence: 1,
    bboxX0: 0,
    bboxY0: 0,
    bboxX1: 1,
    bboxY1: 1,
    rotationDeg: 0,
    status: "PENDING",
    createdAt: "2026-08-05T09:00:00.000Z",
    updatedAt: "2026-08-05T09:00:00.000Z",
    ...over,
  } as NoteBlock;
}

const KEY_A = "u/sub/h/aaa/page.jpg";
const KEY_B = "u/sub/h/bbb/page.jpg";

describe("pageKeys", () => {
  it("reads the keys in upload order and ignores the empty string", () => {
    expect(pageKeys({ imageKeys: `${KEY_A},${KEY_B}` })).toEqual([KEY_A, KEY_B]);
    expect(pageKeys({ imageKeys: "" })).toEqual([]);
    expect(pageKeys({ imageKeys: `${KEY_A},` })).toEqual([KEY_A]);
  });
});

describe("needsRecovery", () => {
  it("is only ever PARSING — the other two are places a student can act from", () => {
    expect(needsRecovery(capture({ id: "c", status: "PARSING" }))).toBe(true);
    expect(needsRecovery(capture({ id: "c", status: "REVIEW" }))).toBe(false);
    expect(needsRecovery(capture({ id: "c", status: "DONE" }))).toBe(false);
  });
});

describe("interruptedCapture", () => {
  it("takes the most recent stuck capture — the one they just lost", () => {
    const found = interruptedCapture([
      capture({ id: "old", imageKeys: KEY_A, createdAt: "2026-08-01T09:00:00.000Z" }),
      capture({ id: "new", imageKeys: KEY_A, createdAt: "2026-08-05T08:00:00.000Z" }),
      capture({ id: "reviewing", status: "REVIEW", createdAt: "2026-08-05T10:00:00.000Z" }),
    ]);
    expect(found?.id).toBe("new");
  });

  it("finds nothing when every capture is somewhere a student can act", () => {
    expect(
      interruptedCapture([
        capture({ id: "a", status: "REVIEW" }),
        capture({ id: "b", status: "DONE" }),
      ]),
    ).toBeUndefined();
  });
});

describe("planRecovery", () => {
  it("re-reads only the pages with no persisted blocks", () => {
    const c = capture({ id: "c1", imageKeys: `${KEY_A},${KEY_B}` });
    // Page 0 got through; page 1 is where the client vanished.
    const plan = planRecovery(c, [block({ id: "b1", imageIndex: 0 })]);
    expect(plan.pages).toEqual([
      { imageKey: KEY_A, imageIndex: 0, needsParse: false },
      { imageKey: KEY_B, imageIndex: 1, needsParse: true },
    ]);
    expect(plan.startAgain).toBe(false);
  });

  it("counts a page as read on a single block, whatever became of it", () => {
    // One block, already filed. The page was read; re-reading it would duplicate the rows.
    const c = capture({ id: "c1", imageKeys: KEY_A });
    const filed = block({ id: "b1", status: "ALLOCATED", targetType: "SHIFT_NOTES" });
    expect(planRecovery(c, [filed]).pages[0].needsParse).toBe(false);
  });

  it("ignores blocks belonging to another capture", () => {
    const c = capture({ id: "c1", imageKeys: KEY_A });
    const elsewhere = block({ id: "b1", captureId: "c2", imageIndex: 0 });
    expect(planRecovery(c, [elsewhere]).pages[0].needsParse).toBe(true);
  });

  it("offers a fresh start when no page ever finished uploading", () => {
    const plan = planRecovery(capture({ id: "c1", imageKeys: "" }), []);
    expect(plan.pages).toEqual([]);
    expect(plan.startAgain).toBe(true);
  });

  it("has nothing to re-read when every page is already read (just a missed status write)", () => {
    const c = capture({ id: "c1", imageKeys: `${KEY_A},${KEY_B}` });
    const plan = planRecovery(c, [
      block({ id: "b1", imageIndex: 0 }),
      block({ id: "b2", imageIndex: 1 }),
    ]);
    expect(plan.pages.every((p) => !p.needsParse)).toBe(true);
    expect(plan.startAgain).toBe(false);
  });
});
