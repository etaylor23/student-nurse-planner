import { useEffect, useState } from "react";
import { useRepository } from "../../RepositoryContext";
import { aiAvailable } from "./config";
import { AskNotesPanel } from "./AskNotesPanel";

/**
 * The global ask affordance (spec-ai-recall.md D8): a header button that opens the SAME
 * `AskNotesPanel` as Home, in an overlay — so "ask your notes" is reachable from every
 * screen with identical behaviour, rather than being a Home-only feature.
 *
 * Hidden for guests (no token → no endpoint) and when the build has no ask URL, so a
 * missing deploy degrades to the coming-soon teaser rather than a dead button.
 */
export function AskNotesButton() {
  const { isGuest } = useRepository();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (isGuest || !aiAvailable()) return null;

  return (
    <>
      {/* A real-looking search field, not an icon: at ~40% of the header it reads as the
          primary way in, which a subtle sparkle icon did not. It is a BUTTON styled as an
          input (never a real input) — one click hands focus straight to the panel's own
          field, so there is no second box to retype into and no duplicated state. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group hidden h-9 w-[40%] min-w-[14rem] max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-left transition-colors hover:border-primary-300 hover:bg-white sm:flex"
        aria-label="Ask your notes"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-secondary-500"
          aria-hidden="true"
        >
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-400 group-hover:text-slate-500">
          Ask your notes anything…
        </span>
        <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-600 ring-1 ring-primary-100">
          AI
        </span>
      </button>

      {/* Below sm the header has no room for a field — fall back to the icon button. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 sm:hidden"
        aria-label="Ask your notes"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 text-secondary-500"
          aria-hidden="true"
        >
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 p-4 pt-16 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Ask your notes"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold tracking-tight text-ink">
                Ask your own notes
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-slate-100"
                aria-label="Close"
              >
                Esc
              </button>
            </div>
            <AskNotesPanel autoFocus />
          </div>
        </div>
      )}
    </>
  );
}
