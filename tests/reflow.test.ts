import { describe, expect, it } from "vitest";
import { reflow } from "../infra/lambda/parse/reflow";

/**
 * Closing the line breaks a notebook's width put in (spec-note-capture.md P11/P24).
 *
 * The fixture is the real transcription of the Filgrastim note off the test page, which is what
 * exposed this: seven hard-wrapped lines rendering as seven ragged lines in a review card three
 * times the width of the paper.
 *
 * Every case here is really the same assertion twice — the words must be identical afterwards,
 * and only the whitespace may move. That is what makes this safe to run over a student's own
 * clinical notes without touching P11 or P24.
 */

/** As the vision model transcribed it, wrapped exactly where the page wrapped. */
const FILGRASTIM = `Filgrastim (GCSF) - man made protein used to
treat neutropenia. Caused by
chemo, bone marrow transplants and
radiation. It stimulates the bone
marrow to produce white blood
cells. side effects - lower back
pain.`;

const words = (s: string) => s.split(/\s+/).filter(Boolean);

describe("reflow", () => {
  it("closes a sentence the paper broke", () => {
    const out = reflow(FILGRASTIM);
    expect(out).toBe(
      "Filgrastim (GCSF) - man made protein used to treat neutropenia. Caused by chemo, bone marrow transplants and radiation. It stimulates the bone marrow to produce white blood cells. side effects - lower back pain.",
    );
    expect(out).not.toContain("\n");
  });

  it("never changes a single word — only whitespace moves", () => {
    // The guarantee that makes this safe on the student's own words (P24), and that keeps
    // `rawText` honest (P11).
    expect(words(reflow(FILGRASTIM))).toEqual(words(FILGRASTIM));
  });

  it("keeps the paragraphs the student made", () => {
    const out = reflow("Aciclovir - antiviral\nmedication.\n\nGiven for HSV\nprophylaxis.");
    expect(out).toBe("Aciclovir - antiviral medication.\n\nGiven for HSV prophylaxis.");
  });

  it("keeps a list a list", () => {
    // Flattening this into a paragraph would lose the student's own structure — and a list of
    // side effects is exactly the kind of note they wrote as a list on purpose.
    const out = reflow("Side effects:\n- lower back pain\n- nausea\n- bone pain");
    expect(out).toBe("Side effects:\n- lower back pain\n- nausea\n- bone pain");
  });

  it("keeps numbered and lettered items apart too", () => {
    expect(reflow("Steps:\n1. check ID\n2) check allergy\na. sign")).toBe(
      "Steps:\n1. check ID\n2) check allergy\na. sign",
    );
  });

  it("leaves two finished sentences on their own lines", () => {
    // A line that ended its own thought was probably meant to end there.
    expect(reflow("Patient stable.\nGave paracetamol 1g.")).toBe(
      "Patient stable.\nGave paracetamol 1g.",
    );
  });

  it("is a no-op on text the classifier already joined", () => {
    // It runs over every block, not just the degraded ones, so this has to hold.
    const already = "Co-trimoxazole - antibiotic, treats bacterial and fungal infections.";
    expect(reflow(already)).toBe(already);
    expect(reflow(reflow(FILGRASTIM))).toBe(reflow(FILGRASTIM));
  });

  it("survives the empty and whitespace-only cases", () => {
    expect(reflow("")).toBe("");
    expect(reflow("\n\n  \n")).toBe("");
  });
});
