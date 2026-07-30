import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    ...over,
  };
}

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
});

describe("ReviewPanel — filing (P4/P19)", () => {
  it("files a block into the target the classifier suggested, with the kept tags and code", async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(<ReviewPanel blocks={BLOCKS} handlers={h} />);

    await user.click(screen.getAllByRole("button", { name: "File it" })[0]);

    expect(h.onAllocate).toHaveBeenCalledWith("blk-1", {
      targetType: "MED_LOG", // pre-selected from the block, not defaulted
      proficiencyId: "prof_4.14", // the code the student left at the top
      tags: ["haematology", "antiviral", "HSV"],
      gibbs: undefined,
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
