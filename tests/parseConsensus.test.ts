import { describe, expect, it } from "vitest";
import {
  PAIR_THRESHOLD,
  charSimilarity,
  disputedWords,
  mapDisputesToBlocks,
} from "../infra/lambda/parse/consensus";

/**
 * Two-model consensus (spec-note-capture.md P22/P23).
 *
 * The cases below are the REAL disagreements observed across the runs in Appendix 2, not
 * invented examples — including the one that exposed the original adjacency-pairing bug.
 */

describe("charSimilarity", () => {
  it("pairs the corrupted long drug names with the correct one", () => {
    // The residual risk: the structure model corrupted this word in 3 of 7 runs.
    expect(charSimilarity("Phenoxyethylpenicillin", "Phenoxymethylpenicillin")).toBeGreaterThan(
      0.8,
    );
    expect(charSimilarity("Phenoxymenthylpenicillin", "Phenoxymethylpenicillin")).toBeGreaterThan(
      0.8,
    );
  });

  // Asserted against the exported threshold, not a hard-coded number, so these track the
  // real pairing DECISION rather than drifting out of step with a tuned constant.
  it("pairs short misreads — bigrams alone scored block/blow at 0.40 and missed it", () => {
    expect(charSimilarity("block", "blow")).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
    expect(charSimilarity("Filgrastim", "Filgastim")).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
    expect(charSimilarity("Aciclovir", "Acyclovir")).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
    expect(charSimilarity("antibiotic,", "antibisiic,")).toBeGreaterThanOrEqual(PAIR_THRESHOLD);
  });

  it("refuses to pair unrelated words", () => {
    // The exact false pair the adjacency-based version produced (P23).
    expect(charSimilarity("V)", "Phenoxymethylpenicillin")).toBeLessThan(PAIR_THRESHOLD);
    // 0.455 — the pair that forced the threshold up from 0.45.
    expect(charSimilarity("haematology", "betaxolol")).toBeLessThan(PAIR_THRESHOLD);
    expect(charSimilarity("methotrexate", "neutropenia")).toBeLessThan(PAIR_THRESHOLD);
  });
});

describe("disputedWords", () => {
  it("finds a real substitution and names BOTH readings correctly", () => {
    const structure = "Phenoxyethylpenicillin (Penicillin V) - antibiotic, treats pneumococcal";
    const check = "Phenoxymethylpenicillin (Penicillin V) - antibiotic, treats pneumococcal";
    expect(disputedWords(structure, check)).toEqual([
      { structure: "Phenoxyethylpenicillin", check: "Phenoxymethylpenicillin" },
    ]);
  });

  it("does not mis-pair when the models place the gloss differently (the P23 bug)", () => {
    // The structure model inlines "(Penicillin V)"; the check model puts the name alone
    // first. Adjacency pairing reported `"V)" vs "Phenoxymethylpenicillin"` here.
    const structure = "Phenoxyethylpenicillin (Penicillin V) - antibiotic";
    const check = "Phenoxymethylpenicillin\n(Penicillin V) - antibiotic";
    const out = disputedWords(structure, check);
    expect(out).toContainEqual({
      structure: "Phenoxyethylpenicillin",
      check: "Phenoxymethylpenicillin",
    });
    expect(out.some((d) => d.structure === "V)")).toBe(false);
  });

  it("ignores cosmetic differences — case, punctuation and attached dashes", () => {
    expect(disputedWords("co-trimoxazole - antibiotic", "Co-trimoxazole -antibiotic")).toEqual([]);
    expect(
      disputedWords("side effects - lower back pain", "Side effects - lower back pain."),
    ).toEqual([]);
  });

  it("catches the check model's systematic Americanisation", () => {
    const out = disputedWords(
      "Aciclovir - antiviral medication",
      "Acyclovir - antiviral medication",
    );
    expect(out).toEqual([{ structure: "Aciclovir", check: "Acyclovir" }]);
  });

  it("catches a nonsense-in-context misread", () => {
    const out = disputedWords(
      "It can block methotrexate clearance",
      "It can blow methotrexate clearance",
    );
    expect(out).toEqual([{ structure: "block", check: "blow" }]);
  });

  it("returns nothing when the two transcriptions agree", () => {
    const t = "Filgrastim (GCSF) - man made protein used to treat neutropenia.";
    expect(disputedWords(t, t)).toEqual([]);
  });

  it("does not flag text one model simply didn't see", () => {
    // A segmentation difference, not a misread: there is no alternative reading to offer, so
    // flagging it would send the student to check a word with nothing to compare against.
    const structure = "Aciclovir - antiviral medication. e.g. HSV (Herpes simplex virus)";
    const check = "Aciclovir - antiviral medication.";
    expect(disputedWords(structure, check)).toEqual([]);
  });
});

describe("mapDisputesToBlocks", () => {
  it("attaches each dispute to the block whose text contains it", () => {
    const blocks = [
      { text: "Medication notes" },
      { text: "Aciclovir - antiviral medication." },
      { text: "Phenoxyethylpenicillin (Penicillin V) - antibiotic" },
    ];
    const disputes = [
      { structure: "Aciclovir", check: "Acyclovir" },
      { structure: "Phenoxyethylpenicillin", check: "Phenoxymethylpenicillin" },
    ];
    const map = mapDisputesToBlocks(blocks, disputes);
    expect(map.get(1)).toEqual([{ structure: "Aciclovir", check: "Acyclovir" }]);
    expect(map.get(2)).toEqual([
      { structure: "Phenoxyethylpenicillin", check: "Phenoxymethylpenicillin" },
    ]);
    expect(map.has(0)).toBe(false);
  });

  it("drops a dispute whose word survived into no block", () => {
    const map = mapDisputesToBlocks(
      [{ text: "Medication notes" }],
      [{ structure: "Filgrastim", check: "Filgastim" }],
    );
    expect(map.size).toBe(0);
  });
});
