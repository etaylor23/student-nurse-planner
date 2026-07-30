import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRepository } from "../../RepositoryContext";
import { MAX_IMAGES_PER_CAPTURE } from "./config";
import { useCapture } from "./useCapture";

/**
 * The global capture affordance (spec-note-capture.md P15): photograph a page of notes from
 * anywhere, and the app works out which shift it belongs to later.
 *
 * The PII warning comes FIRST and is not skippable (P2). A camera cannot self-censor the way
 * a keyboard can — by the time a student notices a patient's name in frame, the photo exists
 * — so the only honest mitigation is to say so before the camera opens, and to record that
 * it was said (`piiAcknowledged` on the capture row).
 *
 * Hidden for guests only — they have no ID token, so the presign can't be authorised.
 * There is no build-time flag: if the backend isn't deployed the upload reports an error,
 * which tells you more than an invisible feature would.
 *
 * Portalled to `document.body` for the same reason the ask overlay is: the header carries
 * `backdrop-blur-md`, and a `backdrop-filter` ancestor becomes the containing block for
 * `position: fixed` descendants, which would clip the dim to the header strip.
 */
export function CaptureButton() {
  const { isGuest } = useRepository();
  const [open, setOpen] = useState(false);
  const { state, startCapture, reset } = useCapture();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.stage !== "uploading") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.stage]);

  // Guests only: no ID token means the presign can't be authorised (P17).
  if (isGuest) return null;

  function close() {
    if (state.stage === "uploading") return; // don't abandon an in-flight upload silently
    setOpen(false);
    reset();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES_PER_CAPTURE);
    e.target.value = ""; // let the same file be picked again after an error
    // Acknowledgement is true by construction: this handler is only reachable from the
    // button inside the warning panel below.
    await startCapture(files, { piiAcknowledged: true });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-primary-300 hover:text-slate-900"
        aria-label="Photograph your notes"
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
          <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.2a1 1 0 0 0 .8-.4l.9-1.2a1 1 0 0 1 .8-.4h4.6a1 1 0 0 1 .8.4l.9 1.2a1 1 0 0 0 .8.4h1.2A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-8Z" />
          <circle cx="12" cy="12.5" r="3.2" />
        </svg>
        <span className="hidden sm:inline">Photo</span>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center"
            onClick={close}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Photograph your notes"
              className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-ink-900">Photograph your notes</h2>
                <button
                  type="button"
                  onClick={close}
                  disabled={state.stage === "uploading"}
                  className="text-sm text-slate-400 hover:text-slate-600 disabled:opacity-40"
                >
                  Esc
                </button>
              </div>

              {(state.stage === "idle" || state.stage === "error") && (
                <>
                  {/* The warning is the whole point of this step (P2) — it is not a
                      formality, and it is deliberately the most prominent thing here. */}
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-medium">Before you take the photo</p>
                    <p className="mt-1">
                      Make sure nothing patient-identifiable is in frame — no names, NHS numbers,
                      dates of birth, bed numbers, or other people&apos;s paperwork behind your
                      page. Your photo is stored so you can check it against what we read, and the
                      PlaceMate team may review it.
                    </p>
                  </div>

                  {state.stage === "error" && (
                    <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                      {state.error}
                    </p>
                  )}

                  <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={onFiles}
                  />
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="mt-4 w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
                  >
                    I&apos;ve checked — take a photo
                  </button>
                  <p className="mt-2 text-center text-xs text-slate-400">
                    Up to {MAX_IMAGES_PER_CAPTURE} pages at a time.
                  </p>
                </>
              )}

              {state.stage === "uploading" && (
                <div className="mt-6 text-sm text-slate-600">
                  <p>
                    Uploading page {state.progress?.current} of {state.progress?.total}…
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{
                        width: `${((state.progress?.current ?? 0) / Math.max(1, state.progress?.total ?? 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {state.stage === "done" && (
                <div className="mt-6 text-sm text-slate-600">
                  <p className="font-medium text-ink-900">Saved 🌱</p>
                  <p className="mt-1">
                    Your{" "}
                    {state.capture?.imageKeys.split(",").filter(Boolean).length === 1
                      ? "page is"
                      : "pages are"}{" "}
                    stored. Reading them into notes comes next — that part isn&apos;t built yet.
                  </p>
                  {typeof state.remaining === "number" && state.remaining <= 3 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {state.remaining} photo{state.remaining === 1 ? "" : "s"} left today.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              )}

              {state.stage === "capped" && (
                <div className="mt-6 text-sm text-slate-600">
                  <p className="font-medium text-ink-900">
                    You&apos;ve used today&apos;s photos — they reset tomorrow. 🌱
                  </p>
                  {state.capture && (
                    <p className="mt-1">The pages that uploaded before the limit are saved.</p>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
