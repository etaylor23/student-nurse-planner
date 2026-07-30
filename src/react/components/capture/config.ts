/**
 * Note-capture client config (spec-note-capture.md).
 *
 * There is no feature flag here — the button shows to any signed-in user, and guests are
 * excluded only because they have no ID token to presign with.
 *
 * The parse endpoint DOES need a build-time value, for the same reason AI recall's ask URL
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
