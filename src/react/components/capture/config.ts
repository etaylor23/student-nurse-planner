/**
 * Note-capture build-time config (spec-note-capture.md).
 *
 * Unlike AI recall, the capture endpoints live on the ordinary same-origin `/api/rpc`, so
 * there is no absolute URL to inject. But there is still a deploy dependency the bundle
 * can't detect: the S3 bucket and the `CAPTURE_BUCKET` env var on the router. Without them
 * the presign fails at runtime, and a button that always errors is worse than no button.
 *
 * So the UI is gated on an explicit opt-in flag, set by CI once the backend is deployed —
 * same posture as `aiAvailable()`: a missing or failed deploy hides the feature rather than
 * surfacing a broken one.
 */
export const CAPTURE_ENABLED =
  (import.meta.env.VITE_CAPTURE_ENABLED as string | undefined)?.trim() === "true";

export function captureAvailable(): boolean {
  return CAPTURE_ENABLED;
}

/** Max photos per capture, mirroring the server's `MAX_IMAGES_PER_CAPTURE` (P20). */
export const MAX_IMAGES_PER_CAPTURE = 10;
