import type { NoteBlock } from "../../../domain/types";
import { blockUiState } from "./blockState";

/**
 * The photographed page, with each block outlined on it (spec-note-capture.md P1/P3).
 *
 * This is the review screen's map. It exists for three reasons, in order of importance:
 *
 * 1. **It makes the extraction legible.** Five cards in a list is a form. Five outlined
 *    regions on the student's own handwriting is visibly "we found these, on your page".
 * 2. **It is the ground truth.** P1 keeps the photo precisely so a transcription can be
 *    checked against it — but the student could never see it while reviewing, which made
 *    the retention a promise rather than a feature.
 * 3. **It shows the whole page's state at a glance**, which is the job the four permanent
 *    lanes were doing badly and at half the screen's width.
 *
 * Geometry comes from the `bbox*` fractions already on the row. `object-cover` on a fixed
 * 3/4 box can crop a page that isn't 3:4 — accepted: the regions crop with it, so nothing
 * is ever mislabelled, and every page shot in-app comes from a phone camera in portrait.
 * If a page is badly out of ratio the student still has the cards; this pane is an
 * enhancement, never the only route to a block.
 */
export function PagePreview({
  imageUrl,
  blocks,
  focusId,
  onFocus,
}: {
  /** Presigned GET for the capture's first image. Render nothing when we don't have one. */
  imageUrl?: string;
  blocks: NoteBlock[];
  focusId?: string;
  onFocus: (blockId: string) => void;
}) {
  if (!imageUrl) return null;

  return (
    // Stickiness is the CALLER's decision: the review pane pins this together with the
    // pinned diagram beneath it — a sticky photo above an in-flow diagram slid over it.
    <div>
      <div className="relative overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <img
          src={imageUrl}
          alt="The page of notes you photographed"
          className="block aspect-[3/4] w-full object-cover"
        />
        {/* Base scrim: the handwriting is context, not content. Without it the photo is
            louder than the cards, which are the thing the student has to act on. */}
        <div className="absolute inset-0 bg-white/50" aria-hidden="true" />

        <div className="absolute inset-0">
          {blocks.map((b, i) => {
            const state = blockUiState(b, focusId);
            const filed = state === "FILED";
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onFocus(b.id)}
                aria-label={`Note ${i + 1} on the page`}
                aria-current={state === "FOCUSED"}
                style={{
                  left: `${b.bboxX0 * 100}%`,
                  top: `${b.bboxY0 * 100}%`,
                  width: `${(b.bboxX1 - b.bboxX0) * 100}%`,
                  height: `${(b.bboxY1 - b.bboxY0) * 100}%`,
                }}
                className={`absolute rounded-md border-2 motion-safe:transition-all motion-safe:duration-200 ${
                  state === "FOCUSED"
                    ? // The giant inset shadow dims the whole page EXCEPT this block, on top of
                      // the base scrim. One box-shadow, no masks, no second canvas.
                      "z-10 border-ink shadow-[0_0_0_9999px_rgba(255,255,255,0.42)]"
                    : filed
                      ? "border-primary-600/75 bg-primary-500/10 hover:border-primary-700"
                      : state === "CHECK"
                        ? "border-accent-600/60 bg-accent-500/10 hover:border-accent-700"
                        : "border-slate-500/45 bg-white/25 hover:border-slate-600"
                }`}
              >
                <span
                  className={`absolute -left-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    state === "FOCUSED"
                      ? "bg-ink text-white"
                      : filed
                        ? "bg-primary-600 text-white"
                        : state === "CHECK"
                          ? "bg-accent-600 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-300"
                  }`}
                >
                  {filed ? (
                    <svg
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-2.5 w-2.5 motion-safe:animate-[pm-tick_320ms_cubic-bezier(.2,.9,.3,1.5)_both]"
                      aria-hidden="true"
                    >
                      <path d="m4 10.5 4 4 8-9" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
        Your page, kept as the record. Click a note on it to jump to that card.
      </p>
    </div>
  );
}
