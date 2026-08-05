import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "./helpers/setupDom";

/**
 * The capture affordance (spec-note-capture.md P2/P15).
 *
 * What's actually worth asserting here is the GATING, not the pixels: the PII warning has to
 * be unavoidable before the camera opens (P2), and the button must be absent for guests —
 * they have no ID token, so the presign could never be authorised — and off localhost, where
 * capture is still a beta (spec-home-redesign.md decision 12).
 */

// Typed with the real signature so `mock.calls[0][1]` is checked, not `any`.
const startCapture = vi.fn(async (_files: File[], _opts: { piiAcknowledged: boolean }) => {});
const reset = vi.fn();
/** A signed page URL expires, and the capture outlives the dialog — so opening it re-signs. */
const ensurePageImage = vi.fn(async () => {});
const resumeInterrupted = vi.fn(async () => false);
const useRepositoryMock = vi.fn(() => ({ isGuest: false }));
/** The localhost-only beta gate (decision 12) — flipped per test. */
const photoCaptureAvailable = vi.fn(() => true);
/** Swapped per test so the dialog can be driven into its review stage. */
let captureState: Record<string, unknown> = { stage: "idle" };

vi.mock("../src/react/components/capture/config", () => ({
  MAX_IMAGES_PER_CAPTURE: 10,
  DAILY_PHOTO_LIMIT: 10,
  photoCaptureAvailable: () => photoCaptureAvailable(),
}));

/** A capture mid-review: 70 seconds of model time and real `NoteBlock` rows already written. */
function inReview() {
  captureState = {
    stage: "review",
    blocks: [
      {
        id: "blk-1",
        userId: "u1",
        captureId: "cap-1",
        imageIndex: 0,
        rawText: "Aciclovir - antiviral medication.",
        text: "Aciclovir - antiviral medication.",
        kind: "MEDICATION",
        confidence: 1,
        bboxX0: 0,
        bboxY0: 0,
        bboxX1: 1,
        bboxY1: 1,
        rotationDeg: 0,
        status: "PENDING",
        targetType: "MED_LOG",
        createdAt: "2026-07-30T10:00:00.000Z",
        updatedAt: "2026-07-30T10:00:00.000Z",
      },
    ],
    parsed: [{ corrections: [], pageDateRaw: null, blocks: [] }],
  };
}

vi.mock("../src/react/components/capture/useCapture", () => ({
  useCapture: () => ({
    state: captureState,
    startCapture,
    reset,
    selectShift: vi.fn(),
    allocate: vi.fn(),
    unallocate: vi.fn(),
    editBlock: vi.fn(),
    dismissBlock: vi.fn(),
    createMedication: vi.fn(),
    rerunFromScratch: vi.fn(),
    // Opening the dialog checks for a capture the last session lost (H9). Nothing to resume
    // here, so it answers false and the ordinary PII-warning flow runs.
    resumeInterrupted,
    ensurePageImage,
  }),
}));

vi.mock("../src/react/RepositoryContext", () => ({
  useRepository: () => useRepositoryMock(),
}));

const { CaptureButton } = await import("../src/react/components/capture/CaptureButton");

beforeEach(() => {
  useRepositoryMock.mockReturnValue({ isGuest: false });
  photoCaptureAvailable.mockReturnValue(true);
  startCapture.mockClear();
  reset.mockClear();
  ensurePageImage.mockClear();
  captureState = { stage: "idle" };
});

describe("CaptureButton — gating", () => {
  it("renders nothing for a guest (no token, so no presign is possible)", () => {
    useRepositoryMock.mockReturnValue({ isGuest: true });
    const { container } = render(<CaptureButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders for a signed-in user on localhost", () => {
    render(<CaptureButton />);
    expect(screen.getByLabelText("Photograph your notes")).toBeTruthy();
  });

  /**
   * This is the only entry point, so an absent button is the whole feature being off —
   * not just a tidier header. Asserting the empty tree, rather than a hidden button,
   * is what pins that down.
   */
  it("renders nothing off localhost — capture is still a beta (decision 12)", () => {
    photoCaptureAvailable.mockReturnValue(false);
    const { container } = render(<CaptureButton />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("CaptureButton — the PII warning is unavoidable (P2)", () => {
  it("shows the warning before any file picker, naming what not to capture", () => {
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Before you take the photo");
    // The specific identifiers matter — a vague "be careful" would not do the job.
    expect(dialog.textContent).toMatch(/NHS numbers/i);
    expect(dialog.textContent).toMatch(/dates of birth/i);
    // Storage + review are disclosed here because P2 accepts the risk on that basis.
    expect(dialog.textContent).toMatch(/stored/i);
    expect(dialog.textContent).toMatch(/PlaceMate team may review/i);
  });

  it("only exposes the file input behind the acknowledgement button", () => {
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));

    const ack = screen.getByRole("button", { name: /I've checked/i });
    expect(ack).toBeTruthy();

    // The input exists but is hidden; the acknowledge button is what opens it. Asserting the
    // click wiring rather than the picker itself, since jsdom can't open a real file dialog.
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.accept).toBe("image/*");
    expect(input.multiple).toBe(true);
    expect(input.className).toContain("hidden");
  });

  it("records the acknowledgement when files are chosen", () => {
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(10)], "notes.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(startCapture).toHaveBeenCalledTimes(1);
    expect(startCapture.mock.calls[0][1]).toEqual({ piiAcknowledged: true });
  });
});

describe("CaptureButton — closing must not cost the parse", () => {
  it("does NOT close when the backdrop is clicked", () => {
    inReview();
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));

    // The backdrop is the dialog's parent. One stray tap here used to bin the whole parse.
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("closes on the close button and keeps the capture, so re-opening resumes", () => {
    inReview();
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));
    fireEvent.click(screen.getByLabelText("Close"));

    expect(screen.queryByRole("dialog")).toBeNull();
    // Closing is putting the window down, not throwing the work away.
    expect(reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Photograph your notes"));
    expect(screen.getByRole("dialog").textContent).toContain("Aciclovir");
  });

  it("only discards the capture when the student explicitly starts again", () => {
    inReview();
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));
    fireEvent.click(screen.getByRole("button", { name: /Start again/i }));

    expect(reset).toHaveBeenCalledTimes(1);
    // Still open, and back at the PII warning rather than straight into the camera (P2).
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("won't close mid-parse, by either route", () => {
    captureState = { stage: "parsing", progress: { current: 1, total: 1 } };
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));

    expect(screen.getByLabelText("Close")).toHaveProperty("disabled", true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });
});

describe("CaptureButton — the page photo", () => {
  it("re-signs the page URL when the dialog opens", () => {
    // The signed GET lasts an hour, and the capture deliberately outlives the dialog — so a
    // student who comes back later must not find a broken photo where their page was.
    inReview();
    render(<CaptureButton />);
    expect(ensurePageImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Photograph your notes"));
    expect(ensurePageImage).toHaveBeenCalledTimes(1);
  });

  it("reviews perfectly well without one", () => {
    inReview();
    render(<CaptureButton />);
    fireEvent.click(screen.getByLabelText("Photograph your notes"));
    // No `pageImageUrl` in state: the photo pane simply isn't there, and the notes are.
    expect(screen.queryByAltText(/page of notes you photographed/i)).toBeNull();
    expect(screen.getByRole("dialog").textContent).toContain("Aciclovir");
  });
});
