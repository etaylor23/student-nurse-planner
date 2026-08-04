import type { NoteBlock } from "../../../domain/types";
import { blockUiState, isSettled } from "./blockState";

/**
 * One pip per note, in the review header.
 *
 * Answers the only question a student has partway through a page — "how much of this is
 * left?" — in the width of a sentence, and doubles as navigation: a pip is a jump.
 *
 * Deliberately NOT a percentage bar. Five notes is a countable number, and a bar would hide
 * the thing that actually matters, which is *which* ones still need attention. Colour carries
 * that: filed is emerald, the one you're on is ink, a disputed reading is coral.
 */
export function ProgressSpine({
  blocks,
  focusId,
  onFocus,
}: {
  blocks: NoteBlock[];
  focusId?: string;
  onFocus: (blockId: string) => void;
}) {
  const filed = blocks.filter(isSettled).length;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-2">
      {/* Wraps, because a capture is a notebook session: ten pages of notes is a legitimate
          capture and thirty pips do not fit on one line at any width. */}
      <ol className="flex flex-wrap items-center gap-1.5">
        {blocks.map((b, i) => {
          const state = blockUiState(b, focusId);
          const isFiled = state === "FILED";
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onFocus(b.id)}
                aria-label={`Go to note ${i + 1}${isFiled ? ", filed" : state === "CHECK" ? ", worth a check" : ""}`}
                aria-current={state === "FOCUSED"}
                className={`flex h-[25px] w-[25px] items-center justify-center rounded-full text-[10px] font-bold motion-safe:transition-all ${
                  isFiled
                    ? "bg-primary-600 text-white"
                    : state === "FOCUSED"
                      ? "bg-ink text-white ring-[3px] ring-ink/12"
                      : state === "CHECK"
                        ? "bg-accent-100 text-accent-700 ring-1 ring-accent-300 hover:bg-accent-200"
                        : b.kind === "DIAGRAM"
                          ? // A drawing with notes inside it (P45) — tinted so the parent
                            // stands out from its sub-blocks in the walk.
                            "bg-secondary-50 text-secondary-700 ring-1 ring-secondary-300 hover:bg-secondary-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {isFiled ? (
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
              </button>
            </li>
          );
        })}
      </ol>
      <div className="h-6 w-px shrink-0 bg-slate-200" aria-hidden="true" />
      {/* Live region: filing with the keyboard gives no other spoken confirmation. */}
      <p aria-live="polite" className="whitespace-nowrap text-xs font-semibold text-ink">
        {filed} of {blocks.length} filed
      </p>
    </div>
  );
}
