import type { NoteBlock, NoteCapture } from "../../../domain/types";

/**
 * The one place that decides what state a block is in for the review UI.
 *
 * Three surfaces render the same five blocks simultaneously — the photo overlay, the header
 * progress spine, and the stack rows. Before this existed the same ternary was written three
 * times, and they drifted: a block could read "worth a check" on the page and plain grey in
 * the spine. One function, one answer.
 */
export type BlockUiState = "FOCUSED" | "FILED" | "CHECK" | "PENDING";

/** Blocks store their lists as comma-separated strings — the row is flat primitives only. */
export function list(s: string | undefined): string[] {
  return (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** True when the two vision models disagreed somewhere in this block and it isn't resolved (P22). */
export function hasOpenDispute(block: NoteBlock): boolean {
  return list(block.disputedWords).length > 0;
}

/** Filed, kept or absorbed: all have had their question answered, so the UI treats them
 *  alike — out of the pending walk, counted in "n of m filed", ticked in the spine. */
export function isSettled(block: NoteBlock): boolean {
  return block.status === "ALLOCATED" || block.status === "KEPT" || block.status === "ABSORBED";
}

/**
 * The sub-blocks of a drawing (P45): the non-diagram blocks whose regions sit inside the
 * parent DIAGRAM block's region set, on the same page. These are the notes the drawing
 * already carries in its own text — the review nests them under the parent, and "store the
 * rest inside the drawing" absorbs whichever are still pending.
 *
 * **Same capture as well as same page.** A region index means "the fourth region the vision
 * model reported for THIS page of THIS capture" — it is not a global id, so `region 4` exists
 * once per photographed page. Review only ever passes one capture's blocks and never felt
 * this; the shift's Drawings tab passes every block the student owns, and without the guard a
 * drawing collected the notes of every other page that happened to share a region number.
 */
export function subBlocksOf(parent: NoteBlock, blocks: NoteBlock[]): NoteBlock[] {
  if (parent.kind !== "DIAGRAM") return [];
  const mine = new Set(list(parent.fromRegions));
  if (mine.size === 0) return [];
  return blocks.filter(
    (b) =>
      b.id !== parent.id &&
      b.kind !== "DIAGRAM" &&
      b.captureId === parent.captureId &&
      b.imageIndex === parent.imageIndex &&
      list(b.fromRegions).some((r) => mine.has(r)),
  );
}

/**
 * Focus wins over everything: the student is looking at this one, and that is the most
 * useful thing the UI can say about it. Filed beats a dispute because a filed block's
 * question has already been answered — and a KEPT block (a diagram kept with its page)
 * reads as filed for the same reason.
 */
export function blockUiState(block: NoteBlock, focusId?: string): BlockUiState {
  if (block.id === focusId && !isSettled(block)) return "FOCUSED";
  if (isSettled(block)) return "FILED";
  if (hasOpenDispute(block)) return "CHECK";
  return "PENDING";
}

/** Blocks the student can still act on, in page order. Drives ↑/↓ and "what's next". */
export function pendingBlocks(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.filter((b) => b.status === "PENDING");
}

/**
 * A block's position on its page, as the first vision region it drew from.
 *
 * Load-bearing for ordering: a synthesised DIAGRAM block is appended after every other block
 * on the page (it is assembled from their regions), but the drawing itself sits mid-page — so
 * insertion order is not page order, and this is.
 */
export function firstRegion(block: NoteBlock): number {
  const first = Number(list(block.fromRegions)[0]);
  return Number.isFinite(first) ? first : Number.MAX_SAFE_INTEGER;
}

/** A kept drawing as a shift shows it (hardening H1): the rebuild, the words, and the notes
 *  that live inside it. */
export interface ShiftDrawing {
  drawing: NoteBlock;
  /** The drawing's own notes, in page order. Dismissed ones are absent by the student's
   *  choice; the rest carry their state — filed in their own right, or stored inside. */
  subBlocks: NoteBlock[];
}

/**
 * The kept drawings that belong to a shift (hardening H1) — page order, oldest capture first.
 *
 * Membership is `block.shiftId ?? capture.shiftId`, the same rule review files by: a page is
 * attached as a whole, and a single block can be moved off it (P6). A blank id counts as
 * absent, not as a shift called "".
 *
 * Only `KEPT` diagrams are listed, which is the same test the recall card applies (D3/H3):
 * a drawing filed whole became a real row and is shown there, and a dismissed one was thrown
 * away. An unanchored kept drawing — a lecture page, with no shift at all — belongs to no
 * shift and appears on none (H2); it stays reachable by recall and by its capture.
 */
export function keptDrawingsForShift(
  shiftId: string,
  captures: Pick<NoteCapture, "id" | "shiftId" | "createdAt">[],
  blocks: NoteBlock[],
): ShiftDrawing[] {
  const byId = new Map(captures.map((c) => [c.id, c]));
  const shiftOf = (b: NoteBlock) => b.shiftId || byId.get(b.captureId)?.shiftId || undefined;

  return blocks
    .filter((b) => b.kind === "DIAGRAM" && b.status === "KEPT" && shiftOf(b) === shiftId)
    .sort(
      (a, b) =>
        (byId.get(a.captureId)?.createdAt ?? "").localeCompare(
          byId.get(b.captureId)?.createdAt ?? "",
        ) ||
        a.imageIndex - b.imageIndex ||
        firstRegion(a) - firstRegion(b),
    )
    .map((drawing) => ({
      drawing,
      subBlocks: subBlocksOf(drawing, blocks)
        .filter((b) => b.status !== "DISMISSED")
        .sort((x, y) => firstRegion(x) - firstRegion(y)),
    }));
}

/**
 * The DIAGRAM block whose drawing this block is part of, if any (P43/P44).
 *
 * Membership is decided by REGIONS, not geometry: every block records which vision regions
 * it drew from, and the diagram's `fromRegions` is exactly the drawing's member set — so
 * "spoke 6 sits inside the map" is a set intersection. A bbox-containment check was
 * considered and rejected: the union box can straddle a rotated margin note that was never
 * part of the drawing. Same capture and same page only — region indices are per page, and a
 * capture can hold several photos (see `subBlocksOf`).
 */
export function diagramContaining(block: NoteBlock, blocks: NoteBlock[]): NoteBlock | undefined {
  if (block.kind === "DIAGRAM") return undefined;
  const mine = list(block.fromRegions);
  if (mine.length === 0) return undefined;
  return blocks.find(
    (d) =>
      d.kind === "DIAGRAM" &&
      d.status !== "DISMISSED" &&
      d.captureId === block.captureId &&
      d.imageIndex === block.imageIndex &&
      list(d.fromRegions).some((r) => mine.includes(r)),
  );
}

/**
 * True when a key press is the student typing rather than reaching for a shortcut.
 *
 * The review shortcuts are bound on `window`, because the thing they act on is the focused
 * note and not whatever happens to hold DOM focus. That makes this guard load-bearing: `1`–`4`
 * set a destination, and they also spell "4.15" into the proficiency search box; `⏎` files a
 * note, and it also starts a new line in the one being edited.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return el?.tagName === "TEXTAREA" || el?.tagName === "INPUT" || el?.isContentEditable === true;
}
