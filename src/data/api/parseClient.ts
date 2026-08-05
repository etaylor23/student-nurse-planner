/**
 * Client for the note-capture parse endpoint (spec-note-capture.md P12).
 *
 * Goes to a Lambda Function URL rather than `/api/rpc`: four model calls take ~70s measured,
 * far past API Gateway's 29s ceiling. Same Cognito ID token, verified in-Lambda.
 *
 * **Staged over SSE (P40).** The pipeline takes ~70s, so a single late response reads as a
 * hang. Frames arrive as each stage lands: stage markers immediately, the raw transcription
 * at ~40s, corrections when the spell-check finishes, and the classified blocks at ~70s. The
 * student sees their own words long before the filing suggestions.
 *
 * `fetch` + a body reader rather than `EventSource`, for the same reason the ask stream does
 * it: EventSource cannot send an Authorization header or use POST.
 */

import { type RetryNotice, type RetryOptions, withRetry } from "./retry";

export interface ParsedBlockView {
  fromRegions: number[];
  text: string;
  kind: string;
  groupKey?: string;
  targetType?: string;
  candidateCodes: string[];
  tags: string[];
  medicationCandidate?: string;
  gibbs?: Record<string, string>;
  /** DIAGRAM blocks only (P44): guarded Mermaid source rebuilding the drawing. */
  diagramSource?: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  rotationDeg: number;
  /** Self-reported. Stored for observability, gates nothing (P22). */
  confidence: number;
  /** `structureReading|checkReading` pairs the two vision models disagreed on (P22). */
  disputedWords: string[];
}

export interface ParseResponse {
  captureId: string;
  imageIndex: number;
  /** Exactly as written on the page — the app resolves the year (P8). */
  pageDateRaw: string | null;
  wardHint: string | null;
  blocks: ParsedBlockView[];
  /** `from|to` pairs the sanitiser applied (P24). */
  corrections: string[];
  diagnostics?: Record<string, unknown>;
}

/** Frames the endpoint emits, in the order they arrive. */
export interface ParseHandlers {
  /** A human-readable "what's happening now", so the wait is never blank. */
  onStage(stage: string, message: string): void;
  /** The verbatim transcription — earliest thing worth showing the student. */
  onTranscribed(payload: {
    pageText: string;
    regions: string[];
    pageDateRaw: string | null;
    wardHint: string | null;
  }): void;
  /** Only fires when the spell-check actually changed something. */
  onCorrected(payload: { text: string; corrections: string[] }): void;
  onBlocks(payload: ParseResponse): void;
  onDone(payload: { diagnostics?: Record<string, unknown> }): void;
  onError(code: string, message: string): void;
}

export class ParseError extends Error {
  constructor(
    readonly code: "unauthorised" | "not_found" | "throttled" | "capped" | "failed",
    message: string,
    /** The status it came from, so `isTransient` (H7) can tell a 503 from a refusal. */
    readonly status?: number,
    /** `capped` only: UTC midnight the parse counter rolls over (H8). */
    readonly resetsAt?: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export interface ParseClientOptions {
  parseUrl: string;
  getIdToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  /** Retry cadence (H7). Injectable so tests don't wait out a real ~13s backoff. */
  retry?: Pick<RetryOptions, "attempts" | "sleep" | "jitter">;
}

/** What the client tells the server about the student, so parseFn needs no table access (P32). */
export interface ParseContext {
  medicationNames?: string[];
  tagLabels?: string[];
  placementName?: string;
  placementSetting?: string;
}

export class ParseClient {
  private readonly parseUrl: string;
  private readonly getIdToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly retryOpts: Pick<RetryOptions, "attempts" | "sleep" | "jitter">;

  constructor(opts: ParseClientOptions) {
    this.parseUrl = opts.parseUrl.replace(/\/$/, "");
    this.getIdToken = opts.getIdToken;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.retryOpts = opts.retry ?? {};
  }

  /**
   * Run one page through the pipeline, forwarding each frame as it lands.
   *
   * Retries (H7) cover the request that never started: a network error, a 5xx or a Bedrock
   * throttle relayed as a 429, three goes at ~1s/3s/9s. Once a frame has been delivered the
   * retry stops being safe — the caller has already seen a transcription, and running the
   * pipeline again would replay stages over its own state — so a break after that point
   * surfaces as a failure with whatever arrived, which is what the per-page error path in
   * `useCapture` already handles. The daily parse cap (H8) is never retried: it is a refusal.
   */
  async parse(
    input: {
      captureId: string;
      imageKey: string;
      imageIndex: number;
      context?: ParseContext;
      signal?: AbortSignal;
      /** Told before each backoff, so the waiting screen can say "trying again". */
      onRetry?: (notice: RetryNotice) => void;
    },
    handlers: ParseHandlers,
  ): Promise<void> {
    await withRetry(() => this.attempt(input, handlers), {
      ...this.retryOpts,
      onRetry: input.onRetry,
    });
  }

  private async attempt(
    input: {
      captureId: string;
      imageKey: string;
      imageIndex: number;
      context?: ParseContext;
      signal?: AbortSignal;
    },
    handlers: ParseHandlers,
  ): Promise<void> {
    const token = await this.getIdToken();
    const res = await this.fetchImpl(this.parseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        captureId: input.captureId,
        imageKey: input.imageKey,
        imageIndex: input.imageIndex,
        context: input.context ?? {},
      }),
      signal: input.signal,
    });

    // Failures before the stream starts are still plain JSON with a real status code.
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
        resetsAt?: string;
      };
      // The daily parse cap (H8) arrives as a 429 like a throttle, but it is a refusal with a
      // rollover time — it must not be retried, so it carries no status.
      if (res.status === 429 && body.error === "CAP") {
        throw new ParseError(
          "capped",
          body.detail || "We've read as many pages as we can today.",
          undefined,
          body.resetsAt,
        );
      }
      const code =
        res.status === 401
          ? "unauthorised"
          : res.status === 404
            ? "not_found"
            : res.status === 429
              ? "throttled"
              : "failed";
      throw new ParseError(
        code,
        body.detail || body.error || `parse failed (${res.status})`,
        res.status,
      );
    }
    if (!res.body) throw new ParseError("failed", "no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    // Once a frame has reached the handlers, a later break is not retryable (see `parse`).
    let delivered = false;
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (!delivered) throw err; // nothing was forwarded — a fresh attempt is clean
        throw new ParseError("failed", err instanceof Error ? err.message : "stream ended early");
      }
      const { done, value } = chunk;
      if (done) break;
      delivered = true;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      // Frames are separated by a blank line; a partial frame stays in the buffer.
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
        const eventLine = chunk.split("\n").find((l) => l.startsWith("event:"));
        if (!dataLine) continue;
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(dataLine.slice(5).trim());
        } catch {
          continue; // tolerate keep-alives / partial frames
        }
        const event = eventLine?.slice(6).trim() ?? "";
        switch (event) {
          case "stage":
            handlers.onStage(String(payload.stage ?? ""), String(payload.message ?? ""));
            break;
          case "transcribed":
            handlers.onTranscribed(payload as never);
            break;
          case "corrected":
            handlers.onCorrected(payload as never);
            break;
          case "blocks":
            handlers.onBlocks(payload as unknown as ParseResponse);
            break;
          case "done":
            handlers.onDone(payload as never);
            break;
          case "error":
            handlers.onError(String(payload.code ?? "INTERNAL"), String(payload.message ?? ""));
            break;
        }
      }
    }
  }
}
