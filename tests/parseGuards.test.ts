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
