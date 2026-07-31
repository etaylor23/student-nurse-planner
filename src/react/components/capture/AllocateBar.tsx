import { useEffect, useRef, useState } from "react";
import { NOTE_BLOCK_TARGET_LABEL, type NoteBlockTarget } from "../../../domain/types";
import type { GibbsStage } from "../../../domain/types";
import { isTypingTarget } from "./blockState";

/**
 * File one block into the student's records, and reverse it (spec-note-capture.md P4/P19).
 *
 * Filing is always an explicit act — nothing here happens on render, and nothing the classifier
 * suggested has touched the record until this button is pressed. Once filed, the same decision
 * can be undone (P19), and an undo that couldn't be completely reversed says so rather than
 * pretending.
 *
 * Two components rather than two branches, because the two states now sit in different places
 * in the layout: `AllocateBar` is the **foot of the focused card** — the commit, what is
 * blocking it, and a way past — and `UndoFiling` is the **tail of a collapsed filed row**. A
 * card only ever renders for a note that is still pending, so the filed case is no longer a
 * branch this component can reach.
 */

/**
 * The commit. Nothing above it has written anything.
 *
 * The `⏎` shortcut is bound here rather than in the card because everything it has to decide —
 * the target, both guards, whether a write is already in flight — is already in this component,
 * and only the focused card renders it.
 */
export function AllocateBar({
  target,
  proficiencyId,
  tags,
  gibbs,
  onAllocate,
  onSkip,
}: {
  /** Decided by the card's destination tiles and by a drop on the drag bar, which both write the
   *  same field (P35). `""` means the classifier didn't route this note and the student hasn't
   *  either. */
  target: NoteBlockTarget | "";
  /** The code the student has selected, needed before proficiency evidence can be filed. */
  proficiencyId?: string;
  tags: string[];
  gibbs?: Partial<Record<GibbsStage, string>>;
  onAllocate: (
    target: NoteBlockTarget,
  ) => Promise<{ ok: true; label: string } | { ok: false; message: string }>;
  /** Move on without deciding. Filing is never the only way forward out of a note. */
  onSkip?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Two things stop the button being offered, and both are "we would have to guess":
  //  - nothing routed this note, and quietly defaulting to shift notes is how a reflection
  //    ends up appended to a shift as a wall of text (P34);
  //  - proficiency evidence with no confirmed code, where the status and part index are the
  //    student's judgement and allocation refuses rather than guessing (P30).
  const blocked = !target || (target === "PROFICIENCY_EVENT" && !proficiencyId);
  const hasGibbs = Object.keys(gibbs ?? {}).length > 0;

  async function file() {
    if (!target) return;
    setBusy(true);
    setError(undefined);
    const res = await onAllocate(target);
    setBusy(false);
    if (!res.ok) setError(res.message);
  }

  /**
   * `⏎` files the focused note — and does nothing at all when the button wouldn't, so the
   * shortcut can never get past a guard the button holds.
   *
   * Bound once, reading the current guards through a ref: binding on `window` is what lets the
   * shortcut work while DOM focus is on a tile or a tag, and re-binding it on every keystroke in
   * the textarea would be churn for nothing.
   */
  const latest = useRef({ blocked, busy, file });
  latest.current = { blocked, busy, file };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
      const now = latest.current;
      if (now.blocked || now.busy) return;
      e.preventDefault();
      void now.file();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      {/* No destination select here any more — the tiles above are the single place that
          decision is made. This is only the commit. */}
      <button
        type="button"
        onClick={file}
        disabled={busy || blocked}
        className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13.5px] font-bold ${
          busy || blocked
            ? "bg-slate-100 text-slate-400"
            : "bg-primary-600 text-white shadow-sm hover:bg-primary-700"
        }`}
      >
        {busy ? "Filing…" : target ? `File as ${NOTE_BLOCK_TARGET_LABEL[target]}` : "File it"}
        <kbd
          aria-hidden="true"
          className={`rounded px-1.5 font-sans text-[10px] font-bold ${
            busy || blocked ? "bg-slate-200 text-slate-400" : "bg-white/25 text-white"
          }`}
        >
          ⏎
        </kbd>
      </button>
      <span className="text-xs text-slate-400">
        {blocked
          ? target
            ? "Pick a proficiency first."
            : "Choose where it goes first."
          : "Nothing is written to your records until you press this."}
      </span>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="ml-auto shrink-0 text-xs font-semibold text-slate-400 hover:text-ink"
        >
          Skip for now ↓
        </button>
      )}
      {target === "REFLECTION" && !blocked && (
        <p className="w-full text-xs text-slate-400">
          {tags.length > 0 ? `Tagged ${tags.join(", ")}. ` : ""}
          {hasGibbs
            ? "The reflection stages we found will be filled in."
            : "The whole note goes into Description for you to move."}
        </p>
      )}
      {error && <p className="w-full text-xs text-red-700">{error}</p>}
    </div>
  );
}

/**
 * Reverse a filing (P19) — the tail of a collapsed filed row.
 *
 * A fragment rather than a box, because these are flex children of the row: the Undo sits at the
 * end of the line and the warning takes a full line of its own beneath it. A sentence about text
 * the student has since rewritten deserves more room than a row's trailing slot, and silently
 * deleting that paragraph would be worse than saying so.
 *
 * "Filed as …" is deliberately NOT repeated here: the row's own destination chip says it, read
 * off the persisted row, so it survives the card collapsing and the dialog being reopened in a
 * way component state would not.
 */
export function UndoFiling({
  onUnallocate,
}: {
  onUnallocate: () => Promise<{ warning?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string>();

  async function undo() {
    setBusy(true);
    const res = await onUnallocate();
    setBusy(false);
    setWarning(res.warning);
  }

  return (
    <>
      <button
        type="button"
        onClick={undo}
        disabled={busy}
        className="shrink-0 text-[11px] font-semibold text-slate-400 underline underline-offset-2 hover:text-ink disabled:opacity-50"
      >
        {busy ? "Undoing…" : "Undo"}
      </button>
      {warning && <p className="w-full text-[11px] text-accent-700">{warning}</p>}
    </>
  );
}
