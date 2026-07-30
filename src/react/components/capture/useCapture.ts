import { useCallback, useMemo, useState } from "react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import { API_BASE } from "../../../auth/passwordlessConfig";
import { CaptureClient, CaptureUploadError } from "../../../data/api/captureClient";
import { ParseClient, type ParseResponse } from "../../../data/api/parseClient";
import { useRepository } from "../../RepositoryContext";
import { PARSE_URL, parseAvailable } from "./config";
import { CaptureImageError, downscaleForUpload } from "./downscale";
import type { NoteCapture } from "../../../domain/types";

/**
 * Capture flow state machine (spec-note-capture.md Phases 1–3).
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
 * After the uploads, each photo is parsed (P12) and the capture moves to REVIEW. Parsing is
 * kept strictly separate from uploading: the photos are already durable by then, so a parse
 * failure must never lose them — a two-page capture whose second page failed still has a
 * first page worth reviewing.
 */

export type CaptureStage =
  | "idle"
  | "uploading"
  | "parsing"
  | "review"
  | "done"
  | "capped"
  | "error";

export interface CaptureProgress {
  /** 1-based index of the photo currently uploading. */
  current: number;
  total: number;
}

export interface CaptureState {
  stage: CaptureStage;
  /** Parse results, once the pipeline has run. One entry per uploaded photo. */
  parsed?: ParseResponse[];
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

  const idToken = async () => {
    const tokens = await retrieveTokens();
    if (!tokens?.idToken) throw new Error("Not signed in");
    return tokens.idToken;
  };

  const client = useMemo(() => new CaptureClient({ apiBase: API_BASE, getIdToken: idToken }), []);
  const parser = useMemo(
    () => (parseAvailable() ? new ParseClient({ parseUrl: PARSE_URL, getIdToken: idToken }) : null),
    [],
  );

  const reset = useCallback(() => setState({ stage: "idle" }), []);

  /**
   * The student's own context, read from the LOCAL database (P32). Sending it means parseFn
   * needs no table access at all — and it is all data the client already holds, so there is
   * no extra round-trip. `ProficiencyStatus` is deliberately not included: ranking evidence
   * by what the student still needs would corrupt a record headed for the NMC.
   */
  const localContext = useCallback(async () => {
    const [meds, tags, placements] = await Promise.all([
      repo.listMedications(userId),
      repo.listTags(userId),
      repo.listPlacements(userId),
    ]);
    const current = placements[0];
    return {
      medicationNames: meds.map((m) => m.name),
      tagLabels: tags.map((t) => t.label),
      placementName: current?.name,
      placementSetting: current?.settingType,
    };
  }, [repo, userId]);

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

      capture = await repo.updateNoteCapture(capture.id, { imageKeys: keys.join(",") });

      // Photos are stored; that part is already durable. Parsing is a separate concern and a
      // failure here must NOT lose the upload — the student can retry the read later.
      if (!parser) {
        capture = await repo.updateNoteCapture(capture.id, { status: "REVIEW" });
        setState((s) => ({ stage: "done", capture, remaining: s.remaining }));
        return;
      }

      setState((s) => ({
        ...s,
        stage: "parsing",
        capture,
        progress: { current: 1, total: keys.length },
      }));
      const parsed: ParseResponse[] = [];
      for (let i = 0; i < keys.length; i++) {
        setState((s) => ({
          ...s,
          stage: "parsing",
          progress: { current: i + 1, total: keys.length },
        }));
        try {
          parsed.push(
            await parser.parse({
              captureId: capture.id,
              imageKey: keys[i],
              imageIndex: i,
              // What parseFn would otherwise need table access for (P32).
              context: await localContext(),
            }),
          );
        } catch (err) {
          // Partial results are worth keeping — a two-page capture whose second page failed
          // still has a first page worth reviewing.
          setState({
            stage: parsed.length > 0 ? "review" : "error",
            capture,
            parsed,
            error: parsed.length > 0 ? undefined : messageFor(err),
          });
          return;
        }
      }

      capture = await repo.updateNoteCapture(capture.id, {
        status: "REVIEW",
        pageDateRaw: parsed[0]?.pageDateRaw ?? undefined,
      });
      setState((s) => ({ stage: "review", capture, parsed, remaining: s.remaining }));
    },
    [client, parser, repo, userId, localContext],
  );

  return { state, startCapture, reset };
}
