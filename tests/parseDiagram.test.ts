import { describe, expect, it } from "vitest";
import {
  guardMermaid,
  mergeNomination,
  synthesiseDiagramBlock,
  visionDiagramClusters,
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

describe("visionDiagramClusters — the primary nomination, one per drawing (P43/P45)", () => {
  const vb = (kind?: string, groupKey?: string): VisionBlock => ({
    rawText: "x",
    ...(kind ? { kind } : {}),
    ...(groupKey ? { groupKey } : {}),
  });

  it("collects the regions vision hinted DIAGRAM, keyed by their shared group", () => {
    const blocks = [vb("DATE_HEADER"), vb("DIAGRAM", "map"), vb("DIAGRAM", "map"), vb("TODO")];
    expect(visionDiagramClusters(blocks)).toEqual([{ groupKey: "map", regions: [1, 2] }]);
  });

  it("returns EVERY drawing on the page, in page order — a page can hold several", () => {
    const blocks = [
      vb("DIAGRAM", "map"),
      vb("DIAGRAM", "map"),
      vb("OBSERVATION"),
      vb("DIAGRAM", "flow"),
      vb("DIAGRAM", "flow"),
      vb("DIAGRAM", "flow"),
    ];
    expect(visionDiagramClusters(blocks)).toEqual([
      { groupKey: "map", regions: [0, 1] },
      { groupKey: "flow", regions: [3, 4, 5] },
    ]);
  });

  it("drops single-label groups — one label is not a drawing", () => {
    const blocks = [vb("DIAGRAM", "lonely"), vb("DIAGRAM", "map"), vb("DIAGRAM", "map")];
    expect(visionDiagramClusters(blocks)).toEqual([{ groupKey: "map", regions: [1, 2] }]);
  });

  it("returns nothing when vision hinted no drawing", () => {
    expect(visionDiagramClusters([vb("OBSERVATION"), vb()])).toEqual([]);
  });
});

describe("mergeNomination — the classifier's flat nomination folds into the clusters", () => {
  const two = [
    { groupKey: "map", regions: [1, 2, 3] },
    { groupKey: "flow", regions: [7, 8] },
  ];

  it("unions with the single cluster it disagrees with — boundary disagreement is signal", () => {
    expect(mergeNomination([{ groupKey: "map", regions: [1, 2, 3] }], [3, 4])).toEqual([
      { groupKey: "map", regions: [1, 2, 3, 4] },
    ]);
  });

  it("grows outward through a run of adjacent nominations, and fills interior holes", () => {
    // 4 touches 3, then 5 touches 4 — the boundary extends region by region.
    expect(mergeNomination([{ groupKey: "map", regions: [1, 2, 3] }], [3, 4, 5])).toEqual([
      { groupKey: "map", regions: [1, 2, 3, 4, 5] },
    ]);
    // A hole vision skipped inside its own cluster is the nomination's original job.
    expect(mergeNomination([{ groupKey: "map", regions: [8, 10] }], [9, 10])).toEqual([
      { groupKey: "map", regions: [8, 9, 10] },
    ]);
  });

  it("refuses a distant island — the real-diabetes-meds margin note", () => {
    // The nomination overlapped the flowchart (8–17) but also reached across the page for
    // region 5, the "always check BM + prescription chart" margin box — the one red note
    // sharing words with a flowchart node. Contiguity is what a text-only nominator can't
    // fake: 5 touches nothing in the cluster, so it stays out, and its block keeps its own
    // home instead of nesting under (and being absorbed into) the drawing.
    const flowchart = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    expect(mergeNomination([{ groupKey: "flow", regions: flowchart }], [5, 8, 10])).toEqual([
      { groupKey: "flow", regions: flowchart },
    ]);
  });

  it("an island cannot bridge to the cluster through other islands", () => {
    // 5 and 6 are adjacent to each other but neither touches [1,2,3]; adjacency must chain
    // from the CLUSTER outward, or two stray nominations legitimise each other.
    expect(mergeNomination([{ groupKey: "map", regions: [1, 2, 3] }], [1, 5, 6])).toEqual([
      { groupKey: "map", regions: [1, 2, 3] },
    ]);
  });

  it("stands alone beside a single disjoint cluster — a drawing vision missed", () => {
    expect(mergeNomination([{ groupKey: "map", regions: [1, 2, 3] }], [11, 12])).toEqual([
      { groupKey: "map", regions: [1, 2, 3] },
      { regions: [11, 12] },
    ]);
  });

  it("stands alone when vision found no drawing at all", () => {
    expect(mergeNomination([], [4, 5])).toEqual([{ regions: [4, 5] }]);
  });

  it("is IGNORED once there are two clusters — a flat list cannot name its drawing", () => {
    // The real-falls-handling failure (runs/aug10-new-pages/): the classifier swept both
    // drawings, the title and the closing bullets into one nomination, and the old
    // best-overlap union turned a cluster into regions 0–18 — a superset of the other
    // drawing plus most of the page. "File whole" would have appended everything.
    const wholePage = Array.from({ length: 19 }, (_, i) => i);
    expect(mergeNomination(two, wholePage)).toEqual(two);
  });

  it("keeps two-cluster pages disjoint whatever the nomination says", () => {
    for (const nominated of [[3, 4], [7], [0, 1, 7, 8, 12]]) {
      const out = mergeNomination(two, nominated);
      const seen = new Set<number>();
      for (const c of out) {
        for (const r of c.regions) {
          expect(seen.has(r), `region ${r} appears in two clusters`).toBe(false);
          seen.add(r);
        }
      }
    }
  });

  it("changes nothing when the classifier nominated nothing", () => {
    expect(mergeNomination(two, [])).toEqual(two);
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

  it("admits BARE id references in edges — the shape every real flowchart has", () => {
    // `C -- YES --> D`: C and D are declared elsewhere with brackets, referenced bare here.
    // Rejecting these killed the first real flowchart page.
    const flowPage =
      "Patient looks hypo / BM low\nCheck blood glucose\nConscious and able to swallow?\nYES\nNO\nGive quick-acting carbs\nescalate / call for help";
    const src = [
      "flowchart TD",
      '  A["Patient looks hypo / BM low"] --> B["Check blood glucose"]',
      '  B --> C{"Conscious and able to swallow?"}',
      '  C -- YES --> D["Give quick-acting carbs"]',
      '  C -- NO --> E["escalate / call for help"]',
    ].join("\n");
    expect(guardMermaid(src, flowPage)).toBe(src);
  });

  it("still refuses invented words even when ids are in play", () => {
    const flowPage = "Check blood glucose\nYES";
    const src = 'flowchart TD\n  A["Check blood glucose"] -- YES --> B["give adrenaline"]';
    expect(guardMermaid(src, flowPage)).toBeUndefined();
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
