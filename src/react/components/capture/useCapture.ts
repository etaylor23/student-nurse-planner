import { useCallback, useMemo, useRef, useState } from "react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import { API_BASE } from "../../../auth/passwordlessConfig";
import { CaptureClient, CaptureUploadError } from "../../../data/api/captureClient";
import { ParseClient, ParseError, type ParseResponse } from "../../../data/api/parseClient";
import { useRepository } from "../../RepositoryContext";
import { resolveShift, type ShiftResolution } from "../../../logic/captureShift";
import {
  AllocateError,
  absorbSubBlocks,
  allocateBlock,
  keepBlock,
  restoreSubBlocks,
  unallocateBlock,
  type AllocateInput,
} from "../../../logic/allocateBlock";
import { list, subBlocksOf } from "./blockState";
import { interruptedCapture, planRecovery } from "./recover";
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
 * Photos upload **one at a time**. A capture is a notebook session, so several pages is normal,
 * but a ward connection handles one 700 KB PUT far better than five at once — and a mid-run
 * failure then leaves a capture with the pages that did land rather than an indeterminate mess.
 *
 * Each photo is then parsed (P12) and the capture moves to REVIEW. Parsing is kept strictly
 * separate from uploading: the photos are already durable by then, so a parse failure must never
 * lose them — a two-page capture whose second page failed still has a first page worth reviewing.
 *
 * **The two sides overlap** (hardening H10/H12): page N+1's downscale, hash, presign and upload
 * run while page N is being read, so a multi-page capture costs one upload plus the parses rather
 * than every upload plus every parse. Parses themselves stay sequential and in page order — the
 * progress UI is per-page, and two at once would double the exposure to a Bedrock throttle.
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
  /** The stage frame's own name — `reading` / `spellchecking` / `classifying`. The message is
   *  for reading; this is what lets the parsing screen tick the step off (P40). */
  activityStage?: string;
  /** The verbatim transcription, shown ~30s before the classified blocks arrive. */
  preview?: string;
  progress?: CaptureProgress;
  capture?: NoteCapture;
  /** Photos left today, once known (P17). */
  remaining?: number;
  /** Set while a hop is being retried (H7), cleared the moment one succeeds — the waiting
   *  screen says "trying again" instead of looking like a hang on a ward connection. */
  retrying?: { attempt: number; of: number; what: string };
  /** Signed GET for the capture's FIRST page, so review can show the photo (P1). Undefined
   *  until it resolves, and left undefined if it can't — the photo pane is an enhancement. */
  pageImageUrl?: string;
  /** Set when this parse came from the S3 cache rather than the models (P41). */
  cachedFrom?: string;
  resetsAt?: string;
  /** Which daily limit stopped this: today's photos (P17) or today's fresh reads (H8). The
   *  two are separate counters and the copy has to say which one, or the message is a guess. */
  cappedReason?: "PHOTO" | "PARSE";
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
    checkMissing: o.checkMissing === true,
    corrections: Array.isArray(o.corrections) ? o.corrections : [],
    blocks: o.blocks,
  };
}

/** Copy for the failure modes the student can actually hit. */
function messageFor(err: unknown): string {
  if (err instanceof CaptureImageError) {
    switch (err.code) {
      case "not_an_image":
        return "That file isn't a photo. Pick an image of your notes.";
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

/** Re-sign the page URL a quarter of an hour before the server's hour is up. */
const PAGE_URL_REFRESH_MS = 45 * 60 * 1000;

/**
 * One uploaded page, ready to read. `capture` rides along because each upload updates the row's
 * `imageKeys` as it lands (so an interrupted run keeps what did upload, H9) and the parse loop
 * needs the current version of the row it is about to write against.
 */
interface PageToParse {
  key: string;
  imageIndex: number;
  cached?: ParseResponse;
  parsedAt?: string;
  capture?: NoteCapture;
}

/**
 * One page the pipeline hasn't touched yet. A thunk rather than a blob so the decode + encode
 * happens inside the pipeline step (H12) — a fresh photo downscales there, and a re-read (P41)
 * hands back the bytes it already has.
 */
interface PageSource {
  get: () => Promise<DownscaleResult>;
}

/** What a retry is retrying, in the student's terms (H7). Never the hop's internal name. */
const RETRY_WHAT: Record<string, string> = {
  presign: "Getting ready to send your photo",
  upload: "Sending your photo",
  cache: "Fetching what we read last time",
};

export function useCapture() {
  const { repo, userId } = useRepository();
  const [state, setState] = useState<CaptureState>({ stage: "idle" });
  /** The downscaled photos of the current capture, kept so a re-read (P41) needs no re-pick. */
  const lastRun = useRef<{ pages: DownscaleResult[]; piiAcknowledged: boolean } | null>(null);
  /** The last signed page URL and when it was signed, so re-opening review doesn't re-sign. */
  const pageImage = useRef<{ key: string; url: string; at: number } | null>(null);

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

  const reset = useCallback(() => {
    pageImage.current = null;
    setState({ stage: "idle" });
  }, []);

  /**
   * Resolve the capture's first page to a URL the review screen can render (P1).
   *
   * Held in a ref as well as in state so re-opening the dialog doesn't re-sign a URL that is
   * still good. The signed GET lasts an hour (`PAGE_VIEW_EXPIRY_SECONDS`); this refreshes a
   * little before that, because the capture deliberately outlives the dialog and a student can
   * come back to an open review much later than they left it.
   *
   * Never throws and never sets an error: without a URL `PagePreview` renders nothing and the
   * cards are untouched, which is the right failure for a pane that grounds trust rather than
   * carrying the work.
   */
  const resolvePageImage = useCallback(
    async (imageKeys: string | undefined) => {
      const key = (imageKeys ?? "").split(",").filter(Boolean)[0];
      if (!key) return;
      const held = pageImage.current;
      if (held?.key === key && Date.now() - held.at < PAGE_URL_REFRESH_MS) {
        // Re-publish rather than return: a re-read of the same page (P41) resets `state` on the
        // way through `uploading`, and the still-valid URL has to come back with it.
        setState((s) => (s.pageImageUrl === held.url ? s : { ...s, pageImageUrl: held.url }));
        return;
      }
      const url = await client.presignPageImage(key);
      if (!url) return;
      pageImage.current = { key, url, at: Date.now() };
      setState((s) => ({ ...s, pageImageUrl: url }));
    },
    [client],
  );

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
            // Page-level like `corrections`, stored per block so the H4 chip survives
            // closing the dialog. Only when true — absent is the ordinary state.
            checkMissing: page.checkMissing || undefined,
            candidateCodes: b.candidateCodes.join(","),
            suggestedTags: b.tags.join(","),
            medicationCandidate: b.medicationCandidate,
            diagramSource: b.diagramSource,
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
   * Read each uploaded page and persist its blocks, then land in review.
   *
   * Split out of `runCapture` so resuming an interrupted capture (H9) goes through exactly
   * this code: the shift resolution, the per-page persistence and the partial-failure
   * behaviour all have to be identical, and a second copy of them would drift.
   *
   * The photos are already durable when this starts, which is what every failure path here
   * relies on: a page that can't be read is a page that can be read again later, never a lost
   * photo. `alreadyRead` counts pages recovery is skipping, so the progress line and the page
   * count still describe the whole capture.
   *
   * Pages arrive as PROMISES, one per page, so this can start reading page one while page two
   * is still uploading (H10). Parses stay strictly sequential and in order — the progress UI is
   * per-page and two parses at once would double our exposure to a Bedrock throttle. A page
   * that resolves to `undefined` means the upload side stopped (a cap, a failure): everything
   * read so far is kept and the loop ends.
   */
  const runParses = useCallback(
    async (
      start: NoteCapture,
      pages: Promise<PageToParse | undefined>[],
      opts: { alreadyRead?: ParseResponse[] } = {},
    ) => {
      let capture = start;
      const parsed: ParseResponse[] = [...(opts.alreadyRead ?? [])];
      // Only pages needing work drive the progress line; the ones already read are done.
      const total = pages.length;
      /** The shift picker needs the resolution for display even when the row already has one. */
      let shiftResolved = false;

      setState((s) => ({
        ...s,
        stage: "parsing",
        capture,
        progress: { current: 1, total },
      }));

      for (let i = 0; i < pages.length; i++) {
        setState((s) => ({ ...s, stage: "parsing", progress: { current: i + 1, total } }));
        try {
          // Usually already resolved — the upload ran during the previous page's parse.
          const uploaded = await pages[i];
          if (!uploaded) break;
          const { key, imageIndex } = uploaded;
          capture = uploaded.capture ?? capture;
          const { wire, known } = await localContext();
          setState((s) => ({ ...s, known }));
          const held: { page: ParseResponse | null; error: { message: string } | null } = {
            page: null,
            error: null,
          };

          // A page we've read before skips all four model calls (P41). The cached parse is
          // what was FIRST presented — before any editing or filing, which live on the rows.
          const fromCache = uploaded.cached;
          if (fromCache) {
            held.page = {
              ...fromCache,
              blocks: fromCache.blocks.map((b) => ({
                ...b,
                tags: reconcileTags(b.tags, wire.tagLabels ?? []),
              })),
            };
            setState((s) => ({ ...s, cachedFrom: uploaded.parsedAt ?? "earlier" }));
          } else if (parser)
            await parser.parse(
              {
                captureId: capture.id,
                imageKey: key,
                imageIndex,
                // What parseFn would otherwise need table access for (P32).
                context: wire,
                onRetry: (n) =>
                  setState((s) => ({
                    ...s,
                    retrying: { attempt: n.attempt, of: n.of, what: "Reading your page" },
                  })),
              },
              {
                onStage: (stage, message) =>
                  setState((s) => ({ ...s, activity: message, activityStage: stage })),
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

          setState((s) => (s.retrying ? { ...s, retrying: undefined } : s));
          // An error FRAME arrives after a 200, so it can't be a thrown status — surface it
          // the same way a thrown failure would be.
          if (held.error) throw new Error(held.error.message);
          const page = held.page;
          if (page) {
            parsed.push(page);
            // Resolve the shift from the page's own written date (P8) — the app matches, the
            // model only reported what it read.
            if (!shiftResolved) {
              shiftResolved = true;
              const shifts = await repo.listShifts(userId);
              const resolution = resolveShift(page.pageDateRaw, shifts);
              setState((s) => ({ ...s, shift: resolution }));
              // Stamp it on the capture so allocation can inherit it (P6). Never over a shift
              // the capture already has: on a resume that would silently move a page the
              // student had already attached (or re-attached) somewhere else.
              if (resolution.suggested && !capture.shiftId) {
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
          // The day's fresh reads are used up (H8). That is a cap, not a failure: the photos
          // are stored and the pages already read are reviewable, so it gets the cap screen
          // and the same friendly tone as the photo cap — with nothing lost either way.
          const capped = err instanceof ParseError && err.code === "capped";
          // Partial results are worth keeping — a two-page capture whose second page failed
          // still has a first page worth reviewing. Spread, don't replace: the persisted
          // `blocks` and the resolved `shift` are already in state and review needs both.
          setState((s) => ({
            ...s,
            stage:
              capped && parsed.length === 0 ? "capped" : parsed.length > 0 ? "review" : "error",
            cappedReason: capped ? "PARSE" : undefined,
            resetsAt: capped ? err.resetsAt : undefined,
            retrying: undefined,
            capture,
            parsed,
            error: capped || parsed.length > 0 ? undefined : messageFor(err),
          }));
          return;
        }
      }

      capture = await repo.updateNoteCapture(capture.id, {
        status: "REVIEW",
        pageDateRaw: capture.pageDateRaw ?? parsed[0]?.pageDateRaw ?? undefined,
      });
      setState((s) => ({
        ...s,
        stage: "review",
        capture,
        parsed,
        activity: undefined,
        activityStage: undefined,
      }));
    },
    [parser, repo, userId, localContext, reconcileTags, persistBlocks],
  );

  /**
   * Upload the picked files as one capture. `piiAcknowledged` is passed in rather than
   * assumed: the row records that the warning was shown and accepted (P2), so it must come
   * from the UI that actually showed it.
   */
  const runCapture = useCallback(
    async (sources: PageSource[], opts: { piiAcknowledged: boolean; refresh?: boolean }) => {
      if (sources.length === 0) return;
      setState({ stage: "uploading", progress: { current: 1, total: sources.length } });

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

      /**
       * The upload side of the pipeline (H10/H12).
       *
       * Each page is downscaled, hashed, presigned and PUT — one page at a time, because a
       * ward connection handles a single 700 KB PUT far better than five at once, and because
       * the presign key is the hash of the downscaled bytes, so the two cannot be reordered
       * (H12: presigning "while downscaling" is arithmetically impossible, not merely awkward).
       *
       * What DOES overlap is the next page and the current parse: the chain keeps running while
       * `runParses` waits on model calls, so page two's decode, encode and upload are already
       * done by the time page one's ~70 seconds are up. A multi-page capture costs one upload
       * plus the parses, instead of every upload plus every parse.
       */
      const keys: { key: string }[] = [];
      let stopped = false;
      /** Set when the upload side stops early, so the parse loop can end honestly. */
      let stopState: Partial<CaptureState> | undefined;

      const uploadOne = async (i: number): Promise<PageToParse | undefined> => {
        if (stopped) return undefined;
        try {
          const page = await sources[i].get();
          const res = await client.uploadPhoto({
            captureId: capture.id,
            imageIndex: i,
            blob: page.blob,
            contentType: page.contentType,
            refresh: opts.refresh,
            onRetry: (n) =>
              setState((s) => ({
                ...s,
                retrying: { attempt: n.attempt, of: n.of, what: RETRY_WHAT[n.step] },
              })),
          });
          setState((s) => (s.retrying ? { ...s, retrying: undefined } : s));
          if (!res.ok) {
            // Cap hit mid-run: keep whatever landed rather than discarding it, and say so.
            stopped = true;
            stopState = {
              stage: "capped",
              cappedReason: "PHOTO",
              remaining: 0,
              resetsAt: res.resetsAt,
            };
            return undefined;
          }
          keys.push({ key: res.key });
          // Written per page: an interrupted run keeps the pages that did upload (H9).
          capture = await repo.updateNoteCapture(capture.id, { imageKeys: keyList(keys) });
          if (i === 0) {
            // Sign the page NOW rather than at review: the parsing screen shows the photo too,
            // and it is the one part of that ~70-second wait that is worth looking at.
            void resolvePageImage(capture.imageKeys);
          }
          if (res.cached) {
            const cached = asParseResponse(res.parse, capture.id, i);
            return {
              key: res.key,
              imageIndex: i,
              capture,
              ...(cached ? { cached, parsedAt: res.parsedAt } : {}),
            };
          }
          setState((s) => ({ ...s, remaining: res.remaining }));
          return { key: res.key, imageIndex: i, capture };
        } catch (err) {
          stopped = true;
          stopState = { stage: "error", error: messageFor(err) };
          return undefined;
        }
      };

      // Build the chain: each page's upload waits for the one before it, and nothing waits for
      // a parse. `pages[i]` is therefore usually already resolved when the parse loop reaches it.
      const pages: Promise<PageToParse | undefined>[] = [];
      let previous: Promise<unknown> = Promise.resolve();
      for (let i = 0; i < sources.length; i++) {
        const mine = previous.then(() => uploadOne(i));
        previous = mine;
        pages.push(mine);
      }

      // The first page has to land before there is anything to read, or to show.
      const first = await pages[0];
      if (!first) {
        setState({ ...stopState, capture: keys.length > 0 ? capture : undefined } as CaptureState);
        return;
      }

      // Photos are stored; that part is already durable. Parsing is a separate concern and a
      // failure here must NOT lose the upload — the student can retry the read later.
      if (!parser) {
        await previous; // let the remaining uploads finish before claiming the capture is done
        capture = await repo.updateNoteCapture(capture.id, { status: "REVIEW" });
        setState((s) => ({ stage: "done", capture, remaining: s.remaining }));
        return;
      }

      await runParses(capture, pages);
      // An upload that stopped mid-pipeline is reported alongside the pages that did read: the
      // photos are stored either way, and a review of two pages beats an error about the third.
      if (stopState) {
        setState((s) =>
          s.stage === "review"
            ? {
                ...s,
                remaining: 0,
                error: "One page didn't upload. Its photo is safe to try again.",
              }
            : ({ ...s, ...stopState } as CaptureState),
        );
      }
    },
    [client, parser, repo, userId, runParses, resolvePageImage],
  );

  /**
   * Pick a capture left mid-flight back up (hardening H9).
   *
   * A capture is stuck in `PARSING` when the client vanished: the tab closed, the phone locked,
   * the student walked out of WiFi. The photos were already durable — they upload before any
   * parsing starts — so nothing is lost, but until this existed the row simply sat there and
   * the pages were invisible: no review to open, and no way back to them.
   *
   * Resuming is usually FREE. The parse very often finished after the client disappeared, so
   * the result is already beside the photo in S3 (P41) and is fetched by key rather than
   * re-run; only a page with no cached parse costs a real read. A page whose photo is gone from
   * the bucket is dropped from `imageKeys` rather than retried forever, and a capture with
   * nothing left at all is deleted so the Photo button offers a clean start — the one thing a
   * student must never meet is a capture they can neither finish nor leave.
   *
   * Returns true when it took over the dialog.
   */
  const resumeInterrupted = useCallback(async (): Promise<boolean> => {
    let capture: NoteCapture | undefined;
    try {
      capture = interruptedCapture(await repo.listNoteCaptures(userId));
      if (!capture) return false;

      const blocks = (await repo.listNoteBlocks(userId, capture.id)).filter(
        (b) => b.captureId === capture!.id,
      );
      const plan = planRecovery(capture, blocks);

      // Nothing uploaded: there is no page to read and no photo to keep, so the row is only a
      // dead end. Drop it and let them take the photo again.
      if (plan.startAgain) {
        await repo.deleteNoteCapture(capture.id).catch(() => {});
        setState({ stage: "idle" });
        return false;
      }

      setState({
        stage: "parsing",
        capture,
        blocks,
        progress: { current: 1, total: plan.pages.filter((p) => p.needsParse).length || 1 },
      });
      void resolvePageImage(capture.imageKeys);

      // The shift picker needs the candidates, whether or not any page gets re-read here.
      const shifts = await repo.listShifts(userId);
      setState((s) => ({ ...s, shift: resolveShift(capture?.pageDateRaw, shifts) }));

      // Pages already read keep their persisted blocks and are not touched. A stub stands in
      // for each so review's page count and corrections still describe the whole capture.
      const alreadyRead: ParseResponse[] = plan.pages
        .filter((p) => !p.needsParse)
        .map((p) => ({
          captureId: capture!.id,
          imageIndex: p.imageIndex,
          pageDateRaw: capture?.pageDateRaw ?? null,
          wardHint: null,
          blocks: [],
          corrections: list(blocks.find((b) => b.imageIndex === p.imageIndex)?.corrections),
        }));

      // Each page's cache lookup is chained rather than awaited here, so page two's lookup
      // happens during page one's read — the same pipelining as a fresh capture (H10).
      const held = capture;
      let previous: Promise<unknown> = Promise.resolve();
      const todo = plan.pages
        .filter((p) => p.needsParse)
        .map((page) => {
          const mine = previous.then(async (): Promise<PageToParse> => {
            const hit = await client.cachedParseFor(page.imageKey);
            const cached = hit ? asParseResponse(hit.parse, held.id, page.imageIndex) : null;
            return {
              key: page.imageKey,
              imageIndex: page.imageIndex,
              ...(cached ? { cached, parsedAt: hit?.parsedAt } : {}),
            };
          });
          previous = mine;
          return mine;
        });

      await runParses(capture, todo, { alreadyRead });
      return true;
    } catch (err) {
      // Recovery is best-effort: a capture that can't be resumed must still leave the student
      // able to take a photo, so this fails back to the ordinary flow rather than a dead end.
      console.warn("could not resume capture", err);
      setState({ stage: "idle" });
      return false;
    }
  }, [client, repo, userId, runParses, resolvePageImage]);

  /** Make sure the page URL is current — called when the dialog opens, since the capture (and
   *  so an open review) outlives it and a signed URL does not. */
  const ensurePageImage = useCallback(
    () => resolvePageImage(state.capture?.imageKeys),
    [resolvePageImage, state.capture],
  );

  /**
   * Run the picked photos as one capture, downscaling each page as the pipeline reaches it.
   *
   * Downscaling used to happen for every page up front, which meant a three-page capture did
   * three decode-and-encode passes before a single byte was uploaded — the student watching a
   * still screen while the phone did the most expensive local work it will do. Now each page is
   * downscaled inside its own pipeline step (H12), so page two's encode happens while page one
   * is being read.
   *
   * The downscaled blobs are RETAINED as they're produced, so "read it again from scratch" (P41)
   * doesn't need the student to find the photo a second time — and so the re-read hashes to the
   * same key, which is what makes it overwrite the cache rather than orphan it.
   */
  const startCapture = useCallback(
    async (files: File[], opts: { piiAcknowledged: boolean }) => {
      if (files.length === 0) return;
      setState({ stage: "uploading", progress: { current: 1, total: files.length } });
      const kept: DownscaleResult[] = [];
      lastRun.current = { pages: kept, piiAcknowledged: opts.piiAcknowledged };
      await runCapture(
        files.map((file) => ({
          get: async () => {
            const page = await downscaleForUpload(file);
            kept.push(page);
            return page;
          },
        })),
        opts,
      );
    },
    [runCapture],
  );

  /** Ignore the cached parse and read the page again with the models (P41). */
  const rerunFromScratch = useCallback(async () => {
    const last = lastRun.current;
    if (!last) return;
    await runCapture(
      // Already downscaled — the same bytes, so the same key and the same cache entry.
      last.pages.map((page) => ({ get: async () => page })),
      { piiAcknowledged: last.piiAcknowledged, refresh: true },
    );
  }, [runCapture]);

  /**
   * File a block into the student's real records (P4), and reflect the result in state.
   *
   * Errors are returned rather than thrown: "pick a proficiency first" is a normal thing for
   * the UI to say next to the block, not an exception for it to catch.
   */
  /** Store a drawing's still-pending sub-blocks inside it (P45), returning updated rows. */
  const absorbRest = useCallback(
    async (parent: NoteBlock, blocks: NoteBlock[]): Promise<Map<string, NoteBlock>> => {
      const pendingSubs = subBlocksOf(parent, blocks).filter((b) => b.status === "PENDING");
      const absorbed = await absorbSubBlocks(repo, pendingSubs);
      return new Map(absorbed.map((b) => [b.id, b]));
    },
    [repo],
  );

  const allocate = useCallback(
    async (
      blockId: string,
      opts: Omit<AllocateInput, "block"> & { absorbRest?: boolean } = {},
    ): Promise<{ ok: true; label: string } | { ok: false; message: string }> => {
      const block = state.blocks?.find((b) => b.id === blockId);
      if (!block) return { ok: false, message: "That block is no longer here." };
      const { absorbRest: wantAbsorb, ...allocateOpts } = opts;
      try {
        const res = await allocateBlock(repo, userId, {
          block,
          shiftFallbackId: state.capture?.shiftId,
          shiftFallbackShift: state.shift?.candidates.find(
            (c) => c.shift.id === state.capture?.shiftId,
          )?.shift,
          ...allocateOpts,
        });
        // Filing a drawing whole means its remaining notes ride with it (P45) —
        // absorbed, not filed twice.
        const absorbed =
          wantAbsorb && block.kind === "DIAGRAM"
            ? await absorbRest(block, state.blocks ?? [])
            : new Map<string, NoteBlock>();
        setState((s) => ({
          ...s,
          blocks: (s.blocks ?? []).map((b) =>
            b.id === blockId ? res.block : (absorbed.get(b.id) ?? b),
          ),
        }));
        return { ok: true, label: res.created.label };
      } catch (err) {
        if (err instanceof AllocateError) return { ok: false, message: err.message };
        return { ok: false, message: "Couldn't file that. Try again." };
      }
    },
    [repo, userId, state.blocks, state.capture, state.shift, absorbRest],
  );

  /** Keep a DIAGRAM block with its page (P43) — no row is created, the photo is the record. */
  const keep = useCallback(
    async (blockId: string, opts: { absorbRest?: boolean } = {}) => {
      const block = state.blocks?.find((b) => b.id === blockId);
      if (!block) return;
      const updated = await keepBlock(repo, block);
      const absorbed = opts.absorbRest
        ? await absorbRest(block, state.blocks ?? [])
        : new Map<string, NoteBlock>();
      setState((s) => ({
        ...s,
        blocks: (s.blocks ?? []).map((b) =>
          b.id === blockId ? updated : (absorbed.get(b.id) ?? b),
        ),
      }));
    },
    [repo, state.blocks, absorbRest],
  );

  /** Reverse an allocation (P19). The warning is shown when text couldn't be cleanly removed.
   *  Undoing a DRAWING also restores the sub-blocks it had absorbed (P45) — they were only
   *  stored inside it on the strength of the filing being undone. */
  const unallocate = useCallback(
    async (blockId: string): Promise<{ warning?: string }> => {
      const block = state.blocks?.find((b) => b.id === blockId);
      if (!block) return {};
      const res = await unallocateBlock(repo, block);
      const restored =
        block.kind === "DIAGRAM"
          ? new Map(
              (
                await restoreSubBlocks(
                  repo,
                  subBlocksOf(block, state.blocks ?? []).filter((b) => b.status === "ABSORBED"),
                )
              ).map((b) => [b.id, b]),
            )
          : new Map<string, NoteBlock>();
      setState((s) => ({
        ...s,
        blocks: (s.blocks ?? []).map((b) =>
          b.id === blockId ? res.block : (restored.get(b.id) ?? b),
        ),
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
    resumeInterrupted,
    ensurePageImage,
    reset,
    selectShift,
    allocate,
    keep,
    unallocate,
    editBlock,
    dismissBlock,
    createMedication,
  };
}
