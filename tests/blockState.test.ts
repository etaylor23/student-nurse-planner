import { describe, expect, it } from "vitest";
import {
  diagramContaining,
  keptDrawingsForShift,
  subBlocksOf,
} from "../src/react/components/capture/blockState";
import type { NoteBlock, NoteCapture } from "../src/domain/types";

/**
 * Diagram membership (P43/P44): decided by REGIONS, never geometry. The review screen
 * pins the drawing while any of its branches is being worked on, so a wrong answer here
 * either hides the map or pins it over an unrelated note.
 */

function block(over: Partial<NoteBlock>): NoteBlock {
  return {
    id: "b",
    userId: "u",
    captureId: "c",
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
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
    ...over,
  };
}

const diagram = block({
  id: "diagram",
  kind: "DIAGRAM",
  fromRegions: "3,4,5,6",
  diagramSource: "mindmap\n  root((hub))",
});

describe("diagramContaining", () => {
  it("finds the diagram whose regions include the block's", () => {
    const spoke = block({ id: "spoke", fromRegions: "4" });
    expect(diagramContaining(spoke, [spoke, diagram])?.id).toBe("diagram");
  });

  it("says no for a block outside the drawing's regions", () => {
    const margin = block({ id: "margin", fromRegions: "9" });
    expect(diagramContaining(margin, [margin, diagram])).toBeUndefined();
  });

  it("never nominates a diagram for itself, or across pages", () => {
    expect(diagramContaining(diagram, [diagram])).toBeUndefined();
    const otherPage = block({ id: "other", fromRegions: "4", imageIndex: 1 });
    expect(diagramContaining(otherPage, [otherPage, diagram])).toBeUndefined();
  });

  it("ignores a dismissed diagram — its drawing is no longer on the table", () => {
    const spoke = block({ id: "spoke", fromRegions: "4" });
    const dismissed = { ...diagram, status: "DISMISSED" as const };
    expect(diagramContaining(spoke, [spoke, dismissed])).toBeUndefined();
  });
});

describe("subBlocksOf", () => {
  it("finds the notes living inside a drawing's regions, same page only", () => {
    const spoke = block({ id: "spoke", fromRegions: "4" });
    const margin = block({ id: "margin", fromRegions: "9" });
    const otherPage = block({ id: "other", fromRegions: "4", imageIndex: 1 });
    expect(subBlocksOf(diagram, [spoke, margin, otherPage, diagram]).map((b) => b.id)).toEqual([
      "spoke",
    ]);
  });

  it("never reaches into another capture — a region index is per page, not global", () => {
    // Caught in the browser: the Drawings tab passes EVERY block the student owns, and
    // "region 4" exists once per photographed page, so a drawing was collecting the notes of
    // every other page that shared a region number.
    const mine = block({ id: "mine", fromRegions: "4" });
    const elsewhere = block({ id: "elsewhere", captureId: "c2", fromRegions: "4" });
    expect(subBlocksOf(diagram, [mine, elsewhere, diagram]).map((b) => b.id)).toEqual(["mine"]);
    expect(diagramContaining(elsewhere, [elsewhere, diagram])).toBeUndefined();
  });

  it("is empty for non-diagram parents and never includes another drawing", () => {
    const notADiagram = block({ id: "plain", fromRegions: "1,2" });
    const nestedDiagram = { ...diagram, id: "d2", fromRegions: "4,5" };
    expect(subBlocksOf(notADiagram, [diagram])).toEqual([]);
    expect(subBlocksOf(diagram, [nestedDiagram]).map((b) => b.id)).toEqual([]);
  });
});

/**
 * Which kept drawings a shift shows (hardening H1). The rule that matters is membership:
 * `block.shiftId ?? capture.shiftId`, so a page attached as a whole carries its drawings and a
 * single block moved off it (P6) goes with the shift it was moved to. An unanchored keep is
 * legal and belongs to no shift (H2) — a lecture page is not a hole to fill.
 */
describe("keptDrawingsForShift", () => {
  const capture = (over: Partial<NoteCapture> & { id: string }): NoteCapture =>
    ({
      userId: "u",
      imageKeys: "k",
      piiAcknowledged: true,
      status: "DONE",
      createdAt: "2026-08-04T10:00:00.000Z",
      updatedAt: "2026-08-04T10:00:00.000Z",
      ...over,
    }) as NoteCapture;

  const kept = { ...diagram, status: "KEPT" as const };

  it("lists a kept drawing whose capture is attached to the shift", () => {
    const drawings = keptDrawingsForShift("s1", [capture({ id: "c", shiftId: "s1" })], [kept]);
    expect(drawings.map((d) => d.drawing.id)).toEqual(["diagram"]);
  });

  it("lets the block's own shift override its capture's, both ways", () => {
    const moved = { ...kept, shiftId: "s2" };
    const captures = [capture({ id: "c", shiftId: "s1" })];
    expect(keptDrawingsForShift("s1", captures, [moved])).toEqual([]);
    expect(keptDrawingsForShift("s2", captures, [moved]).map((d) => d.drawing.id)).toEqual([
      "diagram",
    ]);

    // The other direction: a capture nobody attached, one block pinned to a shift by hand.
    const loose = [capture({ id: "c" })];
    expect(keptDrawingsForShift("s2", loose, [moved]).map((d) => d.drawing.id)).toEqual([
      "diagram",
    ]);
  });

  it("shows an unanchored drawing on no shift at all (H2), never on an arbitrary one", () => {
    const captures = [capture({ id: "c" })];
    expect(keptDrawingsForShift("s1", captures, [kept])).toEqual([]);
    expect(keptDrawingsForShift("", captures, [kept])).toEqual([]);
  });

  it("lists kept drawings only — not pending, filed-whole, dismissed, or plain notes", () => {
    const captures = [capture({ id: "c", shiftId: "s1" })];
    const others: NoteBlock[] = [
      { ...diagram, id: "pending", status: "PENDING" },
      { ...diagram, id: "filed", status: "ALLOCATED", targetType: "SHIFT_NOTES" },
      { ...diagram, id: "gone", status: "DISMISSED" },
      block({ id: "note", status: "KEPT", fromRegions: "1" }),
    ];
    expect(keptDrawingsForShift("s1", captures, others)).toEqual([]);
  });

  it("attaches the drawing's own notes in page order, keeping what became of each", () => {
    const captures = [capture({ id: "c", shiftId: "s1" })];
    const blocks: NoteBlock[] = [
      block({ id: "late", fromRegions: "6", status: "ABSORBED" }),
      block({ id: "filed", fromRegions: "4", status: "ALLOCATED", targetType: "MED_LOG" }),
      block({ id: "early", fromRegions: "3", status: "PENDING" }),
      block({ id: "binned", fromRegions: "5", status: "DISMISSED" }),
      block({ id: "outside", fromRegions: "9", status: "ABSORBED" }),
      kept,
    ];
    const [entry] = keptDrawingsForShift("s1", captures, blocks);
    expect(entry.subBlocks.map((b) => b.id)).toEqual(["early", "filed", "late"]);
    expect(entry.subBlocks.map((b) => b.status)).toEqual(["PENDING", "ALLOCATED", "ABSORBED"]);
  });

  it("orders drawings by capture, then page, then position on the page", () => {
    const captures = [
      capture({ id: "later", shiftId: "s1", createdAt: "2026-08-04T18:00:00.000Z" }),
      capture({ id: "earlier", shiftId: "s1", createdAt: "2026-08-04T09:00:00.000Z" }),
    ];
    // Synthesised diagrams are appended after every other block, so insertion order is not
    // page order — the region index is.
    const blocks: NoteBlock[] = [
      { ...kept, id: "b-page1-low", captureId: "later", imageIndex: 1, fromRegions: "2" },
      { ...kept, id: "b-page0-high", captureId: "later", imageIndex: 0, fromRegions: "8" },
      { ...kept, id: "b-page0-low", captureId: "later", imageIndex: 0, fromRegions: "1" },
      { ...kept, id: "a", captureId: "earlier", imageIndex: 0, fromRegions: "5" },
    ];
    expect(keptDrawingsForShift("s1", captures, blocks).map((d) => d.drawing.id)).toEqual([
      "a",
      "b-page0-low",
      "b-page0-high",
      "b-page1-low",
    ]);
  });
});
