/**
 * The measured downscale target, in a module the main thread and the worker can BOTH import
 * (spec-note-capture.md P24, hardening H11).
 *
 * Split out for exactly one reason: the worker must not import `downscale.ts`, which is what
 * spawns the worker — that would bundle a worker inside the worker. The numbers live here so
 * there is still one source of truth for them rather than a copy per thread, which is the way
 * a measured value silently becomes two different values.
 */

/** Long-edge target. Do not lower this without re-running `scripts/eval-note-capture.ts`. */
export const LONG_EDGE = 2400;

/** JPEG quality. 0.85 measured clean; below ~0.7 introduces artefacts around thin pen strokes. */
export const JPEG_QUALITY = 0.85;

/**
 * Target dimensions preserving aspect ratio, capped on the long edge.
 * An image already within the cap is left alone — upscaling a small photo would invent
 * detail and cost bytes for nothing.
 */
export function targetSize(
  width: number,
  height: number,
  longEdge = LONG_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= longEdge || longest === 0) return { width, height };
  const scale = longEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
