import type { NoteBlock, NoteCapture } from "../../../domain/types";

/**
 * What to do with a capture that never finished (spec-note-capture-hardening.md H9).
 *
 * A capture is left in `PARSING` when the client vanishes mid-flight — the tab closed, the
 * phone locked, the student walked out of WiFi range. The photos are durable by then (they are
 * uploaded before any parsing starts) but the blocks may never have been written, and nothing
 * used to bring them back: the row sat in `PARSING` forever and the pages were invisible.
 *
 * The decision is entirely a function of two rows, so it lives here rather than inside the
 * hook: given the capture's `imageKeys` and whatever blocks did get persisted, which pages
 * still need reading, and is there anything left to resume at all.
 *
 * Re-reading is usually free — the parse very often completed after the client vanished, so
 * `parse.json` is already sitting beside the photo (P41) — which is what makes recovering the
 * whole capture the right default rather than something to ask about.
 */

export interface RecoveryPlan {
  /** Every page still known to the capture, in upload order. */
  pages: { imageKey: string; imageIndex: number; needsParse: boolean }[];
  /** Nothing usable is left — the row holds no uploaded page, so offer a fresh photo. */
  startAgain: boolean;
}

/** Object keys in upload order (P20). Blank entries are dropped, not counted as pages. */
export function pageKeys(capture: Pick<NoteCapture, "imageKeys">): string[] {
  return (capture.imageKeys ?? "").split(",").filter(Boolean);
}

/**
 * Plan the resume for one capture.
 *
 * A page counts as read when it has at least one persisted block: blocks are written per page,
 * immediately after that page's parse (P3), so their presence is the durable record that the
 * page got through. A page with none is re-read; a capture with no pages at all can only start
 * again, since the photos never landed and there is nothing to read.
 */
export function planRecovery(capture: NoteCapture, blocks: NoteBlock[]): RecoveryPlan {
  const keys = pageKeys(capture);
  const parsedPages = new Set(
    blocks.filter((b) => b.captureId === capture.id).map((b) => b.imageIndex),
  );
  return {
    pages: keys.map((imageKey, imageIndex) => ({
      imageKey,
      imageIndex,
      needsParse: !parsedPages.has(imageIndex),
    })),
    startAgain: keys.length === 0,
  };
}

/**
 * Is this capture worth resuming?
 *
 * `PARSING` is the only status that can be stuck: `REVIEW` and `DONE` are both places a
 * student can act from, and the Photo button already reopens a review. A `PARSING` capture with
 * every page read is also finished in everything but name — it just never got its final status
 * write — so resuming it is a status correction rather than a re-read, which `resumeCapture`
 * does for free.
 */
export function needsRecovery(capture: NoteCapture): boolean {
  return capture.status === "PARSING";
}

/** The most recent interrupted capture, or none. Newest wins: it is the one they just lost. */
export function interruptedCapture(captures: NoteCapture[]): NoteCapture | undefined {
  return [...captures]
    .filter(needsRecovery)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
