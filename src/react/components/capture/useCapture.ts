import { useCallback, useMemo, useRef, useState } from "react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import { API_BASE } from "../../../auth/passwordlessConfig";
import { CaptureClient, CaptureUploadError } from "../../../data/api/captureClient";
import { ParseClient, type ParseResponse } from "../../../data/api/parseClient";
import { useRepository } from "../../RepositoryContext";
import { resolveShift, type ShiftResolution } from "../../../logic/captureShift";
import {
  AllocateError,
  allocateBlock,
  unallocateBlock,
  type AllocateInput,
} from "../../../logic/allocateBlock";
import { PARSE_URL, parseAvailable } from "./config";
import { CaptureImageError, downscaleForUpload, type DownscaleResult } from "./downscale";
import type { BlockPatch } from "./ReviewPanel";
import type { NoteBlock, NoteBlockKind, NoteBlockTarget, NoteCapture } from "../../../domain/types";

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
  /** The PERSISTED blocks — what review edits and allocation act on. */
  blocks?: NoteBlock[];
  /** Which shift the page belongs to, plus the alternates (P9). */
  shift?: ShiftResolution;
  /** The student's own cards and tag labels, so review can link rather than duplicate (P33/P37). */
  known?: { medications: { id: string; name: string }[]; tagLabels: string[] };
  /** What the pipeline is doing right now, from the stream's stage frames (P40). */
  activity?: string;
  /** The verbatim transcription, shown ~30s before the classified blocks arrive. */
  preview?: string;
  progress?: CaptureProgress;
  capture?: NoteCapture;
  /** Photos left today, once known (P17). */
  remaining?: number;
  /** Set when this parse came from the S3 cache rather than the models (P41). */
  cachedFrom?: string;
  resetsAt?: string;
  error?: string;
}

/** Object keys in upload order (P20), for the capture row. */
function keyList(pages: { key: string }[]): string {
  return pages.map((p) => p.key).join(",");
}

/**
 * Accept a cached parse only if it still looks like one (P41).
 *
 * The cache is our own JSON in our own bucket, but it was written by a different deploy than
 * the one reading it, so the shape is not guaranteed across a schema change. A malformed cache
 * degrades to a normal parse rather than crashing review — same fail-closed posture the
 * sentinel parser and the zod guards take.
 */
function asParseResponse(
  raw: unknown,
  captureId: string,
  imageIndex: number,
): ParseResponse | null {
  const o = raw as Partial<ParseResponse> | null;
  if (!o || !Array.isArray(o.blocks) || o.blocks.length === 0) return null;
  return {
    captureId,
    imageIndex,
    pageDateRaw: o.pageDateRaw ?? null,
    wardHint: o.wardHint ?? null,
    corrections: Array.isArray(o.corrections) ? o.corrections : [],
    blocks: o.blocks,
  };
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
  /** The downscaled photos of the current capture, kept so a re-read (P41) needs no re-pick. */
  const lastRun = useRef<{ pages: DownscaleResult[]; piiAcknowledged: boolean } | null>(null);

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
   * Write one page's classified blocks as `NoteBlock` rows (P3/P26).
   *
   * `rawText` is the vision model's verbatim transcription and is frozen from here (P11);
   * `text` starts as the sanitised version and is what the student edits. Everything the
   * classifier suggested is stored as a suggestion — `status` stays PENDING until the student
   * allocates, so nothing has touched their records yet.
   */
  const persistBlocks = useCallback(
    async (captureId: string, page: ParseResponse): Promise<NoteBlock[]> => {
      const out: NoteBlock[] = [];
      for (const b of page.blocks) {
        out.push(
          await repo.createNoteBlock({
            userId,
            captureId,
            imageIndex: page.imageIndex,
            fromRegions: b.fromRegions.join(","),
            // The parse response carries the sanitised text; the verbatim original is what
            // the vision model read, so both are recorded and only one is editable.
            rawText: b.text,
            text: b.text,
            kind: b.kind as NoteBlockKind,
            confidence: b.confidence,
            bboxX0: b.bbox.x0,
            bboxY0: b.bbox.y0,
            bboxX1: b.bbox.x1,
            bboxY1: b.bbox.y1,
            rotationDeg: b.rotationDeg,
            disputedWords: b.disputedWords.join(","),
            corrections: page.corrections.join(","),
            candidateCodes: b.candidateCodes.join(","),
            suggestedTags: b.tags.join(","),
            medicationCandidate: b.medicationCandidate,
            groupId: b.groupKey,
            status: "PENDING",
            targetType: b.targetType as NoteBlockTarget | undefined,
          }),
        );
      }
      return out;
    },
    [repo, userId],
  );

  /**
   * Normalise suggested tags against the student's own vocabulary.
   *
   * An existing tag keeps ITS original casing — the student typed "haematology" that way and
   * a second differently-cased variant would split their index, which is the whole thing
   * `Tag`'s unique-per-user-label constraint exists to prevent. A genuinely new tag is Title
   * Cased, because the model returns whatever casing it feels like.
   */
  const reconcileTags = useCallback((suggested: string[], existing: string[]): string[] => {
    const byLower = new Map(existing.map((t) => [t.toLowerCase(), t]));
    const out: string[] = [];
    for (const raw of suggested) {
      const t = raw.trim();
      if (!t) continue;
      const match = byLower.get(t.toLowerCase());
      const label = match ?? t.replace(/\b\w/g, (c) => c.toUpperCase());
      if (!out.includes(label)) out.push(label);
    }
    return out;
  }, []);

  /**
   * The student's own context, read from the LOCAL database (P32). Sending it means parseFn
   * needs no table access at all — and it is all data the client already holds, so there is
   * no extra round-trip. `ProficiencyStatus` is deliberately not included: ranking evidence
   * by what the student still needs would corrupt a record headed for the NMC.
   *
   * The medication CARDS are kept client-side as well as their names being sent: the
   * classifier returns a drug name, and turning that name into a link (or an offer to create
   * a card) is the review screen's job, where the student's own cards live (P33).
   */
  const localContext = useCallback(async () => {
    const [meds, tags, placements] = await Promise.all([
      repo.listMedications(userId),
      repo.listTags(userId),
      repo.listPlacements(userId),
    ]);
    const current = placements[0];
    return {
      wire: {
        medicationNames: meds.map((m) => m.name),
        tagLabels: tags.map((t) => t.label),
        placementName: current?.name,
        placementSetting: current?.settingType,
      },
      known: {
        medications: meds.map((m) => ({ id: m.id, name: m.name })),
        tagLabels: tags.map((t) => t.label),
      },
    };
  }, [repo, userId]);

  /**
   * Upload the picked files as one capture. `piiAcknowledged` is passed in rather than
   * assumed: the row records that the warning was shown and accepted (P2), so it must come
   * from the UI that actually showed it.
   */
  const runCapture = useCallback(
    async (pages: DownscaleResult[], opts: { piiAcknowledged: boolean; refresh?: boolean }) => {
      if (pages.length === 0) return;
      setState({ stage: "uploading", progress: { current: 1, total: pages.length } });

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

      // One entry per page, in upload order (P20). `cached` is set when this exact page has
      // been read before (P41) — nothing was uploaded and no model will run for it.
      const uploaded: { key: string; cached?: ParseResponse; parsedAt?: string }[] = [];
      for (let i = 0; i < pages.length; i++) {
        setState({ stage: "uploading", progress: { current: i + 1, total: pages.length } });
        try {
          const res = await client.uploadPhoto({
            captureId: capture.id,
            imageIndex: i,
            blob: pages[i].blob,
            contentType: pages[i].contentType,
            refresh: opts.refresh,
          });
          if (!res.ok) {
            // Cap hit mid-run: keep whatever landed rather than discarding it, and say so.
            if (uploaded.length > 0) {
              capture = await repo.updateNoteCapture(capture.id, { imageKeys: keyList(uploaded) });
            }
            setState({
              stage: "capped",
              capture: uploaded.length > 0 ? capture : undefined,
              remaining: 0,
              resetsAt: res.resetsAt,
            });
            return;
          }
          if (res.cached) {
            const page = asParseResponse(res.parse, capture.id, i);
            uploaded.push(
              page ? { key: res.key, cached: page, parsedAt: res.parsedAt } : { key: res.key },
            );
          } else {
            uploaded.push({ key: res.key });
            setState((s) => ({ ...s, remaining: res.remaining }));
          }
        } catch (err) {
          if (uploaded.length > 0) {
            capture = await repo.updateNoteCapture(capture.id, { imageKeys: keyList(uploaded) });
          }
          setState({
            stage: "error",
            capture: uploaded.length > 0 ? capture : undefined,
            error: messageFor(err),
          });
          return;
        }
      }

      capture = await repo.updateNoteCapture(capture.id, { imageKeys: keyList(uploaded) });

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
        progress: { current: 1, total: uploaded.length },
      }));
      const parsed: ParseResponse[] = [];
      for (let i = 0; i < uploaded.length; i++) {
        setState((s) => ({
          ...s,
          stage: "parsing",
          progress: { current: i + 1, total: uploaded.length },
        }));
        try {
          const { wire, known } = await localContext();
          setState((s) => ({ ...s, known }));
          const held: { page: ParseResponse | null; error: { message: string } | null } = {
            page: null,
            error: null,
          };

          // A page we've read before skips all four model calls (P41). The cached parse is
          // what was FIRST presented — before any editing or filing, which live on the rows.
          const fromCache = uploaded[i].cached;
          if (fromCache) {
            held.page = {
              ...fromCache,
              blocks: fromCache.blocks.map((b) => ({
                ...b,
                tags: reconcileTags(b.tags, wire.tagLabels ?? []),
              })),
            };
            setState((s) => ({ ...s, cachedFrom: uploaded[i].parsedAt ?? "earlier" }));
          } else
            await parser.parse(
              {
                captureId: capture.id,
                imageKey: uploaded[i].key,
                imageIndex: i,
                // What parseFn would otherwise need table access for (P32).
                context: wire,
              },
              {
                onStage: (_stage, message) => setState((s) => ({ ...s, activity: message })),
                // The student's own words, ~30s before the filing suggestions. Showing these
                // early is the entire reason this endpoint streams.
                onTranscribed: (p) => setState((s) => ({ ...s, preview: p.pageText })),
                onCorrected: (p) => setState((s) => ({ ...s, preview: p.text })),
                onBlocks: (p) => {
                  held.page = {
                    ...p,
                    blocks: p.blocks.map((b) => ({
                      ...b,
                      tags: reconcileTags(b.tags, wire.tagLabels ?? []),
                    })),
                  };
                },
                onDone: () => {},
                onError: (_code, message) => {
                  held.error = { message };
                },
              },
            );

          // An error FRAME arrives after a 200, so it can't be a thrown status — surface it
          // the same way a thrown failure would be.
          if (held.error) throw new Error(held.error.message);
          const page = held.page;
          if (page) {
            parsed.push(page);
            // Resolve the shift from the page's own written date (P8) — the app matches, the
            // model only reported what it read.
            if (parsed.length === 1) {
              const shifts = await repo.listShifts(userId);
              const resolution = resolveShift(page.pageDateRaw, shifts);
              setState((s) => ({ ...s, shift: resolution }));
              // Stamp it on the capture so allocation can inherit it (P6).
              if (resolution.suggested) {
                capture = await repo.updateNoteCapture(capture.id, {
                  shiftId: resolution.suggested.shift.id,
                  pageDateRaw: page.pageDateRaw ?? undefined,
                });
              }
            }
            // Persist immediately, per page. Blocks are first-class rows (P3) and the review
            // screen edits THEM, not the in-memory response — otherwise closing the dialog
            // loses the parse, and allocation has no `sourceId` to point at (P5).
            const saved = await persistBlocks(capture.id, page);
            setState((s) => ({ ...s, blocks: [...(s.blocks ?? []), ...saved] }));
          }
        } catch (err) {
          // Partial results are worth keeping — a two-page capture whose second page failed
          // still has a first page worth reviewing. Spread, don't replace: the persisted
          // `blocks` and the resolved `shift` are already in state and review needs both.
          setState((s) => ({
            ...s,
            stage: parsed.length > 0 ? "review" : "error",
            capture,
            parsed,
            error: parsed.length > 0 ? undefined : messageFor(err),
          }));
          return;
        }
      }

      capture = await repo.updateNoteCapture(capture.id, {
        status: "REVIEW",
        pageDateRaw: parsed[0]?.pageDateRaw ?? undefined,
      });
      setState((s) => ({ ...s, stage: "review", capture, parsed, activity: undefined }));
    },
    [client, parser, repo, userId, localContext, reconcileTags, persistBlocks],
  );

  /**
   * Downscale the picked photos, then run the capture.
   *
   * The downscaled blobs are RETAINED for the session so "read it again from scratch" (P41)
   * doesn't need the student to find the photo a second time — and so the re-read hashes to
   * the same key, which is what makes it overwrite the cache rather than orphan it.
   */
  const startCapture = useCallback(
    async (files: File[], opts: { piiAcknowledged: boolean }) => {
      if (files.length === 0) return;
      setState({ stage: "uploading", progress: { current: 1, total: files.length } });
      const pages: DownscaleResult[] = [];
      try {
        for (const f of files) pages.push(await downscaleForUpload(f));
      } catch (err) {
        setState({ stage: "error", error: messageFor(err) });
        return;
      }
      lastRun.current = { pages, piiAcknowledged: opts.piiAcknowledged };
      await runCapture(pages, opts);
    },
    [runCapture],
  );

  /** Ignore the cached parse and read the page again with the models (P41). */
  const rerunFromScratch = useCallback(async () => {
    const last = lastRun.current;
    if (!last) return;
    await runCapture(last.pages, { piiAcknowledged: last.piiAcknowledged, refresh: true });
  }, [runCapture]);

  /**
   * File a block into the student's real records (P4), and reflect the result in state.
   *
   * Errors are returned rather than thrown: "pick a proficiency first" is a normal thing for
   * the UI to say next to the block, not an exception for it to catch.
   */
  const allocate = useCallback(
    async (
      blockId: string,
      opts: Omit<AllocateInput, "block"> = {},
    ): Promise<{ ok: true; label: string } | { ok: false; message: string }> => {
      const block = state.blocks?.find((b) => b.id === blockId);
      if (!block) return { ok: false, message: "That block is no longer here." };
      try {
        const res = await allocateBlock(repo, userId, {
          block,
          shiftFallbackId: state.capture?.shiftId,
          shiftFallbackShift: state.shift?.candidates.find(
            (c) => c.shift.id === state.capture?.shiftId,
          )?.shift,
          ...opts,
        });
        setState((s) => ({
          ...s,
          blocks: (s.blocks ?? []).map((b) => (b.id === blockId ? res.block : b)),
        }));
        return { ok: true, label: res.created.label };
      } catch (err) {
        if (err instanceof AllocateError) return { ok: false, message: err.message };
        return { ok: false, message: "Couldn't file that — try again." };
      }
    },
    [repo, userId, state.blocks, state.capture, state.shift],
  );

  /** Reverse an allocation (P19). The warning is shown when text couldn't be cleanly removed. */
  const unallocate = useCallback(
    async (blockId: string): Promise<{ warning?: string }> => {
      const block = state.blocks?.find((b) => b.id === blockId);
      if (!block) return {};
      const res = await unallocateBlock(repo, block);
      setState((s) => ({
        ...s,
        blocks: (s.blocks ?? []).map((b) => (b.id === blockId ? res.block : b)),
      }));
      return { warning: res.warning };
    },
    [repo, state.blocks],
  );

  /**
   * Persist a review edit — the student's decisions are durable (P3/P11).
   *
   * Every change review offers goes through here, including declining a suggestion. A removed
   * tag that wasn't written back would reappear the next time the blocks were read, which
   * would make the removal a lie. `rawText` is not in the patch type and cannot be touched.
   */
  const editBlock = useCallback(
    async (blockId: string, patch: BlockPatch) => {
      const updated = await repo.updateNoteBlock(blockId, patch);
      setState((s) => ({
        ...s,
        blocks: (s.blocks ?? []).map((b) => (b.id === blockId ? updated : b)),
      }));
    },
    [repo],
  );

  /**
   * Create a `Medication` card from a block, pre-filled from the block's own content (P33).
   *
   * Never silent — this only runs when the student accepts the offer. The note's own words
   * become the card's `keyNotes` rather than being split into `drugClass`/`sideEffects` by
   * pattern-matching: the classifier doesn't return those fields, and guessing them from prose
   * is exactly the deterministic parsing P38 rejected. The student fills the rest in.
   */
  const createMedication = useCallback(
    async (name: string, notes: string): Promise<string | undefined> => {
      const clean = name.trim();
      if (!clean) return undefined;
      try {
        // Don't duplicate a card they already have — `Medication` is theirs and a second
        // "Aciclovir" would split the study notes it exists to gather.
        const existing = (await repo.listMedications(userId)).find(
          (m) => m.name.toLowerCase() === clean.toLowerCase(),
        );
        const med =
          existing ??
          (await repo.createMedication({
            userId,
            name: clean,
            keyNotes: notes.trim() || undefined,
            highAlert: false,
          }));
        setState((s) => ({
          ...s,
          known: {
            medications: [
              ...(s.known?.medications ?? []).filter((m) => m.id !== med.id),
              { id: med.id, name: med.name },
            ],
            tagLabels: s.known?.tagLabels ?? [],
          },
        }));
        return med.id;
      } catch {
        return undefined;
      }
    },
    [repo, userId],
  );

  /**
   * Drop a block the student says isn't useful — a page title, a phone number, a stray line.
   *
   * This deletes the `NoteBlock` row (softly, through the normal repository path, so it
   * tombstones and syncs). It does NOT touch the photo, which is retained for the life of the
   * account (P13) — and since the parse is cached against the image's hash (P41), re-reading
   * the page brings the block back for free. So "nothing the student wrote is discarded" (P34)
   * still holds: the page is intact, this is just not a row they want.
   */
  const dismissBlock = useCallback(
    async (blockId: string) => {
      await repo.deleteNoteBlock(blockId);
      setState((s) => ({ ...s, blocks: (s.blocks ?? []).filter((b) => b.id !== blockId) }));
    },
    [repo],
  );

  /** Re-attach the capture to a different shift (P9). Allocation inherits it (P6). */
  const selectShift = useCallback(
    async (shiftId: string | undefined) => {
      if (!state.capture) return;
      const updated = await repo.updateNoteCapture(state.capture.id, { shiftId });
      setState((s) => ({ ...s, capture: updated }));
    },
    [repo, state.capture],
  );

  return {
    state,
    startCapture,
    rerunFromScratch,
    reset,
    selectShift,
    allocate,
    unallocate,
    editBlock,
    dismissBlock,
    createMedication,
  };
}
