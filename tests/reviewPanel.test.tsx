import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./helpers/setupDom";
import { ReviewPanel, type ReviewHandlers } from "../src/react/components/capture/ReviewPanel";
import type { NoteBlock, Shift } from "../src/domain/types";
import type { ShiftResolution } from "../src/logic/captureShift";

/**
 * Review screen (spec-note-capture.md P35).
 *
 * The fixture is the REAL parse output from the deployed pipeline on the medication-notes
 * photo, persisted as `NoteBlock` rows the way `persistBlocks` writes them — including the
 * disputed words the two vision models actually disagreed on, and the Platform 4 codes the
 * classifier actually returned for medication notes (the cross-match P29 exists to allow).
 *
 * The panel reads the PERSISTED rows, so these fixtures are rows, not parse frames: that is
 * what allocation acts on, and what survives closing the dialog.
 *
 * **These assertions are about behaviour, not layout.** The screen was rebuilt around
 * progressive disclosure — one note expanded, the rest one line each — so most selectors here
 * now open something before asserting on it. What is asserted is unchanged: the same writes, the
 * same guards, the same refusals to guess.
 */

function block(over: Partial<NoteBlock> = {}): NoteBlock {
  return {
    id: "blk-1",
    userId: "u1",
    captureId: "a22b01a2-5c89-48d3-9bce-74888589e7f8",
    imageIndex: 0,
    fromRegions: "1",
    rawText:
      "Aciclovir - antiviral medication. e.g. HSV (Herpes simplex virus) viral prevention medication in haematology patients.",
    text: "Aciclovir - antiviral medication. e.g. HSV (Herpes simplex virus) viral prevention medication in haematology patients.",
    kind: "MEDICATION",
    confidence: 1,
    bboxX0: 0.18,
    bboxY0: 0.1,
    bboxX1: 0.82,
    bboxY1: 0.24,
    rotationDeg: 0,
    disputedWords: "Aciclovir|Acyclovir",
    candidateCodes: "4.14,4.15,3.3,2.12,B11.6",
    suggestedTags: "haematology,antiviral,HSV",
    medicationCandidate: "Aciclovir",
    groupId: "med-notes-haematology",
    status: "PENDING",
    targetType: "MED_LOG",
    createdAt: "2026-07-29T10:00:00.000Z",
    updatedAt: "2026-07-29T10:00:00.000Z",
    ...over,
  };
}

const BLOCKS: NoteBlock[] = [
  block(),
  block({
    id: "blk-2",
    fromRegions: "3",
    rawText:
      "Filgrastim (GCSF) - man made protein used to treat neutropenia. Caused by chemo, bone marrow transplants and radiation.",
    text: "Filgrastim (GCSF) - man made protein used to treat neutropenia. Caused by chemo, bone marrow transplants and radiation.",
    confidence: 0.95,
    disputedWords: "Filgrastim|Filgastim,transplants|transplant",
    candidateCodes: "4.15,4.14,3.3,3.2,B11.7",
    suggestedTags: "haematology,GCSF,neutropenia",
    medicationCandidate: "Filgrastim",
  }),
];

function handlers(over: Partial<ReviewHandlers> = {}): ReviewHandlers {
  return {
    onEdit: vi.fn(async () => {}),
    onAllocate: vi.fn(async () => ({ ok: true as const, label: "Medication log" })),
    onUnallocate: vi.fn(async () => ({})),
    onCreateMedication: vi.fn(async () => "med-new"),
    onDismiss: vi.fn(async () => {}),
    onKeep: vi.fn(async () => {}),
    ...over,
  };
}

/** The student already uses "haematology" and already has a Filgrastim card. */
const KNOWN = {
  medications: [{ id: "med-filg", name: "Filgrastim" }],
  tagLabels: ["haematology"],
};

/** The tiles are labelled with the full destination name, which is what gets announced. */
const TILE = {
  reflection: "Reflection",
  medLog: "Medication log",
  proficiency: "Proficiency evidence",
  shift: "Shift notes",
} as const;

/** The drawer's own headings are `<p>`s. Scoping matters for "NMC evidence" in particular:
 *  it is also the Proficiency tile's blurb, in a `<span>`. */
const AS_LABEL = { selector: "p" } as const;

/** Focus is what expands a note into a card, so most tests have to move it first. */
function focusNote(n: number) {
  return userEvent.setup().click(screen.getByLabelText(new RegExp(`^Go to note ${n}\\b`)));
}

/** The layout above `lg` — photo column, drag drop-bar. Chosen in JS, not CSS, so the test
 *  picks the viewport by stubbing matchMedia (the same reason `useWideScreen` exists). */
function wideScreen() {
  const real = window.matchMedia;
  window.matchMedia = ((q: string) => ({
    matches: q.includes("min-width"),
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = real;
  };
}

describe("ReviewPanel — progressive disclosure", () => {
  it("expands ONE note and shows the rest as one line each", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // The first version put every field of all five notes on one plane and there was no first
    // action. Exactly one note is editable at a time now.
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain(
      "Aciclovir - antiviral medication",
    );
    // Nothing parsed is hidden, though — every other note is still on screen as a preview, so
    // the whole page's routing reads in one eyeful.
    expect(screen.getByText(/Filgrastim \(GCSF\)/)).toBeTruthy();
    expect(screen.getByText("Needs you (2)")).toBeTruthy();
  });

  it("truncates a preview at a word boundary, never mid-drug-name", () => {
    render(
      <ReviewPanel
        blocks={[
          block(),
          block({
            id: "blk-2",
            text: "Phenoxymethylpenicillin (Penicillin V) - antibiotic, treats pneumococcal and bacterial infections given to haematology patients.",
          }),
        ]}
        handlers={handlers()}
      />,
    );
    // "Phenoxymethyl…" and "Phenoxyethyl…" are the exact pair a student may be being asked to
    // tell apart, so half a drug name is worse than a shorter line.
    const preview = screen.getByText(/^Phenoxymethylpenicillin/).textContent ?? "";
    expect(preview.endsWith("…")).toBe(true);
    expect(preview).toContain("Phenoxymethylpenicillin (Penicillin V)");
    for (const word of preview.replace("…", "").split(" ")) {
      expect(
        "Phenoxymethylpenicillin (Penicillin V) - antibiotic, treats pneumococcal and bacterial infections given to haematology patients.",
      ).toContain(word);
    }
  });

  it("moves focus with the arrow keys, and never into a filed note", async () => {
    render(
      <ReviewPanel
        blocks={[block(), block({ id: "blk-2", status: "ALLOCATED" }), block({ id: "blk-3" })]}
        handlers={handlers()}
      />,
    );
    expect(screen.getByLabelText("Note 1 text")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    // Note 2 is filed — it is not a stop on the way, so ↓ lands on note 3.
    expect(screen.getByLabelText("Note 3 text")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    expect(screen.getByLabelText("Note 1 text")).toBeTruthy();
  });

  it("does not fire shortcuts while the student is typing", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    const box = screen.getByRole("textbox");
    await user.click(box);
    // "4" is a destination shortcut AND a character. In a textarea it must be a character.
    await user.type(box, " 4{Enter}");
    expect(h.onAllocate).not.toHaveBeenCalled();
    expect(h.onEdit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note 1 text")).toBeTruthy(); // ⏎ didn't file it either
  });

  it("has no bulk-accept control anywhere", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // Every note is filed by its own button, deliberately. A "file all" would make the whole
    // review a formality.
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/file all|accept all|approve all/i);
    }
  });
});

describe("ReviewPanel — the photo is the map (P1)", () => {
  it("shows a region per note and focuses that note when one is clicked", async () => {
    const restore = wideScreen();
    try {
      const user = userEvent.setup();
      render(<ReviewPanel blocks={BLOCKS} imageUrl="https://s3/page.jpg" handlers={handlers()} />);

      const regions = screen.getAllByLabelText(/^Note \d+ on the page$/);
      expect(regions).toHaveLength(2);
      // Geometry comes from the bbox fractions already on the row.
      const box = (regions[0] as HTMLElement).style;
      expect(parseFloat(box.left)).toBeCloseTo(18);
      expect(parseFloat(box.top)).toBeCloseTo(10);
      expect(parseFloat(box.width)).toBeCloseTo(64);
      expect(parseFloat(box.height)).toBeCloseTo(14);

      await user.click(screen.getByLabelText("Note 2 on the page"));
      expect(screen.getByLabelText("Note 2 text")).toBeTruthy();
      // And back the other way: focusing a note marks its region as the current one.
      expect(screen.getByLabelText("Note 2 on the page").getAttribute("aria-current")).toBe("true");
      expect(screen.getByLabelText("Note 1 on the page").getAttribute("aria-current")).toBe(
        "false",
      );
    } finally {
      restore();
    }
  });

  it("stands up with no photo at all — the pane is an enhancement, not the route in", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    expect(screen.queryByLabelText(/on the page$/)).toBeNull();
    // Still every note, still editable.
    expect(screen.getByLabelText("Note 1 text")).toBeTruthy();
    expect(screen.getByText("Needs you (2)")).toBeTruthy();
  });
});

describe("ReviewPanel — the notes themselves", () => {
  it("shows BOTH readings of every disputed word (P22)", async () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // Disagreement is the only uncertainty signal that tracked correctness, so the student must
    // be able to see what the alternative was — not just that something is uncertain.
    for (const word of ["Aciclovir", "Acyclovir"]) {
      expect(screen.getAllByRole("button", { name: word }).length).toBeGreaterThan(0);
    }
    // Both flagged notes say so before they're opened, and both the header and the group say
    // how many there are — the same count in the two places a student looks for it.
    expect(screen.getAllByText("worth a check")).toHaveLength(2);
    expect(screen.getAllByText(/2 worth a check/)).toHaveLength(2);

    await focusNote(2);
    // Two disputed pairs, so two questions and two controls — not one merged into the other.
    for (const word of ["Filgrastim", "Filgastim", "transplants", "transplant"]) {
      expect(screen.getAllByRole("button", { name: word }).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/which matches your handwriting/)).toHaveLength(2);
  });

  it("choosing a reading rewrites the text AND saves it", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);
    // Pick the check model's reading; the word must actually change in the note.
    await user.click(screen.getByRole("button", { name: "Acyclovir" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toContain("Acyclovir");
    // Both the new text and the shortened dispute list, so the page doesn't ask again.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      text: expect.stringContaining("Acyclovir") as unknown as string,
      disputedWords: "",
    });
    // Resolved, so it stops being a question here and now.
    expect(screen.queryByRole("button", { name: "Acyclovir" })).toBeNull();
  });

  it("persists an edit to the text on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);
    const box = screen.getByRole("textbox");
    await user.click(box);
    await user.type(box, " Checked.");
    expect(h.onEdit).not.toHaveBeenCalled();
    await user.tab();
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect((h.onEdit as ReturnType<typeof vi.fn>).mock.calls[0][1].text).toContain(" Checked.");
  });

  it("offers a way back to exactly what was on the page, but only once it differs", async () => {
    const user = userEvent.setup();
    const h = handlers();
    // Sanitised text differs from the verbatim reading — the Americanised spelling was fixed.
    render(
      <ReviewPanel
        blocks={[block({ rawText: "Acyclovir - antiviral medication.", text: "Aciclovir." })]}
        handlers={h}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Back to what was on the page" }));
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { text: "Acyclovir - antiviral medication." });
    // Nothing to revert to once it matches, so the control goes away rather than lying.
    expect(screen.queryByRole("button", { name: "Back to what was on the page" })).toBeNull();
  });

  it("names what the classifier thought each note was", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    expect(screen.getByText("Medication")).toBeTruthy();
    // The raw group key is NOT surfaced — it meant nothing to a reader.
    expect(screen.queryByText(/med-notes-haematology/)).toBeNull();
  });
});

describe("ReviewPanel — where a note goes", () => {
  it("decides the note with ONE control, four visible options and no select", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    // `kind` and `targetType` were the same question asked twice, and a select hid three of the
    // four answers behind a click.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByText("Where does this go?")).toBeTruthy();
    for (const label of Object.values(TILE)) {
      expect(screen.getByRole("button", { name: label })).toBeTruthy();
    }
    // The classifier's route is pre-selected, not defaulted.
    expect(screen.getByRole("button", { name: TILE.medLog }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    // ...and what each one becomes, so the choice isn't four bare nouns.
    expect(screen.getByText("A medication log")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: TILE.reflection }));
    // `kind` follows underneath — it's what the recall corpus reads later (P14).
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      targetType: "REFLECTION",
      kind: "REFLECTION",
    });
  });

  it("sets the destination from the keyboard, on the number printed on the tile", () => {
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} handlers={h} />);
    fireEvent.keyDown(window, { key: "3" });
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      targetType: "PROFICIENCY_EVENT",
      kind: "CLINICAL_SKILL",
    });
  });

  it("leaves `kind` alone when it already implies the new destination", async () => {
    const user = userEvent.setup();
    const h = handlers();
    // A date header filed to shift notes: DATE_HEADER already maps to SHIFT_NOTES.
    render(
      <ReviewPanel
        blocks={[block({ kind: "DATE_HEADER", targetType: "REFLECTION" })]}
        handlers={h}
      />,
    );

    await user.click(screen.getByRole("button", { name: TILE.shift }));
    // No `kind` in the patch — turning it into an OBSERVATION would lose what it actually is.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { targetType: "SHIFT_NOTES" });
  });

  it("marks an unrouted note's row undecided rather than guessing at it (P34)", () => {
    render(
      <ReviewPanel
        blocks={[block(), block({ id: "blk-2", kind: "UNKNOWN", targetType: undefined })]}
        handlers={handlers()}
      />,
    );
    // A dashed, unfilled chip — an empty slot, not a value.
    expect(screen.getByText("Not decided")).toBeTruthy();
  });

  it("shows the four destinations ONLY inside the focused note", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // Four permanently-visible lanes cost about half the width to communicate four labels.
    // There is exactly one set of tiles on screen: the one belonging to the note being decided.
    expect(screen.getAllByRole("button", { name: TILE.reflection })).toHaveLength(1);
    expect(screen.queryByText(/Drag a note here/)).toBeNull();
  });

  it("a DIAGRAM files whole OR keeps with the page, and never loses its kind (P43/P45)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <ReviewPanel
        blocks={[
          block({
            kind: "DIAGRAM",
            targetType: undefined,
            disputedWords: "",
            text: "SEPSIS SIX within 1 hour: O2, cultures, antibiotics, fluids, lactate, urine",
          }),
        ]}
        handlers={h}
      />,
    );

    // Destinations are on the drawing's card now — it can file whole (P45)…
    expect(screen.getByText("Where does this go?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: TILE.shift }));
    // …but a drawing never stops being a DIAGRAM: no kind in the patch.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { targetType: "SHIFT_NOTES" });

    // …and keeping it with the page is still one button away.
    await user.click(screen.getByRole("button", { name: "Keep with this page" }));
    expect(h.onKeep).toHaveBeenCalledWith("blk-1", { absorbRest: true });
  });

  it("filing a drawing offers to store its still-pending sub-notes inside it (P45)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    const parent = block({
      id: "blk-diagram",
      kind: "DIAGRAM",
      fromRegions: "1,2,3",
      targetType: undefined,
      disputedWords: "",
      text: "Patient looks hypo YES NO",
    });
    const subYes = block({ id: "blk-yes", fromRegions: "2", text: "YES", disputedWords: "" });
    render(<ReviewPanel blocks={[parent, subYes]} handlers={h} />);

    // The parent is focused (first pending in page order after the region sort) and shows
    // the absorb control naming its one pending sub-note.
    expect(screen.getByText(/Store the remaining 1 note/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: TILE.shift }));
    await user.click(screen.getByRole("button", { name: "File as Shift notes" }));
    expect(h.onAllocate).toHaveBeenCalledWith(
      "blk-diagram",
      expect.objectContaining({ targetType: "SHIFT_NOTES", absorbRest: true }),
    );
  });

  it("nests sub-blocks under their drawing, absorbed ones greyed with an undo (P45)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    const parent = block({
      id: "blk-diagram",
      kind: "DIAGRAM",
      fromRegions: "1,2,3",
      targetType: undefined,
      disputedWords: "",
      text: "Patient looks hypo YES NO",
    });
    const absorbed = block({
      id: "blk-yes",
      fromRegions: "2",
      text: "YES",
      disputedWords: "",
      status: "ABSORBED",
    });
    render(<ReviewPanel blocks={[parent, absorbed]} handlers={h} />);

    expect(screen.getByText("Stored in the drawing")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUnallocate).toHaveBeenCalledWith("blk-yes");
  });

  it("shows a KEPT diagram as settled — out of the pending walk, labelled as kept", () => {
    render(
      <ReviewPanel
        blocks={[
          block({
            id: "blk-kept",
            kind: "DIAGRAM",
            status: "KEPT",
            targetType: undefined,
            disputedWords: "",
          }),
          block({ id: "blk-2" }),
        ]}
        handlers={handlers()}
      />,
    );

    expect(screen.getByText("Kept with the page")).toBeTruthy();
    // The spine counts it with the settled notes.
    expect(screen.getByText("1 of 2 filed")).toBeTruthy();
  });
});

describe("ReviewPanel — the detail drawer only shows what the destination needs", () => {
  it("shows the drug-card offer for a medication log, and no NMC picker", () => {
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={handlers()} />);
    expect(screen.getByText("Drug card")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Aciclovir" })).toBeTruthy();
    // Codes are not this note's question — it isn't going to a proficiency.
    expect(screen.queryByText("NMC evidence", AS_LABEL)).toBeNull();
  });

  it("shows the code shortlist and its full statement once it IS proficiency evidence", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel blocks={[block()]} handlers={handlers()} />);
    await user.click(screen.getByRole("button", { name: TILE.proficiency }));

    expect(screen.getByText("NMC evidence", AS_LABEL)).toBeTruthy();
    // "4.14" alone is meaningless to a student: the platform is the heading it needs, and the
    // statement is what lets them judge whether the suggestion is right.
    expect(screen.getByText(/Platform 4 · 4\.14/)).toBeTruthy();
    expect(screen.getByText(/principles of safe and effective administration/i)).toBeTruthy();
    // Every code is a pill, and the leading one — the one filing records against — is selected.
    expect(
      screen.getByRole("button", { name: /^Evidence 4\.14/ }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: /^Evidence 3\.3/ }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("shows the reflection stages it found rather than promising them", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPanel
        blocks={[block()]}
        gibbsByRawText={{
          [block().rawText]: { DESCRIPTION: "First supervised injection.", FEELINGS: "Nervous." },
        }}
        handlers={handlers()}
      />,
    );
    await user.click(screen.getByRole("button", { name: TILE.reflection }));
    expect(screen.getByText("Reflection stages we found")).toBeTruthy();
    expect(screen.getByText("First supervised injection.")).toBeTruthy();
    expect(screen.getByText("Nervous.")).toBeTruthy();
  });

  it("asks nothing extra for shift notes, but still offers the tags", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={handlers()} />);
    await user.click(screen.getByRole("button", { name: TILE.shift }));
    // Tags apply to all four destinations, so they are never the thing that disappears.
    expect(screen.getByLabelText("Don't apply tag haematology")).toBeTruthy();
    expect(screen.queryByText("Drug card")).toBeNull();
    expect(screen.queryByText("NMC evidence", AS_LABEL)).toBeNull();
  });

  it("lets a suggested code and a suggested tag be removed, and writes the removal back", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    // A suggestion you cannot decline is not a suggestion.
    await user.click(screen.getByLabelText("Remove tag haematology"));
    expect(screen.queryByLabelText("Remove tag haematology")).toBeNull();
    // Persisted — a removal that didn't stick would reappear on the next read.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { suggestedTags: "antiviral,HSV" });

    await user.click(screen.getByRole("button", { name: TILE.proficiency }));
    await user.click(screen.getByLabelText("Remove proficiency 4.14"));
    // Gone, and the note now leads with its next-ranked suggestion instead.
    expect(screen.queryByLabelText("Remove proficiency 4.14")).toBeNull();
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { candidateCodes: "4.15,3.3,2.12,B11.6" });
    expect(screen.getByText(/Platform 4 · 4\.15/)).toBeTruthy();
  });

  it("promotes the code the student picks above the model's ranking", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} handlers={h} />);
    await user.click(screen.getByRole("button", { name: TILE.proficiency }));
    await user.click(screen.getByRole("button", { name: /^Evidence 3\.3/ }));

    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      candidateCodes: "3.3,4.14,4.15,2.12,B11.6",
    });
  });
});

describe("ReviewPanel — the full taxonomy (P28)", () => {
  it("reaches any of the 219 statements by searching text, not just code", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} handlers={h} />);
    await user.click(screen.getByRole("button", { name: TILE.proficiency }));

    await user.click(screen.getByRole("button", { name: "Find a different proficiency" }));
    await user.type(screen.getByLabelText("Search NMC proficiencies"), "hand hygiene");
    const hit = screen.getAllByRole("button", { name: /hand hygiene/i })[0];
    await user.click(hit);

    // The student's choice outranks the model's ranking, so it becomes the selected one.
    const patch = (h.onEdit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as {
      candidateCodes: string;
    };
    expect(patch.candidateCodes.split(",")[0]).not.toBe("4.14");
    expect(patch.candidateCodes).toContain("4.14"); // the shortlist is kept, not thrown away
  });

  it("stays reachable when the classifier suggested nothing at all", async () => {
    const user = userEvent.setup();
    render(<ReviewPanel blocks={[block({ candidateCodes: undefined })]} handlers={handlers()} />);
    await user.click(screen.getByRole("button", { name: TILE.proficiency }));
    // Without this, a note evidencing something the classifier missed has no route in.
    expect(screen.getByRole("button", { name: "Find a different proficiency" })).toBeTruthy();
    expect(screen.getByText(/No proficiency suggested/)).toBeTruthy();
  });
});

describe("ReviewPanel — the meta strip", () => {
  it("states a stored reading in three words and holds the detail one click away (P41)", async () => {
    const user = userEvent.setup();
    const onRerun = vi.fn();
    render(
      <ReviewPanel
        blocks={BLOCKS}
        cachedFrom={new Date(Date.now() - 2 * 86_400_000).toISOString()}
        onRerun={onRerun}
        handlers={handlers()}
      />,
    );

    // The fact is never hidden — the chip says it — but the explanation is opt-in.
    const chip = screen.getByRole("button", { name: /Read 2 days ago/ });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/read this page before/i)).toBeNull();

    await user.click(chip);
    // A stored result that looked live would be worse than a slower one — and P41 says the
    // re-read is free, which the UI never used to mention.
    expect(screen.getByText(/read this page before/i)).toBeTruthy();
    expect(screen.getByText(/no charge against your daily photos/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Read it again from scratch/i }));
    expect(onRerun).toHaveBeenCalledTimes(1);
  });

  it("says nothing at all when the parse was live", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    expect(screen.queryByRole("button", { name: /^Read / })).toBeNull();
  });

  it("shows sanitiser corrections and states the boundary they respect (P24)", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPanel
        blocks={BLOCKS}
        corrections={["Phenoxyethylpenicillin|Phenoxymethylpenicillin"]}
        handlers={handlers()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "1 spelling fixed" }));
    expect(screen.getByText("Phenoxyethylpenicillin")).toBeTruthy();
    // The reassuring half of P24: clinical spelling only, never their words.
    expect(screen.getByText(/wording and abbreviations are untouched/i)).toBeTruthy();
  });

  it("opens one panel at a time", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPanel
        blocks={BLOCKS}
        cachedFrom={new Date().toISOString()}
        corrections={["a|b"]}
        handlers={handlers()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Read earlier today/ }));
    await user.click(screen.getByRole("button", { name: "1 spelling fixed" }));
    // Three stacked banners were the problem. Two open panels would be the same problem.
    expect(
      screen.getByRole("button", { name: /Read earlier today/ }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByText(/read this page before/i)).toBeNull();
  });

  it("shows a page date exactly as written, never normalised (P8)", () => {
    render(<ReviewPanel blocks={BLOCKS} pageDateRaw="22/7" handlers={handlers()} />);
    expect(screen.getByText(/22\/7/)).toBeTruthy();
  });
});

describe("ReviewPanel — which shift the page belongs to (P9)", () => {
  function shift(id: string, date: string): Shift {
    return {
      id,
      userId: "u1",
      date,
      shiftType: "LONG_DAY",
      entryMode: "NET",
      netHours: 11.5,
      isSimulated: false,
      status: "COMPLETED",
      createdAt: "2026-07-23T06:00:00.000Z",
      updatedAt: "2026-07-23T06:00:00.000Z",
    };
  }
  const fallback: ShiftResolution = {
    suggested: { shift: shift("sh-1", "2026-07-23"), confidence: "FALLBACK_RECENT" },
    candidates: [
      { shift: shift("sh-1", "2026-07-23"), confidence: "FALLBACK_RECENT" },
      { shift: shift("sh-2", "2026-07-21"), confidence: "FALLBACK_RECENT" },
    ],
    isFallback: true,
  };

  it("flags a recency guess as a guess, and never as a date match", async () => {
    const user = userEvent.setup();
    render(
      <ReviewPanel
        blocks={[block()]}
        shift={fallback}
        selectedShiftId="sh-1"
        handlers={handlers()}
      />,
    );
    // The model invented a year once already. A guess has to stay distinguishable from a match.
    const chip = screen.getByRole("button", { name: /Thu 23 Jul/ });
    expect(chip.textContent).toContain("worth a check");

    await user.click(chip);
    expect(screen.getByText(/just your most recent shift/i)).toBeTruthy();
  });

  it("re-attaches the page to another shift, and to none", async () => {
    const user = userEvent.setup();
    const onSelectShift = vi.fn();
    render(
      <ReviewPanel
        blocks={[block()]}
        shift={fallback}
        selectedShiftId="sh-1"
        onSelectShift={onSelectShift}
        handlers={handlers()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Thu 23 Jul/ }));
    await user.click(screen.getByRole("button", { name: /Tue 21 Jul/ }));
    expect(onSelectShift).toHaveBeenCalledWith("sh-2");

    await user.click(screen.getByRole("button", { name: "Don't attach to a shift" }));
    expect(onSelectShift).toHaveBeenCalledWith(undefined);
  });

  it("says so plainly when there are no shifts to attach to", () => {
    render(
      <ReviewPanel
        blocks={[block()]}
        shift={{ candidates: [], isFallback: true }}
        handlers={handlers()}
      />,
    );
    expect(screen.getByText(/no shifts logged yet/i)).toBeTruthy();
  });
});

describe("ReviewPanel — medication cards (P33)", () => {
  it("links a block to the card the student already has, without asking", async () => {
    render(<ReviewPanel blocks={BLOCKS} known={KNOWN} handlers={handlers()} />);
    await focusNote(2);
    // Same drug, same card — nothing to decide.
    expect(screen.getByText(/Linked to your/)).toBeTruthy();
    expect(screen.getByText("Filgrastim", { selector: "span.font-medium" })).toBeTruthy();
  });

  it("offers to create a card for a drug they don't have, and links what it creates", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    await user.click(screen.getByRole("button", { name: "Add Aciclovir" }));

    // Pre-filled from the block's OWN content — the note becomes the card's notes.
    expect(h.onCreateMedication).toHaveBeenCalledWith(
      "Aciclovir",
      expect.stringContaining("antiviral medication") as unknown as string,
    );
    await user.click(screen.getByRole("button", { name: /^File as/ }));
    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].medicationId).toBe(
      "med-new",
    );
  });

  it("still files the log when the offer is declined, just unlinked", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    await user.click(screen.getByRole("button", { name: "No thanks" }));
    expect(h.onCreateMedication).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^File as/ }));
    // Declining a card is not declining the note.
    expect(h.onAllocate).toHaveBeenCalled();
    expect(
      (h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].medicationId,
    ).toBeUndefined();
  });
});

describe("ReviewPanel — filing (P4/P19)", () => {
  it("files a block into the target the classifier suggested, with the kept tags and code", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} known={KNOWN} handlers={h} />);

    await user.click(screen.getByRole("button", { name: /^File as/ }));

    expect(h.onAllocate).toHaveBeenCalledWith("blk-1", {
      targetType: "MED_LOG", // pre-selected from the block, not defaulted
      proficiencyId: "prof_4.14", // the code the student left at the top
      // Only the label they already use — "antiviral" and "HSV" are new and opt-in (P37).
      tags: ["haematology"],
      gibbs: undefined,
      medicationId: undefined, // they haven't linked a card, so the log files unlinked (P33)
      absorbRest: false, // not a drawing, so nothing to store inside it (P45)
    });
  });

  it("files with ⏎ and writes exactly what the button would", async () => {
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(h.onAllocate).toHaveBeenCalledWith("blk-1", {
      targetType: "MED_LOG",
      proficiencyId: "prof_4.14",
      tags: ["haematology"],
      gibbs: undefined,
      medicationId: undefined,
      absorbRest: false,
    });
  });

  it("respects a different target chosen in review", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    await user.click(screen.getByRole("button", { name: TILE.reflection }));
    await user.click(screen.getByRole("button", { name: /^File as/ }));

    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].targetType).toBe(
      "REFLECTION",
    );
  });

  it("won't offer to file proficiency evidence with no code left selected (P30)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block({ candidateCodes: undefined })]} handlers={h} />);

    await user.click(screen.getByRole("button", { name: TILE.proficiency }));
    // Status and part index are the student's judgement, so there is nothing to guess from.
    expect(screen.getByText("Pick a proficiency first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^File as/ })).toHaveProperty("disabled", true);
    fireEvent.keyDown(window, { key: "Enter" });
    // The shortcut cannot get past a guard the button holds.
    expect(h.onAllocate).not.toHaveBeenCalled();
  });

  it("asks where an unrouted block goes rather than defaulting to shift notes (P34)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <ReviewPanel blocks={[block({ kind: "UNKNOWN", targetType: undefined })]} handlers={h} />,
    );

    // Quietly defaulting is how a reflection ends up appended to a shift as a wall of text.
    expect(screen.getByRole("button", { name: /^File it/ })).toHaveProperty("disabled", true);
    expect(screen.getByText("Choose where it goes first.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: TILE.reflection }));
    // UNKNOWN doesn't imply a reflection, so `kind` is brought along.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      targetType: "REFLECTION",
      kind: "REFLECTION",
    });
    expect(screen.getByRole("button", { name: /^File as/ })).toHaveProperty("disabled", false);
  });

  it("surfaces a refusal from allocation instead of failing silently", async () => {
    const user = userEvent.setup();
    const h = handlers({
      onAllocate: vi.fn(async () => ({ ok: false as const, message: "Attach this to a shift." })),
    });
    render(<ReviewPanel blocks={[block()]} handlers={h} />);

    await user.click(screen.getByRole("button", { name: /^File as/ }));
    expect(screen.getByText("Attach this to a shift.")).toBeTruthy();
  });

  it("collapses a filed block into its own group, locked, with an Undo", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <ReviewPanel
        blocks={[block({ status: "ALLOCATED", targetType: "MED_LOG", targetId: "log-1" })]}
        handlers={h}
      />,
    );

    expect(screen.getByText("Filed (1)")).toBeTruthy();
    // Say plainly that filing created a genuine row (P4).
    expect(screen.getByText("real entries now")).toBeTruthy();
    expect(screen.getByText("Filed as Medication log")).toBeTruthy();
    expect(screen.getByText(/1 of 1 filed/)).toBeTruthy();
    // Editing the text of a block that has already become a real row would leave the two out
    // of step, so there is no textarea until the student undoes the filing.
    expect(screen.queryByRole("textbox")).toBeNull();
    // A filed block is settled — its disputes are no longer a question, and it can't be filed
    // again or dismissed.
    expect(screen.queryByText("worth a check")).toBeNull();
    expect(screen.queryByRole("button", { name: /^File as|^File it/ })).toBeNull();
    expect(screen.queryByLabelText("Remove note 1")).toBeNull();
    // Nothing is left to do, so there is no "Needs you" group pretending otherwise.
    expect(screen.queryByText(/Needs you/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUnallocate).toHaveBeenCalledWith("blk-1");
  });

  it("tells the student when an undo could not be cleanly reversed", async () => {
    const user = userEvent.setup();
    const h = handlers({
      onUnallocate: vi.fn(async () => ({ warning: "That text has been edited in your notes." })),
    });
    render(
      <ReviewPanel
        blocks={[block({ status: "ALLOCATED", targetType: "SHIFT_NOTES" })]}
        handlers={h}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Undo" }));
    // Silently deleting a paragraph the student had rewritten would be worse than saying so.
    expect(screen.getByText("That text has been edited in your notes.")).toBeTruthy();
  });

  it("includes a new tag once the student ticks it", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    // A new label is a permanent addition to the vocabulary their index is built on, so it is
    // opt-in — but opting in has to work.
    await user.click(screen.getByLabelText("Apply tag antiviral"));
    await user.click(screen.getByRole("button", { name: /^File as/ }));

    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].tags).toEqual([
      "haematology",
      "antiviral",
    ]);
  });

  it("un-ticks a tag the student already uses if they don't want it here", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    await user.click(screen.getByLabelText("Don't apply tag haematology"));
    await user.click(screen.getByRole("button", { name: /^File as/ }));

    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].tags).toEqual([]);
  });
});

describe("ReviewPanel — drag (P35)", () => {
  it("shows the drop targets only while a drag is in progress", () => {
    const restore = wideScreen();
    try {
      render(<ReviewPanel blocks={[block()]} handlers={handlers()} />);
      // There is nothing to drop until you pick a note up, so there is no reason for the
      // targets to exist before then.
      expect(screen.queryByLabelText("Reflection drop target")).toBeNull();

      fireEvent.dragStart(screen.getByRole("textbox").closest("li")!);
      expect(screen.getByLabelText("Reflection drop target")).toBeTruthy();
    } finally {
      restore();
    }
  });

  it("retypes the note when it's dropped on another destination", () => {
    const restore = wideScreen();
    try {
      const h = handlers();
      render(<ReviewPanel blocks={[block()]} handlers={h} />);

      fireEvent.dragStart(screen.getByRole("textbox").closest("li")!);
      const lane = screen.getByLabelText("Reflection drop target");
      fireEvent.dragOver(lane);
      fireEvent.drop(lane);

      // A drop and the card's own tiles write the SAME field, so they can't disagree.
      expect(h.onEdit).toHaveBeenCalledWith("blk-1", { targetType: "REFLECTION" });
      // And the bar goes away again with the drag.
      expect(screen.queryByLabelText("Reflection drop target")).toBeNull();
    } finally {
      restore();
    }
  });

  it("won't let a block that's already filed be dragged somewhere else", () => {
    const restore = wideScreen();
    try {
      const h = handlers();
      render(<ReviewPanel blocks={[block({ status: "ALLOCATED" })]} handlers={h} />);

      const row = screen.getByText("Filed as Medication log").closest("li")!;
      expect(row.getAttribute("draggable")).toBe("false");
      fireEvent.dragStart(row);
      // The real row already exists; moving the block would leave the two out of step.
      expect(screen.queryByLabelText("Reflection drop target")).toBeNull();
      expect(h.onEdit).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("ReviewPanel — dismissing a note (P42)", () => {
  it("takes two taps and says the photo is kept", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    await user.click(screen.getByLabelText("Remove note 1"));
    // Not a one-tap delete: it removes a row, so it asks.
    expect(h.onDismiss).not.toHaveBeenCalled();
    expect(screen.getByText(/your photo is kept/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(h.onDismiss).toHaveBeenCalledWith("blk-1");
  });

  it("can be backed out of", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} handlers={h} />);

    await user.click(screen.getByLabelText("Remove note 1"));
    await user.click(screen.getByRole("button", { name: "Keep" }));

    expect(h.onDismiss).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Remove note 1")).toBeTruthy();
  });
});
