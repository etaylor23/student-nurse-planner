import { describe, expect, it } from "vitest";
import {
  guardMermaid,
  synthesiseDiagramBlock,
  visionDiagramRegions,
} from "../infra/lambda/parse/diagram";
import type { VisionBlock } from "../infra/lambda/parse/schema";

/**
 * The DIAGRAM synthesiser (spec-note-capture.md P43).
 *
 * The classifier only NOMINATES regions; this builds the block. Both prompt-level
 * alternatives failed on the real mind-map page (see diagram.ts), so the properties that
 * matter here are exactly the ones the model kept violating: the text is the regions'
 * own words, margin content stays out unless nominated, and a bad nomination degrades to
 * no diagram rather than a wrong one.
 */

const REGIONS = [
  "Sepsis lecture — wk 4",
  "SEPSIS SIX within 1 hour",
  "1. O2 — keep sats 94-98%",
  "2. blood cultures BEFORE abx",
  "ask about immunosuppression — chemo? steroids? splenectomy?",
];

describe("synthesiseDiagramBlock (P43)", () => {
  it("builds one DIAGRAM block from the nominated regions, verbatim, in page order", () => {
    const b = synthesiseDiagramBlock([3, 1, 2], REGIONS, [], "mind map");
    expect(b).not.toBeNull();
    expect(b?.kind).toBe("DIAGRAM");
    expect(b?.fromRegions).toEqual([1, 2, 3]);
    expect(b?.text).toBe(
      "SEPSIS SIX within 1 hour\n1. O2 — keep sats 94-98%\n2. blood cultures BEFORE abx",
    );
    expect(b?.tags).toEqual(["mind map"]);
    expect(b?.targetType).toBeUndefined();
  });

  it("replays the sanitiser's validated swaps onto the region text", () => {
    const b = synthesiseDiagramBlock(
      [1, 2],
      ["header", "Phenoxyethylpenicillin - antibiotic", "given for infections"],
      [{ from: "Phenoxyethylpenicillin", to: "Phenoxymethylpenicillin" }],
    );
    expect(b?.text).toContain("Phenoxymethylpenicillin");
    expect(b?.text).not.toContain("Phenoxyethylpenicillin");
  });

  it("ignores out-of-range and duplicate indices rather than failing", () => {
    const b = synthesiseDiagramBlock([1, 1, 2, 99, -3], REGIONS, []);
    expect(b?.fromRegions).toEqual([1, 2]);
  });

  it("returns null for fewer than two real regions — one region is not a drawing", () => {
    expect(synthesiseDiagramBlock([2], REGIONS, [])).toBeNull();
    expect(synthesiseDiagramBlock([], REGIONS, [])).toBeNull();
    expect(synthesiseDiagramBlock([98, 99], REGIONS, [])).toBeNull();
  });

  it("falls back to a plain 'diagram' tag when no form is given", () => {
    expect(synthesiseDiagramBlock([1, 2], REGIONS, [])?.tags).toEqual(["diagram"]);
    expect(synthesiseDiagramBlock([1, 2], REGIONS, [], "  ")?.tags).toEqual(["diagram"]);
  });
});

describe("visionDiagramRegions — the primary nomination (P43)", () => {
  const vb = (kind?: string, groupKey?: string): VisionBlock => ({
    rawText: "x",
    ...(kind ? { kind } : {}),
    ...(groupKey ? { groupKey } : {}),
  });

  it("collects the regions vision hinted DIAGRAM, keyed by their shared group", () => {
    const blocks = [vb("DATE_HEADER"), vb("DIAGRAM", "map"), vb("DIAGRAM", "map"), vb("TODO")];
    expect(visionDiagramRegions(blocks)).toEqual([1, 2]);
  });

  it("takes the largest drawing when hints split across groups", () => {
    const blocks = [
      vb("DIAGRAM", "small"),
      vb("DIAGRAM", "big"),
      vb("DIAGRAM", "big"),
      vb("DIAGRAM", "big"),
    ];
    expect(visionDiagramRegions(blocks)).toEqual([1, 2, 3]);
  });

  it("returns nothing when vision hinted no drawing", () => {
    expect(visionDiagramRegions([vb("OBSERVATION"), vb()])).toEqual([]);
  });
});

describe("guardMermaid — the rebuild may add structure, never words (P44)", () => {
  const page =
    "SEPSIS SIX within 1 hour\n1. O2 — keep sats 94-98%\n2. blood cultures BEFORE abx\nred flag: lactate over 2";

  it("admits a mindmap built from the page's own words", () => {
    const src = [
      "mindmap",
      "  root((SEPSIS SIX within 1 hour))",
      "    1. O2 — keep sats 94-98%",
      "    2. blood cultures BEFORE abx",
    ].join("\n");
    expect(guardMermaid(src, page)).toBe(src);
  });

  it("admits flowchart syntax and node ids, which are legitimately model-invented", () => {
    const src = 'flowchart TD\n  A["SEPSIS SIX"] --> B["blood cultures BEFORE abx"]';
    expect(guardMermaid(src, page)).toBe(src);
  });

  it("refuses a rebuild containing a word the page does not have", () => {
    const src = "mindmap\n  root((SEPSIS SIX))\n    give adrenaline immediately";
    expect(guardMermaid(src, page)).toBeUndefined();
  });

  it("refuses empty or absent sources", () => {
    expect(guardMermaid(undefined, page)).toBeUndefined();
    expect(guardMermaid("   ", page)).toBeUndefined();
  });
});
