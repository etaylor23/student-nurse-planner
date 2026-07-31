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
}

export class CaptureUploadError extends Error {
  constructor(
    readonly code: "presign_failed" | "upload_failed",
    message: string,
  ) {
    super(message);
    this.name = "CaptureUploadError";
  }
}

export class CaptureClient {
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CaptureClientOptions) {
    this.apiBase = opts.apiBase;
    this.getIdToken = opts.getIdToken;
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
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
      throw new CaptureUploadError("upload_failed", `S3 upload failed (${res.status})`);
    }
  }

  /** Fetch a cached parse. No auth header — the presigned GET is the authorisation. */
  async fetchCachedParse(parseUrl: string, signal?: AbortSignal): Promise<unknown> {
    const res = await this.fetchImpl(parseUrl, { signal });
    if (!res.ok) throw new CaptureUploadError("upload_failed", `cache read failed (${res.status})`);
    return res.json();
  }

  /**
   * presign + upload as one step. Three possible outcomes: a cache hit (nothing uploaded, the
   * previous parse returned), a fresh upload, or the daily cap.
   */
  async uploadPhoto(input: {
    captureId: string;
    imageIndex: number;
    blob: Blob;
    contentType: string;
    signal?: AbortSignal;
    /** Skip the cache and read the page again from scratch (P41). */
    refresh?: boolean;
  }): Promise<UploadResult> {
    const imageHash = await hashBlob(input.blob);
    const presigned = await this.presign({
      captureId: input.captureId,
      imageIndex: input.imageIndex,
      contentType: input.contentType,
      bytes: input.blob.size,
      imageHash,
      refresh: input.refresh,
    });
    if (!presigned.ok) return presigned;
    if (presigned.cached) {
      const parse = await this.fetchCachedParse(presigned.parseUrl, input.signal);
      return { ok: true, cached: true, key: presigned.key, parse, parsedAt: presigned.parsedAt };
    }
    await this.upload(presigned.url, input.blob, input.contentType, input.signal);
    return { ok: true, key: presigned.key, remaining: presigned.remaining };
  }
}
