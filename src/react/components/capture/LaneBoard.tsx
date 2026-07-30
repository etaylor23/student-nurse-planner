import { useState } from "react";
import {
  NOTE_BLOCK_TARGET_LABEL,
  type NoteBlock,
  type NoteBlockTarget,
} from "../../../domain/types";

/**
 * Wide-screen lane view (spec-note-capture.md P35).
 *
 * One lane per target type, so the whole page's routing is visible at a glance and a block in
 * the wrong lane is obvious rather than buried three sections down a list. Dragging between
 * lanes retypes the block.
 *
 * **This is the enhancement, not the primary path** — students photograph notes on a phone, so
 * the mobile list is the experience that has to be good. Lanes only appear on a screen wide
 * enough to show four columns without either of them becoming unreadable.
 *
 * Drag is not the only way to move a block: every card keeps its own target control, because a
 * drag is unusable by keyboard and awkward on a trackpad. The lane is a view of
 * `block.targetType`, so both routes write the same field and stay in step.
 */

const LANES: { target: NoteBlockTarget; blurb: string }[] = [
  { target: "REFLECTION", blurb: "Becomes a Gibbs reflection" },
  { target: "MED_LOG", blurb: "Becomes a medication log" },
  { target: "PROFICIENCY_EVENT", blurb: "Evidence against a proficiency" },
  { target: "SHIFT_NOTES", blurb: "Appended to the shift" },
];

/** Blocks the classifier wouldn't route (P34) need somewhere to sit that isn't a wrong guess. */
const UNDECIDED = "UNDECIDED";

export function LaneBoard({
  blocks,
  onMove,
  renderBlock,
}: {
  blocks: NoteBlock[];
  /** Retype the block. Called only when the lane actually changes. */
  onMove: (blockId: string, target: NoteBlockTarget) => void;
  renderBlock: (block: NoteBlock, index: number) => React.ReactNode;
}) {
  const [dragging, setDragging] = useState<string>();
  const [over, setOver] = useState<string>();

  const indexOf = new Map(blocks.map((b, i) => [b.id, i]));
  const laneOf = (b: NoteBlock) => (b.targetType ?? UNDECIDED) as string;
  const undecided = blocks.filter((b) => laneOf(b) === UNDECIDED);

  function drop(target: NoteBlockTarget) {
    const id = dragging;
    setDragging(undefined);
    setOver(undefined);
    if (!id) return;
    const block = blocks.find((b) => b.id === id);
    if (!block || block.targetType === target) return;
    // A filed block's row already exists; moving it would leave the two out of step, so the
    // student has to undo the filing first.
    if (block.status === "ALLOCATED") return;
    onMove(id, target);
  }

  /**
   * The card wrapper. `min-w-0` at every level, or one long word (this is a page of drug names)
   * forces the lane wider than the column it lives in.
   *
   * A plain function, NOT a nested component: a component declared in here would be a new type
   * on every render, so React would unmount and remount the card each time a drag started —
   * throwing away whatever the student had typed into it.
   */
  function draggable(b: NoteBlock) {
    const canDrag = b.status !== "ALLOCATED";
    return (
      <li
        key={b.id}
        draggable={canDrag}
        onDragStart={() => setDragging(b.id)}
        onDragEnd={() => setDragging(undefined)}
        className={`min-w-0 ${canDrag ? "cursor-grab active:cursor-grabbing" : ""} ${
          dragging === b.id ? "opacity-40" : ""
        }`}
      >
        {canDrag && (
          <p className="flex items-center gap-1 pb-1 pl-1 text-[10px] uppercase tracking-wide text-slate-400">
            <span aria-hidden="true">⠿</span> drag me
          </p>
        )}
        {renderBlock(b, indexOf.get(b.id) ?? 0)}
      </li>
    );
  }

  return (
    <div className="mt-3">
      {undecided.length > 0 && (
        <section className="mb-3 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Not decided ({undecided.length})
          </h4>
          <p className="mt-0.5 text-xs text-amber-900">
            We couldn&apos;t tell where these belong — drag one into a column below, or set it on
            the card.
          </p>
          <ul className="mt-2 min-w-0 space-y-3">{undecided.map(draggable)}</ul>
        </section>
      )}

      {/* Every lane is visibly a drop target the moment a drag starts — the strongest signal
          available, because until you pick a card up there is nothing to drop. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {LANES.map(({ target, blurb }) => {
          const mine = blocks.filter((b) => laneOf(b) === target);
          const active = over === target;
          return (
            <section
              key={target}
              aria-label={`${NOTE_BLOCK_TARGET_LABEL[target]} column`}
              onDragOver={(e) => {
                e.preventDefault(); // without this the drop event never fires
                setOver(target);
              }}
              onDragLeave={() => setOver((o) => (o === target ? undefined : o))}
              onDrop={() => drop(target)}
              className={`min-w-0 rounded-xl border-2 p-2 transition-colors ${
                active
                  ? "border-solid border-secondary-500 bg-secondary-50"
                  : dragging
                    ? "border-dashed border-secondary-300 bg-secondary-50/30"
                    : "border-dashed border-slate-300 bg-slate-50/60"
              }`}
            >
              <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                {NOTE_BLOCK_TARGET_LABEL[target]}{" "}
                <span className="font-normal text-slate-400">({mine.length})</span>
              </h4>
              <p className="px-1 text-[11px] leading-snug text-slate-400">{blurb}</p>
              <ul className="mt-2 min-w-0 space-y-3">
                {mine.map(draggable)}
                <li
                  className={`rounded-lg border border-dashed px-1 py-3 text-center text-[11px] ${
                    active
                      ? "border-secondary-400 text-secondary-700"
                      : "border-slate-200 text-slate-400"
                  } ${mine.length > 0 && !dragging ? "hidden" : ""}`}
                >
                  {dragging ? "Drop it here" : "Drag a note here"}
                </li>
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
