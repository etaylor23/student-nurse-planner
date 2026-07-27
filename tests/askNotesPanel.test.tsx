import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { AskHandlers } from "../src/data/api/aiClient";

/**
 * Component tests for the ask panel (spec-ai-recall-implementation.md Phase 4 §3).
 *
 * Phase 3 shipped with the sentinel parser well covered but the panel itself untested —
 * there was no way to exercise it without a live Cognito session, which is how a CSP bug
 * reached the user. These drive the state machine directly by controlling the client's
 * `ask()`, so streaming, note cards and every error state are checked without a network.
 */

// ---- Test doubles -----------------------------------------------------------------

/** Captures the handlers the panel passes in, so a test can drive the stream by hand. */
let capturedHandlers: AskHandlers | null = null;
let askImpl: (q: string, threadId: string | undefined, h: AskHandlers) => void | Promise<void>;
const sendFeedback = vi.fn().mockResolvedValue(undefined);
const listThreads = vi.fn().mockResolvedValue([]);

vi.mock("../src/data/api/aiClient", () => ({
  AiClient: class {
    listThreads = listThreads;
    getThread = vi.fn().mockResolvedValue({ thread: {}, messages: [] });
    deleteThread = vi.fn().mockResolvedValue(undefined);
    sendFeedback = sendFeedback;
    invalidate = vi.fn();
    async ask(q: string, threadId: string | undefined, handlers: AskHandlers) {
      capturedHandlers = handlers;
      await askImpl(q, threadId, handlers);
    }
  },
}));

vi.mock("../src/auth/passwordlessConfig", () => ({ API_BASE: "/api" }));
vi.mock("amazon-cognito-passwordless-auth/storage", () => ({
  retrieveTokens: vi.fn().mockResolvedValue({ idToken: "fake" }),
}));
vi.mock("../src/react/components/ai/config", async (orig) => ({
  ...(await orig<typeof import("../src/react/components/ai/config")>()),
  AI_ASK_URL: "https://ask.example",
  aiAvailable: () => true,
}));

const shift = {
  id: "s1",
  userId: "u1",
  date: "2026-03-02",
  shiftType: "EARLY" as const,
  entryMode: "NET" as const,
  netHours: 7.5,
  isSimulated: false,
  status: "COMPLETED" as const,
  notes: "Rest 5 min, arm at heart level, estimate systolic from the radial pulse.",
  createdAt: "2026-03-02T08:00:00.000Z",
  updatedAt: "2026-03-02T08:00:00.000Z",
};

let user: Record<string, unknown> | null = { id: "u1", aiFirstUsedAt: "2026-01-01T00:00:00Z" };
const getShift = vi.fn().mockResolvedValue(shift);
// STABLE identity, deliberately: `NoteCard` lists `repo` in its effect deps, so a mock
// that rebuilt this object per render would re-fetch → setState → re-render forever.
// The real provider memoises the repository, so this mirrors production rather than
// papering over it. (Found the hard way: the first version OOM'd the test worker.)
const repo = { getShift };
const reloadUser = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/react/RepositoryContext", () => ({
  useRepository: () => ({
    repo,
    user,
    userId: "u1",
    isGuest: false,
    loading: false,
    reloadUser,
    logout: vi.fn(),
  }),
}));

// Imported AFTER the mocks so the panel picks them up.
const { AskNotesPanel } = await import("../src/react/components/ai/AskNotesPanel");

function renderPanel() {
  return render(
    <MemoryRouter>
      <AskNotesPanel />
    </MemoryRouter>,
  );
}

async function ask(text: string) {
  const input = screen.getByLabelText("Ask your notes");
  await userEvent.type(input, text);
  await userEvent.click(screen.getByRole("button", { name: "Ask" }));
}

beforeEach(() => {
  capturedHandlers = null;
  user = { id: "u1", aiFirstUsedAt: "2026-01-01T00:00:00Z" };
  askImpl = () => {};
  vi.clearAllMocks();
  listThreads.mockResolvedValue([]);
  getShift.mockResolvedValue(shift);
});

// ---- Tests ------------------------------------------------------------------------

describe("AskNotesPanel — asking and streaming", () => {
  it("shows the question, then streams the answer in", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1", remaining: 29 });
      h.onDelta("Here is ");
      h.onDelta("what you logged.");
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("what did I log about BP?");

    expect(await screen.findByText("what did I log about BP?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Here is what you logged\./)).toBeInTheDocument());
  });

  it("renders a note card from the local database when the answer emits a note tag", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDelta('You wrote: <note ref="SHIFT:s1"/> — good detail.');
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("bp?");

    // The card body comes from the repository, NOT from the model's text — that is the
    // structural guarantee behind "word for word".
    expect(await screen.findByText(/estimate systolic from the radial pulse/)).toBeInTheDocument();
    expect(screen.getByText("From your notes")).toBeInTheDocument();
    expect(getShift).toHaveBeenCalledWith("s1");
    expect(screen.getByRole("link", { name: /Open this shift/ })).toHaveAttribute(
      "href",
      "/planner/s1",
    );
  });

  it("renders nothing for a note ref that does not resolve (fails closed)", async () => {
    getShift.mockResolvedValue(undefined);
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDelta('Ghost: <note ref="SHIFT:nope"/> end.');
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("bp?");

    await waitFor(() => expect(screen.getByText(/Ghost:/)).toBeInTheDocument());
    expect(screen.queryByText("From your notes")).not.toBeInTheDocument();
  });

  it("turns a <more/> tag into a search link on the authority's own site", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDelta('Read up: <more topic="manual blood pressure" source="nice-cks"/>');
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("bp?");

    const link = await screen.findByRole("link", { name: /Find more on NICE CKS/ });
    expect(link).toHaveAttribute(
      "href",
      "https://cks.nice.org.uk/search?q=manual%20blood%20pressure",
    );
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });
});

describe("AskNotesPanel — error states", () => {
  it("shows the friendly cap message and stops further asking", async () => {
    askImpl = (_q, _t, h) => h.onError("CAP", "You've used today's questions — back tomorrow 🌱");
    renderPanel();
    await ask("one too many");

    expect(await screen.findByRole("status")).toHaveTextContent(/used today's questions/);
    // No empty assistant bubble is left behind when nothing streamed.
    expect(screen.queryByLabelText("Helpful")).not.toBeInTheDocument();
  });

  it("disables the input when the kill switch is on", async () => {
    askImpl = (_q, _t, h) => h.onError("KILLED", "Ask-your-notes is taking a short break.");
    renderPanel();
    await ask("anything");

    await waitFor(() => expect(screen.getByLabelText("Ask your notes")).toBeDisabled());
  });

  it("keeps a partial answer when the stream errors mid-flight", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDelta("Half an answer");
      h.onError("THROTTLED", "The model is busy — try again in a moment.");
    };
    renderPanel();
    await ask("bp?");

    expect(await screen.findByText(/Half an answer/)).toBeInTheDocument();
    expect(screen.getByText(/cut short/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/model is busy/);
  });
});

describe("AskNotesPanel — beta notice and feedback", () => {
  it("shows the one-off notice only until the first ask (D13)", async () => {
    user = { id: "u1" }; // no aiFirstUsedAt yet
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    expect(screen.getByText(/may be reviewed by the PlaceMate team/)).toBeInTheDocument();

    await ask("first question");
    await waitFor(() =>
      expect(screen.queryByText(/may be reviewed by the PlaceMate team/)).not.toBeInTheDocument(),
    );
  });

  it("sends a thumbs-up against the server's message id, not the local placeholder", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "server-msg-1" });
      h.onDelta("An answer.");
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("bp?");

    await userEvent.click(await screen.findByLabelText("Helpful"));
    await waitFor(() =>
      expect(sendFeedback).toHaveBeenCalledWith("t1", "server-msg-1", "UP", undefined),
    );
  });

  it("offers a comment box on a thumbs-down", async () => {
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1" });
      h.onDelta("An answer.");
      h.onDone({ stopReason: "end_turn" });
    };
    renderPanel();
    await ask("bp?");

    await userEvent.click(await screen.findByLabelText("Not helpful"));
    expect(await screen.findByPlaceholderText(/What was off/)).toBeInTheDocument();
  });
});

describe("AskNotesPanel — composer behaviour", () => {
  it("won't submit an empty question", async () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
  });

  it("shows a stop button while streaming and the remaining count when it runs low", async () => {
    let resolve!: () => void;
    askImpl = (_q, _t, h) => {
      h.onMeta({ threadId: "t1", messageId: "m1", remaining: 3 });
      h.onDelta("thinking…");
      return new Promise<void>((r) => {
        resolve = () => {
          h.onDone({ stopReason: "end_turn" });
          r();
        };
      });
    };
    renderPanel();
    await ask("bp?");

    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(screen.getByText(/3 questions left today/)).toBeInTheDocument();
    resolve();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument());
    expect(capturedHandlers).not.toBeNull();
  });
});
