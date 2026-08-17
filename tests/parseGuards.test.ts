import { beforeEach, describe, expect, it, vi } from "vitest";
import { normaliseBbox, parseModelJson } from "../infra/lambda/parse/schema";

/**
 * The structural guards (spec-note-capture.md P24/P26/P27).
 *
 * Prompts were demonstrably not enough — Appendix 3 records three models rewriting clinical
 * content while explicitly told not to. These guards are what make the pipeline safe in code
 * rather than by hope, so they need tests more than the happy path does.
 */

/**
 * A PLAIN swappable implementation rather than `vi.fn()`, deliberately.
 *
 * With a vitest spy, an error thrown by the mock implementation gets attributed to the test
 * even when the code under test catches it correctly — so the degraded-path tests below
 * ("falls back when the model fails") failed while the code was demonstrably working. Using
 * a plain function keeps vitest's error tracking out of the picture; call capture is done by
 * hand, which is two lines.
 */
type ChatReply = { text: string; latencyMs: number };
let chatImpl: (req: unknown) => Promise<ChatReply>;
/** Loosely typed so the prompt-content assertions below can read into it. */
type ChatCall = { model?: string; messages?: Array<{ role: string; content: unknown }> };
const chatCalls: ChatCall[] = [];

vi.mock("../infra/lambda/ai/provider", () => ({
  chat: (req: unknown) => {
    chatCalls.push(req as ChatCall);
    return chatImpl(req);
  },
}));

const { sanitise } = await import("../infra/lambda/parse/sanitise");
const { classify } = await import("../infra/lambda/parse/classify");

/** Shape a model reply the way `chat()` returns it. */
const reply = (obj: unknown): ChatReply => ({ text: JSON.stringify(obj), latencyMs: 10 });

/** Answer every call with this object. */
const respondWith = (obj: unknown) => {
  chatImpl = async () => reply(obj);
};

beforeEach(() => {
  chatCalls.length = 0;
  chatImpl = async () => reply({});
});

describe("normaliseBbox — the 0–1000 scale the model actually returns", () => {
  it("scales down a 0–1000 bbox, even though the prompt asks for fractions", () => {
    // Observed consistently on every run: [130,577,910,746].
    expect(normaliseBbox([130, 577, 910, 746])).toEqual({
      x0: 0.13,
      y0: 0.577,
      x1: 0.91,
      y1: 0.746,
    });
  });

  it("leaves a genuine 0–1 bbox alone", () => {
    expect(normaliseBbox([0.07, 0.49, 0.46, 0.58])).toEqual({
      x0: 0.07,
      y0: 0.49,
      x1: 0.46,
      y1: 0.58,
    });
  });

  it("falls back to a full-page box when absent or malformed", () => {
    expect(normaliseBbox(undefined)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(normaliseBbox([1, 2])).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it("clamps and orders, so a reversed or out-of-range box can't break an overlay", () => {
    const b = normaliseBbox([2000, -50, 100, 400]);
    expect(b.x0).toBeLessThanOrEqual(b.x1);
    expect(b.y0).toBeLessThanOrEqual(b.y1);
    expect(b.y0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(1);
  });
});

describe("parseModelJson — tolerates the malformations actually seen", () => {
  it("strips a markdown fence", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("repairs unquoted keys, trailing commas and comments (the rejected model's output)", () => {
    expect(parseModelJson("{blocks: [], // note\n}")).toEqual({ blocks: [] });
  });

  it("returns null rather than throwing on rubbish", () => {
    expect(parseModelJson("not json at all")).toBeNull();
  });
});

describe("sanitise — a correction must appear verbatim in the input (P24)", () => {
  const page = "Phenoxyethylpenicillin - antibiotic, treats pneumococcal. chemo, man made protein.";

  it("applies a correction whose `from` is present", () => {
    respondWith({
      corrections: [{ from: "Phenoxyethylpenicillin", to: "Phenoxymethylpenicillin" }],
      correctedText: "ignored",
    });
    return sanitise(page).then((r) => {
      expect(r.corrections).toHaveLength(1);
      expect(r.text).toContain("Phenoxymethylpenicillin");
      expect(r.rejected).toHaveLength(0);
    });
  });

  it("DISCARDS invented content — the exact damage Appendix 3 measured", async () => {
    respondWith({
      corrections: [
        // deepseek's actual output: clinical detail that was never on the page.
        {
          from: "side effects - lower back pain",
          to: "side effects - bone pain (e.g., lower back)",
        },
      ],
      correctedText: "a wholesale rewrite we deliberately ignore",
    });
    const r = await sanitise(page);
    expect(r.rejected).toHaveLength(1);
    expect(r.corrections).toHaveLength(0);
    expect(r.text).not.toContain("bone pain");
    expect(r.text).toBe(page);
  });

  it("KNOWN GAP: a synonym swap survives, because its `from` really is on the page", async () => {
    // This documents a limitation rather than asserting a success. The structural guard
    // catches INVENTED content ("bone pain" was never written); it cannot catch a swap of a
    // word that IS written for a different real word. deepseek did exactly this in testing:
    // "man made" -> "recombinant", "preventative" -> "prophylactic". The prompt is the only
    // defence there, and prompts were measurably insufficient — which is why P11 freezes
    // rawText so any such swap stays visible and revertible in review.
    respondWith({
      corrections: [{ from: "man made", to: "recombinant" }],
      correctedText: "ignored",
    });
    const r = await sanitise(page);
    expect(r.corrections).toHaveLength(1);
    expect(r.text).toContain("recombinant");
  });

  it("ignores the model's own correctedText and replays validated swaps instead", async () => {
    respondWith({ corrections: [], correctedText: "TOTALLY DIFFERENT TEXT" });
    const r = await sanitise(page);
    // The model's rewrite is what smuggled in invented content, so it is never trusted.
    expect(r.text).toBe(page);
  });

  it("H5: the sanitiser may SWAP, never EXTEND — expansions are rejected structurally", async () => {
    // Every `from` below is really on the page, so the P24 guard alone passes them — and
    // every one was emitted by a real run (neb/PCP on 2026-08-04; HSV, NBM and co-trimox
    // applied into block text on 2026-08-13, against the "never your wording" promise).
    const input =
      "Salbutamol neb given. PCP (pneumonia) prophylaxis. HSV risk. NBM overnight. co-trimox weekly.";
    respondWith({
      corrections: [
        { from: "neb", to: "nebuliser" }, // extension: to contains from
        { from: "PCP (pneumonia)", to: "PCP (pneumocystis pneumonia)" }, // insertion: more words
        { from: "HSV", to: "herpes simplex virus" }, // abbreviation expansion
        { from: "NBM", to: "nil by mouth" }, // abbreviation expansion
        { from: "co-trimox", to: "co-trimoxazole" }, // extension: to contains from
      ],
      correctedText: "ignored",
    });
    const r = await sanitise(input);
    expect(r.corrections).toHaveLength(0);
    expect(r.rejected).toHaveLength(5);
    expect(r.text).toBe(input); // the student's words, untouched
  });

  it("H5: same-word-count substitutions still pass — the swaps the pass exists for", async () => {
    respondWith({
      corrections: [
        { from: "Phenoxyethylpenicillin", to: "Phenoxymethylpenicillin" },
        { from: "Filgastrim", to: "Filgrastim" },
      ],
      correctedText: "ignored",
    });
    const r = await sanitise("Phenoxyethylpenicillin QDS. Filgastrim daily.");
    expect(r.corrections).toHaveLength(2);
    expect(r.text).toBe("Phenoxymethylpenicillin QDS. Filgrastim daily.");
  });

  it("rejects a CASE-ONLY change — identical letters cannot be a spelling fix", async () => {
    // Seen in the wild 2026-08-10: `OD → od` un-capitalised a dose abbreviation. Same word
    // count, so an expansion guard can't catch it; this one is structural like the rest.
    respondWith({
      corrections: [
        { from: "OD", to: "od", reason: "style" },
        { from: "Filgastrim", to: "Filgrastim", reason: "spelling" },
      ],
      correctedText: "ignored",
    });
    const r = await sanitise("Prednisolone OD - steroid. Filgastrim daily.");
    expect(r.corrections).toEqual([{ from: "Filgastrim", to: "Filgrastim", reason: "spelling" }]);
    expect(r.rejected).toEqual([{ from: "OD", to: "od", reason: "style" }]);
    expect(r.text).toContain("Prednisolone OD");
    expect(r.text).toContain("Filgrastim");
  });

  it("drops no-op corrections where from === to", async () => {
    respondWith({ corrections: [{ from: "chemo", to: "chemo" }], correctedText: page });
    const r = await sanitise(page);
    expect(r.corrections).toHaveLength(0);
  });

  it("falls back to the verbatim text when the model fails", async () => {
    chatImpl = async () => {
      throw new Error("upstream 503");
    };
    const r = await sanitise(page);
    expect(r.failed).toBe(true);
    expect(r.text).toBe(page);
  });

  it("falls back when the model returns unusable JSON", async () => {
    chatImpl = async () => ({ text: "sorry, I can't do that", latencyMs: 5 });
    const r = await sanitise(page);
    expect(r.failed).toBe(true);
    expect(r.text).toBe(page);
  });
});

describe("classify — a block's text must come from the page (P26/P27)", () => {
  const page = "Aciclovir - antiviral medication.\nFelt out of my depth when family asked.";

  it("keeps a block whose text is on the page, even reflowed", async () => {
    respondWith({
      blocks: [
        { text: "Aciclovir   -   antiviral\nmedication.", kind: "MEDICATION", candidateCodes: [] },
      ],
    });
    const r = await classify(page, [page], {});
    expect(r.blocks).toHaveLength(1);
    expect(r.droppedBlocks).toBe(0);
  });

  it("DROPS a block the classifier invented rather than split", async () => {
    respondWith({
      blocks: [
        { text: "Aciclovir - antiviral medication.", kind: "MEDICATION", candidateCodes: [] },
        { text: "The student should review NEWS2 escalation.", kind: "TODO", candidateCodes: [] },
      ],
    });
    const r = await classify(page, [page], {});
    expect(r.blocks).toHaveLength(1);
    expect(r.droppedBlocks).toBe(1);
  });

  it("SALVAGES a reworded block from its own regions — classification kept, rewording gone", async () => {
    // The aug10 failure mode (runs/aug10-new-pages/): the model types a bullet correctly
    // but re-emits its text loosely; the guard used to throw the whole block away, and the
    // coverage net resurrected the region as UNKNOWN — a typed note downgraded to retyping.
    const regions = ["Aciclovir - antiviral medication.", "• check pain first"];
    respondWith({
      blocks: [
        { text: "Aciclovir - antiviral medication.", kind: "MEDICATION", fromRegions: [0] },
        // Reworded ("check the pain first") → fails the on-page guard, carries a gibbs.
        {
          text: "check the pain first",
          kind: "CLINICAL_SKILL",
          fromRegions: [1],
          candidateCodes: ["B2.1", "not-a-code"],
          gibbs: { DESCRIPTION: "checked the pain" },
        },
      ],
    });
    const r = await classify(regions.join("\n"), regions, {});
    expect(r.blocks).toHaveLength(2);
    expect(r.droppedBlocks).toBe(0);
    expect(r.salvagedBlocks).toBe(1);
    const salvaged = r.blocks[1];
    // The text is the region's own transcription — on the page by construction.
    expect(salvaged.text).toBe("• check pain first");
    expect(salvaged.kind).toBe("CLINICAL_SKILL");
    expect(salvaged.candidateCodes).toEqual(["B2.1"]); // codes still validated
    expect(salvaged.gibbs).toBeUndefined(); // the same model's re-phrasing goes with it
  });

  it("replays the sanitiser's swaps onto salvaged text, so it matches the page", async () => {
    const regions = ["woand dressing - keep sterile"];
    respondWith({
      blocks: [
        { text: "wound dressing keep it sterile", kind: "CLINICAL_SKILL", fromRegions: [0] },
      ],
    });
    const r = await classify("wound dressing - keep sterile", regions, {}, [
      { from: "woand", to: "wound", reason: "spelling" },
    ]);
    expect(r.salvagedBlocks).toBe(1);
    expect(r.blocks[0].text).toBe("wound dressing - keep sterile");
  });

  it("still drops a reworded block whose regions are already covered — nothing is lost", async () => {
    const regions = ["Aciclovir - antiviral medication."];
    respondWith({
      blocks: [
        { text: "Aciclovir - antiviral medication.", kind: "MEDICATION", fromRegions: [0] },
        // Same region, reworded. Salvage would duplicate the row; the content survives above.
        { text: "Aciclovir is an antiviral drug.", kind: "OBSERVATION", fromRegions: [0] },
      ],
    });
    const r = await classify(regions.join("\n"), regions, {});
    expect(r.blocks).toHaveLength(1);
    expect(r.droppedBlocks).toBe(1);
    expect(r.salvagedBlocks).toBe(0);
  });

  it("still drops a reworded block with no usable regions — there is nothing to rebuild from", async () => {
    respondWith({
      blocks: [{ text: "The student should review NEWS2.", kind: "TODO", fromRegions: [99] }],
    });
    const r = await classify(page, [page], {});
    expect(r.blocks).toHaveLength(0);
    expect(r.droppedBlocks).toBe(1);
    expect(r.salvagedBlocks).toBe(0);
  });

  it("drops candidate codes that aren't real NMC codes", async () => {
    respondWith({
      blocks: [
        {
          text: "Aciclovir - antiviral medication.",
          kind: "MEDICATION",
          // B2.1 is real; the others are invented.
          candidateCodes: ["B2.1", "Z99.9", "made-up"],
        },
      ],
    });
    const r = await classify(page, [page], {});
    expect(r.blocks[0].candidateCodes).toEqual(["B2.1"]);
    expect(r.droppedCodes).toBe(2);
  });

  it("coerces an unrecognised kind to UNKNOWN rather than failing (P34)", async () => {
    respondWith({ blocks: [{ text: "Aciclovir - antiviral medication.", kind: "WHATEVER" }] });
    const r = await classify(page, [page], {});
    expect(r.blocks[0].kind).toBe("UNKNOWN");
  });

  it("tolerates the model's null-for-absent idiom instead of discarding the page", async () => {
    // The exact shapes the first corpus baseline lost whole classifications to:
    // `groupKey: null` and `gibbs: {FEELINGS: null}` (2026-08-04 CloudWatch).
    respondWith({
      blocks: [
        {
          text: "Aciclovir - antiviral medication.",
          kind: "MEDICATION",
          candidateCodes: [],
          groupKey: null,
          medicationCandidate: null,
          targetType: null,
        },
        {
          text: "Felt out of my depth when family asked.",
          kind: "REFLECTION",
          candidateCodes: [],
          gibbs: { DESCRIPTION: "Felt out of my depth when family asked.", FEELINGS: null },
        },
      ],
    });
    const r = await classify(page, [page], {});
    expect(r.failed).toBe(false);
    expect(r.blocks).toHaveLength(2);
    expect(r.blocks[0].groupKey).toBeUndefined();
    expect(r.blocks[1].gibbs).toEqual({
      DESCRIPTION: "Felt out of my depth when family asked.",
    });
  });

  it("salvages the good blocks when one block is malformed, not the whole page", async () => {
    respondWith({
      blocks: [
        { text: "Aciclovir - antiviral medication.", kind: "MEDICATION", candidateCodes: [] },
        { kind: "MEDICATION" }, // no text at all — truly malformed
      ],
    });
    const r = await classify(page, [page], {});
    expect(r.failed).toBe(false);
    expect(r.blocks).toHaveLength(1);
  });

  it("lets a DIAGRAM block reorder the page's words, but not introduce any", async () => {
    const mapPage =
      "SEPSIS SIX within 1 hour\n1. O2 keep sats 94-98%\n2. blood cultures BEFORE abx";
    respondWith({
      blocks: [
        {
          // Reading order differs from region order — substring containment can never hold.
          text: "SEPSIS SIX within 1 hour: blood cultures BEFORE abx; O2 keep sats 94-98%",
          kind: "DIAGRAM",
          candidateCodes: [],
          tags: ["mind map"],
        },
        {
          // Same reordering freedom must NOT allow invention.
          text: "SEPSIS SIX: give adrenaline immediately",
          kind: "DIAGRAM",
          candidateCodes: [],
        },
      ],
    });
    const r = await classify(mapPage, [mapPage], {});
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].kind).toBe("DIAGRAM");
    expect(r.droppedBlocks).toBe(1);
  });

  it("degrades to no blocks when the model fails, so the parse still returns", async () => {
    chatImpl = async () => {
      throw new Error("upstream 500");
    };
    const r = await classify(page, [page], {});
    expect(r.failed).toBe(true);
    expect(r.blocks).toEqual([]);
  });

  it("never sends ProficiencyStatus in the prompt (P32 evidence-integrity guard)", async () => {
    respondWith({ blocks: [] });
    await classify(page, [page], {
      medicationNames: ["Aciclovir"],
      tagLabels: ["haematology"],
      placementName: "Ward 9",
      placementSetting: "acute",
    });
    const sent = JSON.stringify(chatCalls[0]);
    expect(sent).toContain("Aciclovir");
    expect(sent).toContain("Ward 9");
    // Ranking evidence by what the student still needs would corrupt a record headed for the
    // NMC, so these must never reach the model.
    expect(sent).not.toContain("NOT_YET_ACHIEVED");
    expect(sent).not.toContain("DEVELOPING");
    expect(sent).not.toMatch(/ProficiencyStatus/i);
  });

  it("sends all 219 statements, not a kind-filtered subset (P29)", async () => {
    respondWith({ blocks: [] });
    await classify(page, [page], {});
    const sent = String(chatCalls[0]?.messages?.[1]?.content ?? "");
    // A platform statement AND an Annexe B one — the cross-match P29 exists to allow.
    expect(sent).toContain("1.1|");
    expect(sent).toContain("B2.1|");
  });
});

describe("checkResponseSchema — the check model's observed shape drifts (H4)", () => {
  it("accepts the contract shape", async () => {
    const { checkResponseSchema } = await import("../infra/lambda/parse/schema");
    const r = checkResponseSchema.parse({ blocks: [{ rawText: "Aciclovir daily" }] });
    expect(r.blocks).toEqual(["Aciclovir daily"]);
  });

  it("folds gemma's array-of-wrappers back together — the 2026-08-17 opens= shape", async () => {
    const { checkResponseSchema } = await import("../infra/lambda/parse/schema");
    const r = checkResponseSchema.parse([
      { blocks: [{ rawText: "Aciclovir daily" }] },
      { blocks: [{ rawText: "Filgrastim SC" }] },
    ]);
    expect(r.blocks).toEqual(["Aciclovir daily", "Filgrastim SC"]);
  });

  it("wraps a bare array of entries, and takes plain-string entries", async () => {
    const { checkResponseSchema } = await import("../infra/lambda/parse/schema");
    expect(checkResponseSchema.parse([{ rawText: "one" }, "two"]).blocks).toEqual(["one", "two"]);
  });

  it("salvages per entry — one malformed entry never costs the page", async () => {
    const { checkResponseSchema } = await import("../infra/lambda/parse/schema");
    const r = checkResponseSchema.parse({ blocks: [{ rawText: "kept" }, { rawText: null }, 42] });
    expect(r.blocks).toEqual(["kept"]);
  });
});
