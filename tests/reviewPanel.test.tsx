import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "./helpers/setupDom";
import { ReviewPanel, type ReviewHandlers } from "../src/react/components/capture/ReviewPanel";
import type { NoteBlock } from "../src/domain/types";

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
    ...over,
  };
}

/** The student already uses "haematology" and already has a Filgrastim card. */
const KNOWN = {
  medications: [{ id: "med-filg", name: "Filgrastim" }],
  tagLabels: ["haematology"],
};

describe("ReviewPanel", () => {
  it("renders every block's text so nothing parsed is hidden from the student", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    const boxes = screen.getAllByRole("textbox");
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLTextAreaElement).value).toContain("Aciclovir - antiviral medication");
    expect((boxes[1] as HTMLTextAreaElement).value).toContain("Filgrastim (GCSF)");
  });

  it("shows BOTH readings of every disputed word (P22)", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
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

  it("shows a code with its PLATFORM heading and full statement, not a bare number", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // "4.15" alone is meaningless to a student. The platform is the heading it needs, and the
    // statement is what lets them judge whether the suggestion is right.
    expect(screen.getAllByText(/Platform 4 · 4\.1[45]/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Demonstrate knowledge of pharmacology/i).length).toBeGreaterThan(0);
    // Section heading, so it is obvious what the codes ARE.
    expect(screen.getAllByText("NMC proficiency evidence").length).toBe(2);
  });

  it("lets a suggested code and a suggested tag be removed, and writes the removal back", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    // A suggestion you cannot decline is not a suggestion.
    const beforeTags = screen.getAllByText("haematology").length;
    await user.click(screen.getAllByLabelText("Remove tag haematology")[0]);
    expect(screen.getAllByText("haematology").length).toBe(beforeTags - 1);
    // Persisted — a removal that didn't stick would reappear on the next read.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { suggestedTags: "antiviral,HSV" });

    // Block 1 leads with 4.14, block 2 with 4.15 — one remove button each.
    expect(screen.getByLabelText("Remove proficiency 4.14")).toBeTruthy();
    await user.click(screen.getByLabelText("Remove proficiency 4.14"));
    // Gone, and block 1 now leads with its next-ranked suggestion instead.
    expect(screen.queryByLabelText("Remove proficiency 4.14")).toBeNull();
    expect(screen.getAllByLabelText("Remove proficiency 4.15")).toHaveLength(2);
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { candidateCodes: "4.15,3.3,2.12,B11.6" });
  });

  it("groups each part of a block under its own labelled section", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    // The first version stacked target, group, disputes, tags and codes as undifferentiated
    // chips and read as noise. These headings are what make it scannable.
    for (const heading of [
      "Worth a check",
      "Medication",
      "Tags",
      "NMC proficiency evidence",
      "File this",
    ]) {
      expect(screen.getAllByText(heading).length).toBeGreaterThan(0);
    }
    // The raw group key is NOT surfaced — it meant nothing to a reader.
    expect(screen.queryByText(/med-notes-haematology/)).toBeNull();
  });

  it("lets a block be retyped, including away from UNKNOWN (P34)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);
    const kinds = screen.getAllByLabelText(/^Type of block/);
    expect((kinds[0] as HTMLSelectElement).value).toBe("MEDICATION");
    // Every kind is reachable, so an UNKNOWN block is never a dead end.
    expect(kinds[0].querySelectorAll("option")).toHaveLength(7);

    await user.selectOptions(kinds[0], "REFLECTION");
    // Retyping is PERSISTED, not just local state — the row is what allocation reads.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", { kind: "REFLECTION" });
  });

  it("persists an edit to the text on blur, not on every keystroke", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);
    const box = screen.getAllByRole("textbox")[0];
    await user.click(box);
    await user.type(box, " Checked.");
    expect(h.onEdit).not.toHaveBeenCalled();
    await user.tab();
    expect(h.onEdit).toHaveBeenCalledTimes(1);
    expect((h.onEdit as ReturnType<typeof vi.fn>).mock.calls[0][1].text).toContain(" Checked.");
  });

  it("choosing a reading rewrites the text AND saves it", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);
    // Pick the check model's reading; the word must actually change in the note.
    await user.click(screen.getByRole("button", { name: "Acyclovir" }));
    expect((screen.getAllByRole("textbox")[0] as HTMLTextAreaElement).value).toContain("Acyclovir");
    // Both the new text and the shortened dispute list, so the page doesn't ask again.
    expect(h.onEdit).toHaveBeenCalledWith("blk-1", {
      text: expect.stringContaining("Acyclovir") as unknown as string,
      disputedWords: "",
    });
    // Resolved, so it stops being a question here and now.
    expect(screen.queryByRole("button", { name: "Acyclovir" })).toBeNull();
  });

  it("shows sanitiser corrections when there are any (P24)", () => {
    render(
      <ReviewPanel
        blocks={BLOCKS}
        corrections={["Phenoxyethylpenicillin|Phenoxymethylpenicillin"]}
        handlers={handlers()}
      />,
    );
    expect(screen.getByText(/Spell-checked/)).toBeTruthy();
    expect(screen.getByText("Phenoxyethylpenicillin")).toBeTruthy();
  });

  it("shows a page date exactly as written, never normalised (P8)", () => {
    render(<ReviewPanel blocks={BLOCKS} pageDateRaw="22/7" handlers={handlers()} />);
    expect(screen.getByText(/22\/7/)).toBeTruthy();
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
});

describe("ReviewPanel — the full taxonomy (P28)", () => {
  it("reaches any of the 219 statements by searching text, not just code", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} handlers={h} />);

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

  it("stays reachable when the classifier suggested nothing at all", () => {
    render(<ReviewPanel blocks={[block({ candidateCodes: undefined })]} handlers={handlers()} />);
    // Without this, a note evidencing something the classifier missed has no route in.
    expect(screen.getByRole("button", { name: "Find a different proficiency" })).toBeTruthy();
    expect(screen.getByText(/No proficiency suggested/)).toBeTruthy();
  });
});

describe("ReviewPanel — wide-screen lanes (P35)", () => {
  /** Lanes are chosen in JS, not CSS, so the test picks the viewport by stubbing matchMedia. */
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

  it("stays a list on a narrow screen — mobile is the primary path", () => {
    render(<ReviewPanel blocks={BLOCKS} handlers={handlers()} />);
    expect(screen.queryByLabelText("Medication log column")).toBeNull();
  });

  it("puts each block in the column for where it will be filed", () => {
    const restore = wideScreen();
    try {
      render(
        <ReviewPanel
          blocks={[block(), block({ id: "blk-2", targetType: "REFLECTION" })]}
          handlers={handlers()}
        />,
      );
      // All four routes are visible at once, which is the whole point of the layout.
      for (const lane of [
        "Reflection column",
        "Medication log column",
        "Proficiency evidence column",
        "Shift notes column",
      ]) {
        expect(screen.getByLabelText(lane)).toBeTruthy();
      }
      const meds = screen.getByLabelText("Medication log column");
      expect(meds.textContent).toContain("Medication log (1)");
      expect(screen.getByLabelText("Reflection column").textContent).toContain("Reflection (1)");
      // Only ONE copy of each card is mounted, or each would hold its own edit state.
      expect(screen.getAllByRole("textbox")).toHaveLength(2);
    } finally {
      restore();
    }
  });

  it("gives blocks the classifier wouldn't route their own honest area (P34)", () => {
    const restore = wideScreen();
    try {
      render(
        <ReviewPanel
          blocks={[block({ kind: "UNKNOWN", targetType: undefined })]}
          handlers={handlers()}
        />,
      );
      expect(screen.getByText(/Not decided \(1\)/)).toBeTruthy();
      expect(screen.getByLabelText("Shift notes column").textContent).toContain("Nothing here yet");
    } finally {
      restore();
    }
  });

  it("retypes the block when it's dropped in another column", () => {
    const restore = wideScreen();
    try {
      const h = handlers();
      render(<ReviewPanel blocks={[block()]} handlers={h} />);

      const card = screen.getByLabelText("Medication log column").querySelector("li")!;
      fireEvent.dragStart(card);
      const lane = screen.getByLabelText("Reflection column");
      fireEvent.dragOver(lane);
      fireEvent.drop(lane);

      // The lane view and the card's own target control write the SAME field, so they agree.
      expect(h.onEdit).toHaveBeenCalledWith("blk-1", { targetType: "REFLECTION" });
    } finally {
      restore();
    }
  });

  it("won't let a block that's already filed be dragged somewhere else", () => {
    const restore = wideScreen();
    try {
      const h = handlers();
      render(<ReviewPanel blocks={[block({ status: "ALLOCATED" })]} handlers={h} />);

      const card = screen.getByLabelText("Medication log column").querySelector("li")!;
      expect(card.getAttribute("draggable")).toBe("false");
      fireEvent.dragStart(card);
      fireEvent.drop(screen.getByLabelText("Reflection column"));

      // The real row already exists; moving the block would leave the two out of step.
      expect(h.onEdit).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

describe("ReviewPanel — medication cards (P33)", () => {
  it("links a block to the card the student already has, without asking", () => {
    render(<ReviewPanel blocks={BLOCKS} known={KNOWN} handlers={handlers()} />);
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
    await user.click(screen.getByRole("button", { name: "File it" }));
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

    await user.click(screen.getByRole("button", { name: "File it" }));
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

    await user.click(screen.getAllByRole("button", { name: "File it" })[0]);

    expect(h.onAllocate).toHaveBeenCalledWith("blk-1", {
      targetType: "MED_LOG", // pre-selected from the block, not defaulted
      proficiencyId: "prof_4.14", // the code the student left at the top
      // Only the label they already use — "antiviral" and "HSV" are new and opt-in (P37).
      tags: ["haematology"],
      gibbs: undefined,
      medicationId: undefined, // they haven't linked a card, so the log files unlinked (P33)
    });
  });

  it("respects a different target chosen in review", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    await user.selectOptions(screen.getAllByLabelText("Where to file this block")[0], "REFLECTION");
    await user.click(screen.getAllByRole("button", { name: "File it" })[0]);

    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].targetType).toBe(
      "REFLECTION",
    );
  });

  it("won't offer to file proficiency evidence with no code left selected (P30)", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block({ candidateCodes: undefined })]} handlers={h} />);

    await user.selectOptions(
      screen.getByLabelText("Where to file this block"),
      "PROFICIENCY_EVENT",
    );
    // Status and part index are the student's judgement, so there is nothing to guess from.
    expect(screen.getByText("Pick a proficiency above first")).toBeTruthy();
    expect(screen.getByRole("button", { name: "File it" })).toHaveProperty("disabled", true);
    expect(h.onAllocate).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from allocation instead of failing silently", async () => {
    const user = userEvent.setup();
    const h = handlers({
      onAllocate: vi.fn(async () => ({ ok: false as const, message: "Attach this to a shift." })),
    });
    render(<ReviewPanel blocks={[block()]} handlers={h} />);

    await user.click(screen.getByRole("button", { name: "File it" }));
    expect(screen.getByText("Attach this to a shift.")).toBeTruthy();
  });

  it("an ALLOCATED block reads as filed, is locked for editing, and offers Undo", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <ReviewPanel
        blocks={[block({ status: "ALLOCATED", targetType: "MED_LOG", targetId: "log-1" })]}
        handlers={h}
      />,
    );

    expect(screen.getByText(/Filed as Medication log/)).toBeTruthy();
    expect(screen.getByText(/1 filed/)).toBeTruthy();
    // Editing the text of a block that has already become a real row would leave the two out
    // of step, so it's locked until the student undoes the filing.
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
    // A filed block is settled — its disputes are no longer a question.
    expect(screen.queryByText("Worth a check")).toBeNull();
    expect(screen.queryByRole("button", { name: "File it" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(h.onUnallocate).toHaveBeenCalledWith("blk-1");
  });

  it("includes a new tag once the student ticks it", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={[block()]} known={KNOWN} handlers={h} />);

    // A new label is a permanent addition to the vocabulary their index is built on, so it is
    // opt-in — but opting in has to work.
    await user.click(screen.getByLabelText("Apply tag antiviral"));
    await user.click(screen.getByRole("button", { name: "File it" }));

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
    await user.click(screen.getByRole("button", { name: "File it" }));

    expect((h.onAllocate as ReturnType<typeof vi.fn>).mock.calls[0][1].tags).toEqual([]);
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
});
