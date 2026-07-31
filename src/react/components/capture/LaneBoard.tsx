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
          <p className="flex items-center gap-1 pb-1 pl-1 text-[11px] text-primary-700/70">
            <span aria-hidden="true">⠿</span> drag me
          </p>
        )}
        {renderBlock(b, indexOf.get(b.id) ?? 0)}
      </li>
    );
  }

  const hasUndecided = undecided.length > 0;

  return (
    // Undecided cards SIDE BY SIDE with the columns, not stacked above them. Stacked, the
    // columns sat below the fold, so "drag one into a column" pointed at something the student
    // couldn't see — and an instruction you can't see the target of isn't one. Half and half:
    // the undecided cards stay readable, and where they can go is in the same eyeful.
    <div className={`mt-3 gap-4 ${hasUndecided ? "lg:grid lg:grid-cols-2" : ""}`}>
      {/* No box, no wash: a container around these cards competed with the cards themselves for
          attention, and it is the cards that are the thing. Just a heading and the cards. */}
      {hasUndecided && (
        <section className="mb-4 min-w-0 lg:mb-0">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-primary-800">
            Not decided ({undecided.length})
          </h4>
          <p className="mt-0.5 text-xs text-slate-400">
            We couldn&apos;t tell where these belong — drag one across into a column, or set it on
            the card.
          </p>
          <ul className="mt-2 min-w-0 space-y-3">{undecided.map(draggable)}</ul>
        </section>
      )}

      {/* Every lane is visibly a drop target the moment a drag starts — the strongest signal
          available, because until you pick a card up there is nothing to drop. */}
      <div
        className={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 ${
          hasUndecided ? "lg:content-start" : "xl:grid-cols-4"
        }`}
      >
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
                  ? "border-solid border-primary-500 bg-primary-50"
                  : dragging
                    ? "border-dashed border-primary-400"
                    : "border-dashed border-primary-200"
              }`}
            >
              <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-primary-800">
                {NOTE_BLOCK_TARGET_LABEL[target]}{" "}
                <span className="font-normal text-primary-600">({mine.length})</span>
              </h4>
              <p className="px-1 text-[11px] leading-snug text-primary-700/80">{blurb}</p>
              {/* The lane's CONTENT scrolls, not the lane. One full medication card is taller
                  than the viewport, and without this a busy column pushed the other three off
                  the bottom — which defeats the point of showing all four routes at once. */}
              <ul
                className={`mt-2 min-w-0 space-y-3 ${
                  hasUndecided ? "overflow-y-auto lg:max-h-[26rem]" : ""
                }`}
              >
                {mine.map(draggable)}
                <li
                  className={`rounded-lg border border-dashed px-1 py-3 text-center text-[11px] ${
                    active
                      ? "border-primary-500 text-primary-800"
                      : "border-primary-300 text-primary-700"
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
