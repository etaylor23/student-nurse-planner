import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "./helpers/setupDom";
import { ReviewPanel } from "../src/react/components/capture/ReviewPanel";
import type { ParseResponse } from "../src/data/api/parseClient";

/**
 * Review screen (spec-note-capture.md P35).
 *
 * The fixture is the REAL parse output from the deployed pipeline on the medication-notes
 * photo, not invented data — including the four disputed words the two vision models actually
 * disagreed on, and the Platform 4 codes the classifier actually returned for medication
 * notes (the cross-match P29 exists to allow).
 */

const REAL_PARSE: ParseResponse = {
  captureId: "a22b01a2-5c89-48d3-9bce-74888589e7f8",
  imageIndex: 0,
  pageDateRaw: null,
  wardHint: null,
  corrections: [],
  blocks: [
    {
      fromRegions: [1],
      text: "Aciclovir - antiviral medication. e.g. HSV (Herpes simplex virus) viral prevention medication in haematology patients.",
      kind: "MEDICATION",
      groupKey: "med-notes-haematology",
      targetType: "MED_LOG",
      candidateCodes: ["4.14", "4.15", "3.3", "2.12", "B11.6"],
      tags: ["haematology", "antiviral", "HSV"],
      medicationCandidate: "Aciclovir",
      bbox: { x0: 0.18, y0: 0.1, x1: 0.82, y1: 0.24 },
      rotationDeg: 0,
      confidence: 1,
      disputedWords: ["Aciclovir|Acyclovir"],
    },
    {
      fromRegions: [3],
      text: "Filgrastim (GCSF) - man made protein used to treat neutropenia. Caused by chemo, bone marrow transplants and radiation.",
      kind: "MEDICATION",
      groupKey: "med-notes-haematology",
      targetType: "MED_LOG",
      candidateCodes: ["4.15", "4.14", "3.3", "3.2", "B11.7"],
      tags: ["haematology", "GCSF", "neutropenia"],
      medicationCandidate: "Filgrastim",
      bbox: { x0: 0.12, y0: 0.78, x1: 0.9, y1: 1 },
      rotationDeg: 0,
      confidence: 0.95,
      disputedWords: ["Filgrastim|Filgastim", "transplants|transplant"],
    },
  ],
};

describe("ReviewPanel", () => {
  it("renders every block's text so nothing parsed is hidden from the student", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLTextAreaElement).value).toContain("Aciclovir - antiviral medication");
    expect((boxes[1] as HTMLTextAreaElement).value).toContain("Filgrastim (GCSF)");
  });

  it("shows BOTH readings of every disputed word (P22)", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    // Disagreement is the only uncertainty signal that tracked correctness, so the student
    // must be able to see what the alternative was — not just that something is uncertain.
    for (const word of [
      "Aciclovir",
      "Acyclovir",
      "Filgrastim",
      "Filgastim",
      "transplants",
      "transplant",
    ]) {
      expect(screen.getAllByText(word).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/2 to check/)).toBeTruthy();
  });

  it("shows the top code with its STATEMENT, not just the bare code", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    // "4.14" alone is meaningless to a student; the statement is what lets them judge it.
    const top = screen.getAllByRole("button", { name: /^4\.1[45] —/ });
    expect(top.length).toBeGreaterThan(0);
    expect(top[0].textContent).toMatch(/\+4 more/);
  });

  it("lets a block be retyped, including away from UNKNOWN (P34)", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(2);
    expect((selects[0] as HTMLSelectElement).value).toBe("MEDICATION");
    // Every kind is reachable, so an UNKNOWN block is never a dead end.
    expect(selects[0].querySelectorAll("option")).toHaveLength(7);
  });

  it("surfaces medication candidates and reused tags", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    expect(screen.getAllByText(/Aciclovir/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("haematology").length).toBe(2);
  });

  it("shows sanitiser corrections when there are any (P24)", () => {
    render(
      <ReviewPanel
        parsed={[
          { ...REAL_PARSE, corrections: ["Phenoxyethylpenicillin|Phenoxymethylpenicillin"] },
        ]}
      />,
    );
    expect(screen.getByText(/Spell-checked/)).toBeTruthy();
    expect(screen.getByText("Phenoxyethylpenicillin")).toBeTruthy();
  });

  it("shows a page date exactly as written, never normalised (P8)", () => {
    render(<ReviewPanel parsed={[{ ...REAL_PARSE, pageDateRaw: "22/7" }]} />);
    expect(screen.getByText(/22\/7/)).toBeTruthy();
  });

  it("says plainly that filing isn't built yet, rather than implying it happened", () => {
    render(<ReviewPanel parsed={[REAL_PARSE]} />);
    expect(screen.getByText(/not built yet/)).toBeTruthy();
  });
});
