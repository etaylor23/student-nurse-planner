import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "./helpers/setupDom";
import type { NoteBlock } from "../src/domain/types";
import { keptDrawingsForShift } from "../src/react/components/capture/blockState";

/**
 * The shift's Drawings tab (hardening H1).
 *
 * A kept drawing used to be visible only inside the review dialog that filed it; this tab is
 * its home on the shift. What matters here is that the rebuild is handed to the renderer, the
 * transcription is shown whole, and every note inside the drawing says what became of it —
 * filed in its own right, stored inside, or still waiting. It is deliberately view-only, so
 * there is nothing to click and nothing to write.
 *
 * `MermaidDiagram` is stubbed: its own contract (render the model's source or nothing at all,
 * P44) is a 1.5 MB layout engine's business, not this tab's. The tab's contract is that the
 * source reaches it.
 */
vi.mock("../src/react/components/MermaidDiagram", () => ({
  MermaidDiagram: ({ source, label }: { source: string; label: string }) => (
    <div data-testid="mermaid" aria-label={label}>
      {source}
    </div>
  ),
}));

const { ShiftDrawingsTab } = await import("../src/react/components/shift/ShiftDrawingsTab");

function block(over: Partial<NoteBlock> = {}): NoteBlock {
  return {
    id: "b",
    userId: "u1",
    captureId: "c1",
    imageIndex: 0,
    fromRegions: "4",
    rawText: "x",
    text: "x",
    kind: "OBSERVATION",
    confidence: 1,
    bboxX0: 0,
    bboxY0: 0,
    bboxX1: 1,
    bboxY1: 1,
    rotationDeg: 0,
    status: "PENDING",
    createdAt: "2026-08-04T10:00:00.000Z",
    updatedAt: "2026-08-04T10:00:00.000Z",
    ...over,
  };
}

/** The heart-failure flowchart from the corpus: a kept drawing with three notes inside it. */
const DRAWING = block({
  id: "d1",
  kind: "DIAGRAM",
  status: "KEPT",
  fromRegions: "3,4,5,6",
  text: "Heart failure → reduced cardiac output → renal perfusion falls → RAAS activation",
  diagramSource: "flowchart TD\n  A[Heart failure] --> B[Reduced cardiac output]",
});

const SUBS = [
  block({ id: "s1", fromRegions: "3", status: "ABSORBED", text: "preload vs afterload" }),
  block({
    id: "s2",
    fromRegions: "4",
    status: "ALLOCATED",
    targetType: "MED_LOG",
    text: "Furosemide 40mg IV given",
  }),
  block({ id: "s3", fromRegions: "5", status: "PENDING", text: "ask about ACE inhibitors" }),
];

const drawings = keptDrawingsForShift(
  "s1",
  [{ id: "c1", shiftId: "s1", createdAt: "2026-08-04T10:00:00.000Z" }],
  [...SUBS, DRAWING],
);

describe("ShiftDrawingsTab", () => {
  it("renders the rebuild, the transcription, and the notes inside the drawing", () => {
    render(<ShiftDrawingsTab drawings={drawings} />);

    expect(screen.getByTestId("mermaid")).toHaveTextContent("flowchart TD");
    expect(screen.getByLabelText("The drawing, rebuilt as a diagram")).toBeInTheDocument();
    expect(screen.getByText(/renal perfusion falls/)).toBeInTheDocument();
    expect(screen.getByText("Drawings kept with your photos · 1")).toBeInTheDocument();

    for (const text of ["preload vs afterload", "Furosemide 40mg IV given", "ask about ACE"]) {
      expect(
        screen.getByText(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      ).toBeVisible();
    }
  });

  it("says what became of each note inside the drawing", () => {
    render(<ShiftDrawingsTab drawings={drawings} />);

    // Filed in its own right — a real medication log exists, so it says which row.
    expect(screen.getByText("Filed as Medication log")).toBeInTheDocument();
    // Its words are already in the transcription above (P45) — no row of its own.
    expect(screen.getByText("Stored in the drawing")).toBeInTheDocument();
    // Still in the review walk: honest about being unfinished rather than implying it's filed.
    expect(screen.getByText("Still to review")).toBeInTheDocument();
  });

  it("is view-only — no controls, and it says where the controls are", () => {
    render(<ShiftDrawingsTab drawings={drawings} />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/reopen its page from the Photo button/)).toBeInTheDocument();
  });

  it("renders a drawing with no usable rebuild as its words alone (fail closed)", () => {
    const noRebuild = keptDrawingsForShift(
      "s1",
      [{ id: "c1", shiftId: "s1", createdAt: "2026-08-04T10:00:00.000Z" }],
      [{ ...DRAWING, diagramSource: undefined }],
    );
    render(<ShiftDrawingsTab drawings={noRebuild} />);

    expect(screen.queryByTestId("mermaid")).not.toBeInTheDocument();
    expect(screen.getByText(/renal perfusion falls/)).toBeInTheDocument();
  });

  it("says so plainly when the shift has kept no drawings", () => {
    render(<ShiftDrawingsTab drawings={[]} />);
    expect(screen.getByText(/None yet/)).toBeInTheDocument();
  });
});
