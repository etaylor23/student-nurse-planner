/**
 * Note-capture client constants (spec-note-capture.md).
 *
 * There is deliberately no build-time feature flag here. The capture endpoints live on the
 * ordinary same-origin `/api/rpc`, so there is no URL to inject, and gating on a repo
 * Variable proved to be more ceremony than it was worth. The button is shown to any
 * signed-in user; if the backend isn't deployed the upload surfaces an error, which is a
 * clearer signal than a feature that silently isn't there.
 *
 * Guests are still excluded, but that isn't a flag — they have no ID token, so the presign
 * cannot be authorised at all.
 */

/** Max photos per capture, mirroring the server's `MAX_IMAGES_PER_CAPTURE` (P20). */
export const MAX_IMAGES_PER_CAPTURE = 10;
