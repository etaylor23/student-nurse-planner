import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "./helpers/setupDom";

/**
 * The capture affordance (spec-note-capture.md P2/P15).
 *
 * What's actually worth asserting here is the GATING, not the pixels: the PII warning has to
 * be unavoidable before the camera opens (P2), and the button must be absent for guests and
 * for builds whose backend isn't deployed — a button that always fails is worse than none.
 */

const captureAvailable = vi.fn(() => true);
// Typed with the real signature so `mock.calls[0][1]` is checked, not `any`.
const startCapture = vi.fn(async (_files: File[], _opts: { piiAcknowledged: boolean }) => {});
const useRepositoryMock = vi.fn(() => ({ isGuest: false }));

vi.mock("../src/react/components/capture/config", () => ({
  captureAvailable: () => captureAvailable(),
  MAX_IMAGES_PER_CAPTURE: 10,
  CAPTURE_ENABLED: true,
}));

vi.mock("../src/react/components/capture/useCapture", () => ({
  useCapture: () => ({ state: { stage: "idle" }, startCapture, reset: vi.fn() }),
}));

vi.mock("../src/react/RepositoryContext", () => ({
  useRepository: () => useRepositoryMock(),
}));

const { CaptureButton } = await import("../src/react/components/capture/CaptureButton");

beforeEach(() => {
  captureAvailable.mockReturnValue(true);
  useRepositoryMock.mockReturnValue({ isGuest: false });
  startCapture.mockClear();
});

describe("CaptureButton — gating", () => {
  it("renders nothing for a guest (no token, so no presign is possible)", () => {
    useRepositoryMock.mockReturnValue({ isGuest: true });
    const { container } = render(<CaptureButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the build hasn't opted in", () => {
    captureAvailable.mockReturnValue(false);
    const { container } = render(<CaptureButton />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders for a signed-in user on an opted-in build", () => {
    render(<CaptureButton />);
    expect(screen.getByLabelText("Photograph your notes")).toBeTruthy();
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
