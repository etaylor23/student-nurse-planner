import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Clock, TriangleAlert, X } from "lucide-react";
import { useRepository } from "../../RepositoryContext";
import type { GibbsStage } from "../../../domain/types";
import { DAILY_PHOTO_LIMIT, MAX_IMAGES_PER_CAPTURE } from "./config";
import { PagePreview } from "./PagePreview";
import { ReviewPanel } from "./ReviewPanel";
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

/**
 * The pipeline, as the student sees it waiting for it (P40).
 *
 * One entry per stage frame the parse stream actually sends — `reading`, `spellchecking`,
 * `classifying` — and no more. The design asked for a fourth step, "Cross-checking every word",
 * but the two-model consensus doesn't get its own frame: it runs inside the read and again
 * inside classification. A checkbox that ticked on no signal would be a progress bar we made
 * up, in the one screen whose entire job is showing the student what really happened — so it is
 * step one's subtitle, where it is true, instead of a step of its own.
 */
const PIPELINE: { stage: string; label: string; meta?: string }[] = [
  { stage: "reading", label: "Reading your handwriting", meta: "two models, in parallel" },
  { stage: "spellchecking", label: "Spell-checking clinical terms" },
  { stage: "classifying", label: "Working out where each note goes" },
];

/** What the app does with the page, said before it starts — so a ~70-second wait reads as
 *  bought rather than suffered, and says the two things students most need to hear. */
const WHAT_HAPPENS: { title: string; body: string }[] = [
  {
    title: "We read the page twice",
    body: "Two models transcribe it separately, so anything they disagree on gets flagged for you rather than slipping through.",
  },
  {
    title: "We tidy the clinical spelling",
    body: "Drug names and clinical terms only — never your wording, your abbreviations or your reasoning.",
  },
  {
    title: "You decide where each note goes",
    body: "Reflection, medication log, NMC evidence or shift notes. Nothing is saved until you say so.",
  },
];

export function CaptureButton() {
  const { isGuest } = useRepository();
  const [open, setOpen] = useState(false);
  const {
    state,
    startCapture,
    reset,
    selectShift,
    allocate,
    unallocate,
    editBlock,
    dismissBlock,
    createMedication,
    rerunFromScratch,
    ensurePageImage,
  } = useCapture();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.stage !== "uploading" && state.stage !== "parsing")
        setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, state.stage]);

  // A signed page URL outlives neither the hour nor, necessarily, the gap between putting this
  // window down and picking it up again — and the capture deliberately survives that gap. So
  // opening the dialog is the moment to make sure the photo still loads.
  useEffect(() => {
    if (open) void ensurePageImage?.();
  }, [open, ensurePageImage]);

  // The Gibbs split is a classifier suggestion, not part of the block row — it only becomes
  // real content when the student files the block as a reflection. Keyed by the verbatim text,
  // which is what `persistBlocks` stored as `rawText`.
  const gibbsByRawText = useMemo(() => {
    const out: Record<string, Partial<Record<GibbsStage, string>>> = {};
    for (const page of state.parsed ?? []) {
      for (const b of page.blocks) {
        if (b.gibbs) out[b.text] = b.gibbs as Partial<Record<GibbsStage, string>>;
      }
    }
    return out;
  }, [state.parsed]);

  // Guests only: no ID token means the presign can't be authorised (P17).
  if (isGuest) return null;

  /**
   * Close the dialog but KEEP the capture.
   *
   * A parse costs ~70 seconds and four model calls, and the blocks are real rows by this point.
   * Closing used to reset, so one stray tap on the backdrop threw all of that away — hence the
   * backdrop no longer closes at all, and closing is only ever putting the window down. The
   * state lives in `useCapture`, which is mounted with the header, so re-opening lands exactly
   * where they left off. A page refresh still starts clean, and "Start again" is explicit.
   */
  function close() {
    // Don't abandon an in-flight upload or parse silently.
    if (state.stage === "uploading" || state.stage === "parsing") return;
    setOpen(false);
  }

  /** Discard the capture and go back to the start — including the PII warning, which is why
   *  this doesn't open the camera directly (P2). */
  function startAgain() {
    reset();
  }

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_IMAGES_PER_CAPTURE);
    e.target.value = ""; // let the same file be picked again after an error
    // Acknowledgement is true by construction: this handler is only reachable from the
    // button inside the warning panel below.
    await startCapture(files, { piiAcknowledged: true });
  }

  const review = state.stage === "review";
  const busy = state.stage === "uploading" || state.stage === "parsing";
  const pagesLeft =
    typeof state.remaining === "number"
      ? ` · ${state.remaining} photo${state.remaining === 1 ? "" : "s"} left today`
      : "";
  /** The step the stream last reported. Anything before it is done, anything after is waiting. */
  const step = PIPELINE.findIndex((p) => p.stage === state.activityStage);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition-colors hover:border-primary-300 hover:text-slate-900"
        aria-label="Photograph your notes"
      >
        <Camera className="h-4 w-4 shrink-0 text-secondary-500" aria-hidden="true" />
        <span className="hidden sm:inline">Photo</span>
      </button>

      {open &&
        createPortal(
          // No backdrop dismiss, deliberately: a stray tap out here used to bin a 70-second
          // parse. Closing is the close button's job.
          // Review uses the app's own content box — the same `lg:px-20 xl:px-24` gutters as
          // `<main>` — so it lines up with the page behind it instead of floating in the middle
          // of it. Everything else stays a smaller centred dialog.
          <div
            className={`fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center ${
              review ? "sm:px-10 lg:px-20 xl:px-24" : ""
            }`}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Photograph your notes"
              className={`relative max-h-[88vh] w-full overflow-y-auto rounded-[20px] bg-white shadow-xl ${
                review ? "max-w-none" : "max-w-3xl"
              }`}
            >
              {/* One dismiss per stage. Review carries its own inside the panel header, and
                  `done`/`capped` end with a button of their own — a second control accessibly
                  named "Close" beside it would just be two of the same thing. */}
              {!review && state.stage !== "done" && state.stage !== "capped" && (
                <button
                  type="button"
                  onClick={close}
                  disabled={busy}
                  aria-label="Close"
                  className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-[10px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink disabled:opacity-40"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              {(state.stage === "idle" || state.stage === "error") && (
                <div className="grid grid-cols-1 md:grid-cols-[1.08fr_1fr]">
                  <div className="p-8 pr-14 sm:p-10 sm:pr-16">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-800">
                      Note capture
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-ink">
                      Photograph your notes
                    </h2>
                    <p className="mt-2.5 max-w-md text-sm leading-relaxed text-slate-600">
                      Snap a page from your notebook. We read it, tidy the clinical spelling, and
                      work out what each note is — you decide where each one goes.
                    </p>

                    {/* The warning is the whole point of this step (P2) — it is not a
                        formality, and it is deliberately the most prominent thing here. Its
                        wording is unchanged; it has gained a glyph and a calmer surface. */}
                    <div className="mt-7 flex gap-3.5 rounded-2xl border border-accent-200 bg-accent-50 p-4">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                        <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">Before you take the photo</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                          Make sure nothing patient-identifiable is in frame — no names, NHS
                          numbers, dates of birth, bed numbers, or other people&apos;s paperwork
                          behind your page. Your photo is stored so you can check it against what we
                          read, and the PlaceMate team may review it.
                        </p>
                      </div>
                    </div>

                    {state.stage === "error" && (
                      <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
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
                      className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-primary-700"
                    >
                      <Camera className="h-4 w-4" aria-hidden="true" />
                      I&apos;ve checked — take a photo
                    </button>
                    <p className="mt-2.5 text-center text-xs text-slate-400">
                      Up to {MAX_IMAGES_PER_CAPTURE} pages at a time{pagesLeft}.
                    </p>
                  </div>

                  <div className="border-t border-slate-100 bg-slate-50 p-8 sm:p-10 md:border-l md:border-t-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      What happens next
                    </p>
                    <ol className="mt-5 space-y-5">
                      {WHAT_HAPPENS.map((s, i) => (
                        <li key={s.title} className="flex gap-3.5">
                          <span className="mt-px flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-bold text-primary-800 ring-1 ring-slate-200">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">{s.title}</p>
                            <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">
                              {s.body}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-7 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-400">
                      Takes about a minute. Nothing reaches your records until you file it yourself
                      — and your PAD stays the official record.
                    </p>
                  </div>
                </div>
              )}

              {state.stage === "uploading" && (
                <div className="p-8 pr-14 sm:p-10">
                  <h2 className="text-xl font-semibold tracking-tight text-ink">
                    Saving your {(state.progress?.total ?? 1) === 1 ? "page" : "pages"}
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600">
                    Page {state.progress?.current} of {state.progress?.total} — one at a time, so a
                    ward connection can keep up.
                  </p>
                  <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all"
                      style={{
                        width: `${((state.progress?.current ?? 0) / Math.max(1, state.progress?.total ?? 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* The wait stops being blank and starts being the product showing its work: the
                  page with regions appearing on it as they're found, the real pipeline stages
                  ticking off, and the student's own words ~30s before the suggestions (P40). */}
              {state.stage === "parsing" && (
                <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr]">
                  {state.pageImageUrl && (
                    <div className="border-b border-slate-100 bg-slate-50 p-5 lg:border-b-0 lg:border-r">
                      <PagePreview
                        imageUrl={state.pageImageUrl}
                        blocks={state.blocks ?? []}
                        onFocus={() => {}}
                      />
                    </div>
                  )}
                  <div className="min-w-0 p-8 pr-14 sm:p-8">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <h2 className="text-xl font-semibold tracking-tight text-ink">
                        Reading your page
                      </h2>
                      {(state.progress?.total ?? 1) > 1 && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
                          page {state.progress?.current} of {state.progress?.total}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">
                      Your photo is already saved — you can close this and come back to it.
                    </p>

                    <ol className="mt-6 space-y-1">
                      {PIPELINE.map((p, i) => {
                        const done = step > i;
                        const active = step === i || (step < 0 && i === 0);
                        return (
                          <li
                            key={p.stage}
                            className={`flex items-center gap-3 rounded-[10px] px-2.5 py-2 ${
                              active ? "bg-primary-50" : ""
                            }`}
                          >
                            <span
                              className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${
                                done
                                  ? "bg-primary-600 text-white"
                                  : active
                                    ? "bg-white ring-2 ring-primary-500"
                                    : "bg-slate-100 ring-1 ring-slate-200"
                              }`}
                            >
                              {done ? (
                                <svg
                                  viewBox="0 0 20 20"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2.6}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  className="h-2.5 w-2.5"
                                  aria-hidden="true"
                                >
                                  <path d="m4 10.5 4 4 8-9" />
                                </svg>
                              ) : (
                                active && (
                                  <span className="block h-[7px] w-[7px] rounded-full bg-primary-600 motion-safe:animate-pulse" />
                                )
                              )}
                            </span>
                            <span
                              className={`text-sm ${active ? "font-semibold text-ink" : "text-slate-500"}`}
                            >
                              {p.label}
                            </span>
                            <span className="ml-auto text-xs text-slate-400">
                              {p.stage === "classifying" && (state.blocks?.length ?? 0) > 0
                                ? `${state.blocks?.length} notes found`
                                : done || active
                                  ? p.meta
                                  : ""}
                            </span>
                          </li>
                        );
                      })}
                    </ol>

                    {state.preview ? (
                      <div className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
                          What we&apos;ve read so far
                        </p>
                        <pre className="mt-2.5 max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                          {state.preview}
                        </pre>
                      </div>
                    ) : (
                      <p className="mt-6 text-xs text-slate-400">
                        Your photo is already saved — this part takes about a minute.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {review && state.blocks && (
                <>
                  {state.error && (
                    <p className="border-b border-accent-200 bg-accent-50 px-6 py-2.5 text-sm text-accent-700">
                      Some pages couldn&apos;t be read, but the ones below worked.
                    </p>
                  )}
                  <ReviewPanel
                    blocks={state.blocks}
                    corrections={state.parsed?.flatMap((p) => p.corrections) ?? []}
                    pageDateRaw={state.parsed?.[0]?.pageDateRaw}
                    pageCount={state.parsed?.length ?? 1}
                    imageUrl={state.pageImageUrl}
                    gibbsByRawText={gibbsByRawText}
                    shift={state.shift}
                    selectedShiftId={state.capture?.shiftId}
                    onSelectShift={selectShift}
                    known={state.known}
                    cachedFrom={state.cachedFrom}
                    onRerun={() => void rerunFromScratch()}
                    onClose={close}
                    onStartAgain={startAgain}
                    handlers={{
                      onEdit: editBlock,
                      onAllocate: allocate,
                      onUnallocate: unallocate,
                      onCreateMedication: createMedication,
                      onDismiss: dismissBlock,
                    }}
                  />
                </>
              )}

              {/* Reached when reading isn't available, not when everything is filed — the filed
                  end state lives in review, where the notes are. So this says the true thing:
                  the photos are safe, which is the part that cost anything. */}
              {state.stage === "done" && (
                <div className="p-8 sm:p-10">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-primary-800 motion-safe:animate-[pm-tick_320ms_cubic-bezier(.2,.9,.3,1.5)_both]">
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.4}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                      aria-hidden="true"
                    >
                      <path d="m4 10.5 4 4 8-9" />
                    </svg>
                  </span>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight text-ink">
                    Your{" "}
                    {state.capture?.imageKeys.split(",").filter(Boolean).length === 1
                      ? "page is"
                      : "pages are"}{" "}
                    saved
                  </h2>
                  <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-600">
                    We couldn&apos;t read them into notes just now. Nothing is lost — your photo is
                    kept for the life of your account, so opening this again is all it takes to have
                    another go.
                  </p>
                  {typeof state.remaining === "number" && state.remaining <= 3 && (
                    <p className="mt-2 text-xs text-slate-400">
                      {state.remaining} photo{state.remaining === 1 ? "" : "s"} left today.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="mt-6 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Calm and coral-free: a cap is a limit, not a failure. The pages already read
                  are the useful thing on this screen, so they get the primary action. */}
              {state.stage === "capped" && (
                <div className="mx-auto max-w-lg p-10 text-center sm:p-14">
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary-50 text-primary-800">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-[22px] font-semibold tracking-tight text-ink">
                    That&apos;s today&apos;s {DAILY_PHOTO_LIMIT} pages read
                  </h2>
                  <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-slate-600">
                    Your allowance resets tomorrow.{" "}
                    {state.capture
                      ? "The pages that uploaded before the limit are saved and waiting for you — nothing was lost."
                      : "Nothing was lost — a page you've already read still opens on a day you've used up."}
                  </p>
                  <div aria-hidden="true" className="mx-auto mt-5 flex w-fit gap-1.5">
                    {Array.from({ length: DAILY_PHOTO_LIMIT }, (_, i) => (
                      <span key={i} className="h-1.5 w-6 rounded-full bg-primary-300" />
                    ))}
                  </div>
                  <p className="mt-2.5 text-xs text-slate-400">
                    {DAILY_PHOTO_LIMIT} of {DAILY_PHOTO_LIMIT} used
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-7 rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
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
