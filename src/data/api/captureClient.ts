import { type RetryNotice, type RetryOptions, withRetry } from "./retry";

/**
 * Client for note-capture photo uploads (spec-note-capture.md P1/P17).
 *
 * Two hops, and the split matters:
 *  1. `notes/presignCapture` over the ordinary `/api/rpc` router — inherits the existing
 *     Cognito authorizer and AVP gate, counts the photo against the daily cap, and returns
 *     a narrowly scoped URL.
 *  2. A direct `PUT` to S3 with that URL. The bytes never touch a Lambda, so a ~700 KB
 *     photo doesn't ride through the RPC path or into CloudWatch.
 *
 * The upload URL is signed for one specific key, content type and length (P1), so this
 * client must send exactly what it asked to send — hence `contentType`/`bytes` are taken
 * from the downscaled blob rather than the original file.
 *
 * **Both hops retry** (hardening H7): three goes each, backing off ~1s/3s/9s on a network
 * error, a 5xx or a 429 — never on another 4xx, which is a refusal the server means. An
 * expired signature (403) is the one failure answered by asking again rather than repeating:
 * the URL is re-requested and the PUT retried once with the new one.
 */

export interface PresignAllowed {
  ok: true;
  cached?: false;
  key: string;
  url: string;
  expiresInSeconds: number;
  /** Photos left today after this one — drives the "2 photos left" hint. */
  remaining: number;
}

/** This page has been read before (P41): the previous parse is one GET away. */
export interface PresignCached {
  ok: true;
  cached: true;
  key: string;
  parseUrl: string;
  parsedAt?: string;
}

export interface PresignCapped {
  ok: false;
  reason: "CAP";
  remaining: 0;
  /** ISO timestamp the counter rolls over. */
  resetsAt: string;
}

export type PresignResponse = PresignAllowed | PresignCached | PresignCapped;

/** `cached` is the discriminant, present on both arms so narrowing works either way. */
export type UploadResult =
  | { ok: true; cached?: false; key: string; remaining: number }
  | { ok: true; cached: true; key: string; parse: unknown; parsedAt?: string }
  | PresignCapped;

/**
 * SHA-256 of the bytes about to be uploaded — the page's identity (P41).
 *
 * `crypto.subtle` needs a secure context, which localhost and https both are. Hashing the
 * DOWNSCALED blob rather than the original file is deliberate: two shots of the same page
 * differ byte-for-byte, but the thing we key the cache on has to be exactly what the models
 * were given, or a "hit" could serve a parse of a different image.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface CaptureClientOptions {
  /** RPC base, e.g. "/api" — mirrors ApiRepository. */
  apiBase: string;
  getIdToken: () => Promise<string>;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Retry cadence (H7). Injectable so tests don't wait out a real ~13s backoff. */
  retry?: Pick<RetryOptions, "attempts" | "sleep" | "jitter">;
}

export class CaptureUploadError extends Error {
  constructor(
    readonly code: "presign_failed" | "upload_failed",
    message: string,
    /** The HTTP status this came from, when there was one — how `isTransient` (H7) tells a
     *  dropped connection from a refusal. Absent means the request never got an answer. */
    readonly status?: number,
  ) {
    super(message);
    this.name = "CaptureUploadError";
  }
}

/** Which hop is being retried, so the progress UI can say something true (H7). */
export type UploadStep = "presign" | "upload" | "cache";
export type UploadRetryNotice = RetryNotice & { step: UploadStep };

export class CaptureClient {
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly retryOpts: Pick<RetryOptions, "attempts" | "sleep" | "jitter">;

  constructor(opts: CaptureClientOptions) {
    this.apiBase = opts.apiBase;
    this.getIdToken = opts.getIdToken;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.retryOpts = opts.retry ?? {};
  }

  /** Ask the server for permission + a signed URL. A cap hit is a normal response, not a throw. */
  async presign(input: {
    captureId: string;
    imageIndex: number;
    contentType: string;
    bytes: number;
    imageHash: string;
    refresh?: boolean;
  }): Promise<PresignResponse> {
    const token = await this.getIdToken();
    const res = await this.fetchImpl(`${this.apiBase}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method: "notes/presignCapture", args: [input] }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: PresignResponse;
      error?: string;
      detail?: string;
    };
    if (!res.ok || !data.result) {
      throw new CaptureUploadError(
        "presign_failed",
        data.detail || data.error || `presign failed (${res.status})`,
        res.status,
      );
    }
    return data.result;
  }

  /**
   * PUT the blob to the signed URL. No auth header — the signature IS the authorisation,
   * and adding one would change the signed header set and be rejected.
   */
  async upload(url: string, blob: Blob, contentType: string, signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(url, {
      method: "PUT",
      headers: { "content-type": contentType },
      body: blob,
      signal,
    });
    if (!res.ok) {
      // A 403 here usually means the signature no longer matches: an expired URL, or a
      // content type/length that drifted from what was presigned.
      throw new CaptureUploadError("upload_failed", `S3 upload failed (${res.status})`, res.status);
    }
  }

  /**
   * A signed GET for a page already uploaded, so review can show it beside the blocks (P1).
   *
   * Returns `undefined` rather than throwing on any failure. The photo pane is an
   * enhancement — `PagePreview` renders nothing without a URL and the cards are unaffected —
   * so a presign that fails must never take the review screen down with it.
   */
  async presignPageImage(imageKey: string): Promise<string | undefined> {
    try {
      const token = await this.getIdToken();
      const res = await this.fetchImpl(`${this.apiBase}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: "notes/presignPageImage", args: [{ imageKey }] }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: { url?: string } };
      return res.ok ? data.result?.url : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * The finished parse for a page already in S3, by key — for resuming an interrupted
   * capture (H9). Returns `undefined` when there isn't one, which is a normal answer: the
   * page then needs a real read.
   *
   * Never throws, for the same reason `presignPageImage` doesn't: recovery is a best-effort
   * improvement on re-reading the page, so a failure here should cost a read, not the resume.
   */
  async cachedParseFor(
    imageKey: string,
    signal?: AbortSignal,
  ): Promise<{ parse: unknown; parsedAt?: string } | undefined> {
    try {
      const token = await this.getIdToken();
      const res = await this.fetchImpl(`${this.apiBase}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ method: "notes/cachedParse", args: [{ imageKey }] }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        result?: { parseUrl?: string; parsedAt?: string } | null;
      };
      if (!res.ok || !data.result?.parseUrl) return undefined;
      const parse = await this.fetchCachedParse(data.result.parseUrl, signal);
      return { parse, parsedAt: data.result.parsedAt };
    } catch {
      return undefined;
    }
  }

  /** Fetch a cached parse. No auth header — the presigned GET is the authorisation. */
  async fetchCachedParse(parseUrl: string, signal?: AbortSignal): Promise<unknown> {
    const res = await this.fetchImpl(parseUrl, { signal });
    if (!res.ok) {
      throw new CaptureUploadError(
        "upload_failed",
        `cache read failed (${res.status})`,
        res.status,
      );
    }
    return res.json();
  }

  /**
   * presign + upload as one step. Three possible outcomes: a cache hit (nothing uploaded, the
   * previous parse returned), a fresh upload, or the daily cap.
   *
   * Each hop retries on its own (H7): a presign that never answered is asked again, and a PUT
   * that failed transiently is repeated with the same signed URL, which is still valid because
   * the retries fit well inside `PRESIGN_EXPIRY_SECONDS`. Re-asking for the URL doesn't spend
   * a second photo from the daily cap — the server claims the count once per page per day.
   */
  async uploadPhoto(input: {
    captureId: string;
    imageIndex: number;
    blob: Blob;
    contentType: string;
    signal?: AbortSignal;
    /** Skip the cache and read the page again from scratch (P41). */
    refresh?: boolean;
    /** Told before each backoff, so the student sees "trying again" rather than a hang. */
    onRetry?: (notice: UploadRetryNotice) => void;
  }): Promise<UploadResult> {
    const imageHash = await hashBlob(input.blob);
    const retry = (step: UploadStep) => ({
      ...this.retryOpts,
      onRetry: (n: RetryNotice) => input.onRetry?.({ ...n, step }),
    });
    const ask = () =>
      withRetry(
        () =>
          this.presign({
            captureId: input.captureId,
            imageIndex: input.imageIndex,
            contentType: input.contentType,
            bytes: input.blob.size,
            imageHash,
            refresh: input.refresh,
          }),
        retry("presign"),
      );

    const presigned = await ask();
    if (!presigned.ok) return presigned;
    if (presigned.cached) {
      const parse = await withRetry(
        () => this.fetchCachedParse(presigned.parseUrl, input.signal),
        retry("cache"),
      );
      return { ok: true, cached: true, key: presigned.key, parse, parsedAt: presigned.parsedAt };
    }

    const put = (url: string) =>
      withRetry(
        () => this.upload(url, input.blob, input.contentType, input.signal),
        retry("upload"),
      );
    try {
      await put(presigned.url);
    } catch (err) {
      // A signature S3 won't accept cannot be fixed by sending it again — ask for a new URL
      // and use that. Once: a second 403 is a real mismatch, not a stale URL.
      if (!(err instanceof CaptureUploadError) || err.status !== 403) throw err;
      const again = await ask();
      if (!again.ok) return again;
      if (again.cached) {
        const parse = await withRetry(
          () => this.fetchCachedParse(again.parseUrl, input.signal),
          retry("cache"),
        );
        return { ok: true, cached: true, key: again.key, parse, parsedAt: again.parsedAt };
      }
      await put(again.url);
      return { ok: true, key: again.key, remaining: again.remaining };
    }
    return { ok: true, key: presigned.key, remaining: presigned.remaining };
  }
}
