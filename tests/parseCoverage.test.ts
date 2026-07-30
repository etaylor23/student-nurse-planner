import { describe, expect, it } from "vitest";
import { COVERAGE_THRESHOLD, ensureRegionsCovered } from "../infra/lambda/parse/coverage";
import type { ClassifiedBlock } from "../infra/lambda/parse/schema";

/**
 * Coverage guard (spec-note-capture.md P26/P27).
 *
 * The regions below are the REAL five from the medication-notes photo, and the "classifier
 * output" is what it actually returned: three blocks, with `co-trimoxazole` and the header
 * missing. That is the bug this exists to make impossible.
 */

const REGIONS = [
  "Medication notes",
  "Aciclovir - antiviral medication. e.g. HSV (Herpes simplex virus) viral prevention medication in haematology patients.",
  "co-trimoxazole - antibiotic, treats bacterial and fungal infections. e.g. PCP (pneumonia) Haematology patients taking methotrexate should not take co-trimox - strongly contraindicated. It can block methotrexate clearance in kidneys.",
  "Phenoxymethylpenicillin - antibiotic, treats pneumococcal (Penicillin V) and bacterial infections. e.g. Streptococcus pneumoniae preventative medication given to haematology patients.",
  "Filgrastim (GCSF) - man made protein used to treat neutropenia. Caused by chemo, bone marrow transplants and radiation.",
];

const block = (text: string, kind = "MEDICATION"): ClassifiedBlock =>
  ({ fromRegions: [], text, kind, candidateCodes: [], tags: [] }) as ClassifiedBlock;

describe("ensureRegionsCovered", () => {
  it("recovers the regions the classifier actually lost on the real page", () => {
    // Exactly what the deployed pipeline returned: 3 blocks from 5 regions.
    const returned = [block(REGIONS[1]), block(REGIONS[3]), block(REGIONS[4])];

    const { blocks, recovered } = ensureRegionsCovered(returned, REGIONS);

    expect(recovered).toEqual([0, 2]); // the header and co-trimoxazole
    expect(blocks).toHaveLength(5);
    // The whole drug is back, and honestly labelled rather than guessed at.
    const recoveredBlock = blocks.find((b) => b.text.startsWith("co-trimoxazole"));
    expect(recoveredBlock?.kind).toBe("UNKNOWN");
    expect(recoveredBlock?.candidateCodes).toEqual([]);
    expect(recoveredBlock?.targetType).toBeUndefined();
  });

  it("adds nothing when every region is accounted for", () => {
    const returned = REGIONS.map((r) => block(r));
    const { blocks, recovered } = ensureRegionsCovered(returned, REGIONS);
    expect(recovered).toEqual([]);
    expect(blocks).toHaveLength(5);
  });

  it("treats a region SPLIT across two blocks as covered, not lost", () => {
    // The classifier is allowed to subdivide a region (P26); re-emitting it would be noise.
    const half = REGIONS[2].slice(0, 120);
    const rest = REGIONS[2].slice(120);
    const { recovered } = ensureRegionsCovered([block(half), block(rest)], [REGIONS[2]]);
    expect(recovered).toEqual([]);
  });

  it("treats a region MERGED with another as covered", () => {
    // Two regions joined into one semantic block is also legitimate (P26).
    const { recovered } = ensureRegionsCovered(
      [block(`${REGIONS[0]}\n${REGIONS[1]}`)],
      [REGIONS[0], REGIONS[1]],
    );
    expect(recovered).toEqual([]);
  });

  it("tolerates reflowed whitespace and changed punctuation", () => {
    // The classifier joins hard-wrapped lines and the sanitiser adjusts punctuation; neither
    // means the region was lost.
    const reflowed = REGIONS[4].replace(/ /g, "\n").replace(/[.,()]/g, "");
    const { recovered } = ensureRegionsCovered([block(reflowed)], [REGIONS[4]]);
    expect(recovered).toEqual([]);
  });

  it("tolerates a word the sanitiser corrected", () => {
    // A corrected drug name changes one word; the region is still covered.
    const corrected = REGIONS[3].replace("Phenoxymethylpenicillin", "Phenoxyethylpenicillin");
    const { recovered } = ensureRegionsCovered([block(corrected)], [REGIONS[3]]);
    expect(recovered).toEqual([]);
  });

  it("recovers a region the classifier REWORDED rather than copied", () => {
    // The dropped-block case: the model paraphrased, the invented-text guard rejected it, and
    // without this the text would be gone entirely.
    const paraphrased = block("The student should review antibiotic contraindications carefully.");
    const { recovered } = ensureRegionsCovered([paraphrased], [REGIONS[2]]);
    expect(recovered).toEqual([0]);
  });

  it("ignores a region with no meaningful words", () => {
    const { recovered } = ensureRegionsCovered([], ["- -", "..."]);
    expect(recovered).toEqual([]);
  });

  it("recovers everything when the classifier returned nothing at all", () => {
    const { blocks, recovered } = ensureRegionsCovered([], REGIONS);
    expect(recovered).toHaveLength(5);
    expect(blocks.every((b) => b.kind === "UNKNOWN")).toBe(true);
  });

  it("uses a threshold below 1.0 on purpose", () => {
    // Requiring every word would re-emit regions that were in fact handled — noise of its own.
    expect(COVERAGE_THRESHOLD).toBeLessThan(1);
    expect(COVERAGE_THRESHOLD).toBeGreaterThan(0.5);
  });
});
