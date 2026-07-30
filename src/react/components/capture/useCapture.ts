import { useCallback, useMemo, useState } from "react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import { API_BASE } from "../../../auth/passwordlessConfig";
import { CaptureClient, CaptureUploadError } from "../../../data/api/captureClient";
import { useRepository } from "../../RepositoryContext";
import { CaptureImageError, downscaleForUpload } from "./downscale";
import type { NoteCapture } from "../../../domain/types";

/**
 * Capture flow state machine (spec-note-capture.md Phase 1).
 *
 * Order matters and is load-bearing:
 *   1. the student acknowledges the PII warning (P2) — nothing opens the camera first;
 *   2. photos are downscaled locally to 2400px (P24 default, measured);
 *   3. each is presigned (which counts it against the daily cap, P17) then PUT direct to S3;
 *   4. the `NoteCapture` row records the keys, in upload order (P20).
 *
 * Photos upload **sequentially**, one at a time. A capture is a notebook session, so several
 * pages is normal, but a ward connection handles one 700 KB PUT far better than five at once
 * — and a mid-run failure then leaves a capture with the pages that did land rather than an
 * indeterminate mess.
 *
 * NO PARSING HERE. Phase 1 proves only the storage seam; `status` stays `PARSING` as the
 * honest description of "uploaded, nothing read yet" until Phase 2 adds the pipeline.
 */

export type CaptureStage = "idle" | "uploading" | "done" | "capped" | "error";

export interface CaptureProgress {
  /** 1-based index of the photo currently uploading. */
  current: number;
  total: number;
}

export interface CaptureState {
  stage: CaptureStage;
  progress?: CaptureProgress;
  capture?: NoteCapture;
  /** Photos left today, once known (P17). */
  remaining?: number;
  resetsAt?: string;
  error?: string;
}

/** Copy for the failure modes the student can actually hit. */
function messageFor(err: unknown): string {
  if (err instanceof CaptureImageError) {
    switch (err.code) {
      case "not_an_image":
        return "That file isn't a photo — pick an image of your notes.";
      case "too_large":
        return "That photo is too big even after resizing. Try taking it again.";
      default:
        return "Couldn't read that photo. Try taking it again.";
    }
  }
  if (err instanceof CaptureUploadError) {
    return err.code === "presign_failed"
      ? "Couldn't start the upload. Check your connection and try again."
      : "The upload didn't finish. Check your connection and try again.";
  }
  return "Something went wrong. Try again.";
}

export function useCapture() {
  const { repo, userId } = useRepository();
  const [state, setState] = useState<CaptureState>({ stage: "idle" });

  const client = useMemo(
    () =>
      new CaptureClient({
        apiBase: API_BASE,
        getIdToken: async () => {
          const tokens = await retrieveTokens();
          if (!tokens?.idToken) throw new Error("Not signed in");
          return tokens.idToken;
        },
      }),
    [],
  );

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  /**
   * Upload the picked files as one capture. `piiAcknowledged` is passed in rather than
   * assumed: the row records that the warning was shown and accepted (P2), so it must come
   * from the UI that actually showed it.
   */
  const startCapture = useCallback(
    async (files: File[], opts: { piiAcknowledged: boolean }) => {
      if (files.length === 0) return;
      setState({ stage: "uploading", progress: { current: 1, total: files.length } });

      // The row is created FIRST so the capture id is the one the object keys are built
      // from — that keeps the S3 prefix and the row in step even if an upload fails
      // half-way, which is what makes GDPR erasure by prefix reliable.
      let capture: NoteCapture;
      try {
        capture = await repo.createNoteCapture({
          userId,
          imageKeys: "",
          piiAcknowledged: opts.piiAcknowledged,
          status: "PARSING",
        });
      } catch (err) {
        setState({ stage: "error", error: messageFor(err) });
        return;
      }

      const keys: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setState({ stage: "uploading", progress: { current: i + 1, total: files.length } });
        try {
          const shrunk = await downscaleForUpload(files[i]);
          const res = await client.uploadPhoto({
            captureId: capture.id,
            imageIndex: i,
            blob: shrunk.blob,
            contentType: shrunk.contentType,
          });
          if (!res.ok) {
            // Cap hit mid-run: keep whatever landed rather than discarding it, and say so.
            if (keys.length > 0) {
              capture = await repo.updateNoteCapture(capture.id, { imageKeys: keys.join(",") });
            }
            setState({
              stage: "capped",
              capture: keys.length > 0 ? capture : undefined,
              remaining: 0,
              resetsAt: res.resetsAt,
            });
            return;
          }
          keys.push(res.key);
          setState((s) => ({ ...s, remaining: res.remaining }));
        } catch (err) {
          if (keys.length > 0) {
            capture = await repo.updateNoteCapture(capture.id, { imageKeys: keys.join(",") });
          }
          setState({
            stage: "error",
            capture: keys.length > 0 ? capture : undefined,
            error: messageFor(err),
          });
          return;
        }
      }

      capture = await repo.updateNoteCapture(capture.id, {
        imageKeys: keys.join(","),
        status: "REVIEW",
      });
      setState((s) => ({ stage: "done", capture, remaining: s.remaining }));
    },
    [client, repo, userId],
  );

  return { state, startCapture, reset };
}
