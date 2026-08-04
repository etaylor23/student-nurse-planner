import type { NoteBlock } from "../../../domain/types";

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

/** Filed-or-kept: both have had their question answered, so the UI treats them alike. */
export function isSettled(block: NoteBlock): boolean {
  return block.status === "ALLOCATED" || block.status === "KEPT";
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
 * The DIAGRAM block whose drawing this block is part of, if any (P43/P44).
 *
 * Membership is decided by REGIONS, not geometry: every block records which vision regions
 * it drew from, and the diagram's `fromRegions` is exactly the drawing's member set — so
 * "spoke 6 sits inside the map" is a set intersection. A bbox-containment check was
 * considered and rejected: the union box can straddle a rotated margin note that was never
 * part of the drawing. Same page only — a capture can hold several photos.
 */
export function diagramContaining(block: NoteBlock, blocks: NoteBlock[]): NoteBlock | undefined {
  if (block.kind === "DIAGRAM") return undefined;
  const mine = list(block.fromRegions);
  if (mine.length === 0) return undefined;
  return blocks.find(
    (d) =>
      d.kind === "DIAGRAM" &&
      d.status !== "DISMISSED" &&
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
