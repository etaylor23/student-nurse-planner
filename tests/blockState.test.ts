import { describe, expect, it } from "vitest";
import { diagramContaining } from "../src/react/components/capture/blockState";
import type { NoteBlock } from "../src/domain/types";

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
