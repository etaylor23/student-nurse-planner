import { useState } from "react";
import { NOTE_BLOCK_TARGET_LABEL, type NoteBlockTarget } from "../../../domain/types";
import type { GibbsStage, NoteBlock } from "../../../domain/types";

/**
 * File one block into the student's records (spec-note-capture.md P4/P19).
 *
 * Filing is always an explicit act — nothing here happens on render, and nothing the classifier
 * suggested has touched the record until this button is pressed. Once filed, the same control
 * offers to undo it (P19), and an undo that couldn't be completely reversed says so rather than
 * pretending.
 */

const TARGETS: NoteBlockTarget[] = ["REFLECTION", "MED_LOG", "PROFICIENCY_EVENT", "SHIFT_NOTES"];

export function AllocateBar({
  block,
  target,
  onTargetChange,
  proficiencyId,
  tags,
  gibbs,
  onAllocate,
  onUnallocate,
}: {
  block: NoteBlock;
  /** Owned by the card, not here: the lane view writes the same field, so both must agree (P35). */
  target: NoteBlockTarget;
  onTargetChange: (target: NoteBlockTarget) => void;
  /** The code the student has selected, needed before proficiency evidence can be filed. */
  proficiencyId?: string;
  tags: string[];
  gibbs?: Partial<Record<GibbsStage, string>>;
  onAllocate: (
    target: NoteBlockTarget,
  ) => Promise<{ ok: true; label: string } | { ok: false; message: string }>;
  onUnallocate: () => Promise<{ warning?: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [filed, setFiled] = useState<string>();
  const [warning, setWarning] = useState<string>();

  const allocated = block.status === "ALLOCATED";
  // Filing proficiency evidence needs a confirmed code — the classifier can't decide the status
  // or the part index, so allocation refuses rather than guessing (P30). Say so up front and
  // don't offer the button, instead of letting the press fail.
  const blocked = target === "PROFICIENCY_EVENT" && !proficiencyId;
  const hasGibbs = Object.keys(gibbs ?? {}).length > 0;

  async function file() {
    setBusy(true);
    setError(undefined);
    const res = await onAllocate(target);
    setBusy(false);
    if (res.ok) setFiled(res.label);
    else setError(res.message);
  }

  async function undo() {
    setBusy(true);
    const res = await onUnallocate();
    setBusy(false);
    setFiled(undefined);
    setWarning(res.warning);
  }

  if (allocated) {
    return (
      <section className="mt-3 rounded-lg bg-primary-50 p-2.5">
        <p className="text-xs font-medium text-primary-900">
          Filed as {filed ?? NOTE_BLOCK_TARGET_LABEL[target]} 🌱
        </p>
        {warning && <p className="mt-1 text-xs text-amber-800">{warning}</p>}
        <button
          type="button"
          onClick={undo}
          disabled={busy}
          className="mt-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline disabled:opacity-50"
        >
          {busy ? "Undoing…" : "Undo"}
        </button>
      </section>
    );
  }

  return (
    <section className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        File this
      </h4>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <select
          value={target}
          onChange={(e) => onTargetChange(e.target.value as NoteBlockTarget)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
          aria-label="Where to file this block"
        >
          {TARGETS.map((t) => (
            <option key={t} value={t}>
              {NOTE_BLOCK_TARGET_LABEL[t]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={file}
          disabled={busy || blocked}
          className="rounded-lg bg-primary-600 px-3 py-1 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? "Filing…" : "File it"}
        </button>
        {blocked && <span className="text-xs text-slate-500">Pick a proficiency above first</span>}
      </div>
      {target === "REFLECTION" && (
        <p className="mt-1 text-xs text-slate-400">
          {tags.length > 0 ? `Tagged ${tags.join(", ")}. ` : ""}
          {hasGibbs
            ? "The reflection stages we found will be filled in."
            : "The whole note goes into Description for you to move."}
        </p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-700">{error}</p>}
    </section>
  );
}
