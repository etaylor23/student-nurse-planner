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

  return (
    <div className="mt-3">
      {undecided.length > 0 && (
        <section className="mb-3 rounded-xl border border-dashed border-slate-300 p-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Not decided ({undecided.length})
          </h4>
          <p className="mt-0.5 text-xs text-slate-500">
            We couldn&apos;t tell where these belong — drag one into a column, or set it on the
            card.
          </p>
          <ul className="mt-2 space-y-3">
            {undecided.map((b) => (
              <li key={b.id} draggable onDragStart={() => setDragging(b.id)}>
                {renderBlock(b, indexOf.get(b.id) ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {LANES.map(({ target, blurb }) => {
          const mine = blocks.filter((b) => laneOf(b) === target);
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
              className={`rounded-xl border p-2 transition-colors ${
                over === target
                  ? "border-secondary-400 bg-secondary-50/50"
                  : "border-slate-200 bg-slate-50/50"
              }`}
            >
              <h4 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {NOTE_BLOCK_TARGET_LABEL[target]} ({mine.length})
              </h4>
              <p className="px-1 text-[11px] text-slate-400">{blurb}</p>
              <ul className="mt-2 space-y-3">
                {mine.map((b) => (
                  <li
                    key={b.id}
                    draggable={b.status !== "ALLOCATED"}
                    onDragStart={() => setDragging(b.id)}
                    onDragEnd={() => setDragging(undefined)}
                    className={dragging === b.id ? "opacity-50" : undefined}
                  >
                    {renderBlock(b, indexOf.get(b.id) ?? 0)}
                  </li>
                ))}
                {mine.length === 0 && (
                  <li className="px-1 pb-2 text-xs text-slate-400">Nothing here yet.</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
