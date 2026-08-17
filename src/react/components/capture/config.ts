/**
 * Note-capture client config (spec-note-capture.md).
 *
 * The parse endpoint needs a build-time value, for the same reason AI recall's ask URL
 * does: it's a Lambda Function URL on its own origin (four model calls take ~70s, well past
 * API Gateway's 29s ceiling), so its absolute URL has to reach the bundle. Unset means
 * uploads still work and simply aren't parsed — the photo is stored either way, so a missing
 * value degrades to "saved, not read yet" rather than to a broken flow.
 */
export const PARSE_URL = (import.meta.env.VITE_PARSE_URL as string | undefined)?.trim() ?? "";

export function parseAvailable(): boolean {
  return PARSE_URL.length > 0;
}

/** Max photos per capture, mirroring the server's `MAX_IMAGES_PER_CAPTURE` (P20). */
export const MAX_IMAGES_PER_CAPTURE = 10;

/**
 * Photos per day, mirroring the server's `DAILY_PHOTO_LIMIT` (P17).
 *
 * Display only — the server counts, and the presign is what enforces it. Held separately from
 * `MAX_IMAGES_PER_CAPTURE` even though the two are the same number today: one bounds a notebook
 * session and the other bounds a day, and the cap screen would start lying the moment either
 * moved.
 */
export const DAILY_PHOTO_LIMIT = 10;

/*
 * The localhost-only gate (spec-home-redesign.md decision 12) was REMOVED 2026-08-17 on
 * Ellis's instruction: the hardening spec is done end to end (H1–H12, gates met on dev),
 * the 12-page corpus shows no regressions, and capture ships to the beta accounts. Guests
 * still never see the button — they have no ID token, so no presign is possible — and the
 * PII warning (P2) remains the unavoidable first screen of every capture.
 */
