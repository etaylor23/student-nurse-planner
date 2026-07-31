import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AiStore, type AiStoreOptions } from "../../../src/data/dynamo/aiStore";

/**
 * Presigned uploads for note-capture photos (spec-note-capture.md P1/P17).
 *
 * The browser uploads **direct to S3** — the photo never passes through a Lambda, which
 * keeps a ~700 KB body off the RPC path and out of CloudWatch. This module's only job is
 * to decide *whether* an upload is allowed and to hand back a narrowly scoped URL.
 *
 * Two things here are load-bearing:
 *
 * 1. **The cap gates the presign** (P17). Counting after issuing the URL would leave
 *    uploads unbounded while parsing was capped — the bucket, not the model, would be the
 *    thing being abused. So `countPhoto` runs first and a cap hit returns without signing.
 *
 * 2. **The key is derived, never accepted.** `sub` comes from the verified JWT and the
 *    image hash is regex-checked as 64 hex characters, so a caller cannot smuggle `../` or
 *    another user's id into the object key. A presigned URL carries the signer's
 *    permissions, so a client-controlled key would be a cross-user write.
 *
 * Storage is **content-addressed** (P41): the key is the SHA-256 of the downscaled bytes, and
 * the finished parse is written alongside the photo as `parse.json`. So re-uploading a page
 * this student has already read lands on the same prefix, and this function hands back the
 * previous result instead of a PUT URL. That skips ~70 seconds and four model calls, and —
 * deliberately — does not touch the daily cap: nothing was uploaded and no model ran.
 */

/** Cap: photos per user per day (P17). Counts photos, not the four model calls each costs. */
export const DAILY_PHOTO_LIMIT = 10;

/** Max photos in one capture — a capture is a notebook session, not a single page (P20). */
export const MAX_IMAGES_PER_CAPTURE = 10;

/** Upload ceiling. The client downscales to 2400px/q85 (~700 KB); this is generous headroom
 *  for an unexpectedly detailed page without allowing an arbitrary file. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** How long the signed URL stays usable. Long enough for a slow ward connection to finish. */
export const PRESIGN_EXPIRY_SECONDS = 5 * 60;

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png"]);

/** Ids we generate: uuid-ish. Anything else is rejected rather than sanitised. */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

/** SHA-256, lowercase hex. Fixed length and charset, so it can't escape the prefix. */
const SAFE_HASH = /^[a-f0-9]{64}$/;

/** The cached parse, written by parseFn next to the photo it came from. */
export const PARSE_CACHE_FILE = "parse.json";

export interface PresignRequest {
  captureId: string;
  imageIndex: number;
  contentType: string;
  bytes: number;
  /** SHA-256 of the downscaled bytes — the page's identity (P41). */
  imageHash: string;
  /** Set to ignore an existing cached parse and read the page again from scratch. */
  refresh?: boolean;
}

export type PresignResult =
  | {
      ok: true;
      /** Present on both arms so the discriminant narrows either way. */
      cached?: false;
      key: string;
      url: string;
      expiresInSeconds: number;
      /** Photos left today AFTER this one. */
      remaining: number;
    }
  /** This page has been read before (P41). No upload, no model calls, no cap — just the
   *  previous result, fetched straight from S3 with a short-lived GET. */
  | { ok: true; cached: true; key: string; parseUrl: string; parsedAt?: string }
  /** The cap is an expected outcome, not an error — the client shows a friendly message
   *  rather than a failure (matching how the ask endpoint treats its `CAP` frame). */
  | { ok: false; reason: "CAP"; remaining: 0; resetsAt: string };

export class PresignError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "PresignError";
  }
}

/** The user's key prefix. GDPR erasure deletes exactly this (see scripts/delete-user.ts). */
export function userPrefix(sub: string): string {
  return `u/${sub}/`;
}

/**
 * Where one page lives. Content-addressed (P41), so the same photo always lands in the same
 * place and its cached parse is a sibling of the image rather than a separate index to keep
 * in step. `captureId` is deliberately NOT in the path: a page's identity is its bytes, not
 * the session that happened to upload it.
 */
export function pagePrefix(sub: string, imageHash: string): string {
  return `${userPrefix(sub)}h/${imageHash}/`;
}

export function captureKey(sub: string, imageHash: string, ext: string): string {
  return `${pagePrefix(sub, imageHash)}page.${ext}`;
}

export function parseCacheKey(sub: string, imageHash: string): string {
  return `${pagePrefix(sub, imageHash)}${PARSE_CACHE_FILE}`;
}

function parseRequest(raw: unknown): PresignRequest {
  const o = (raw ?? {}) as Record<string, unknown>;
  const captureId = typeof o.captureId === "string" ? o.captureId : "";
  if (!SAFE_ID.test(captureId)) throw new PresignError("bad_capture_id");

  const imageIndex = typeof o.imageIndex === "number" ? o.imageIndex : NaN;
  if (!Number.isInteger(imageIndex) || imageIndex < 0 || imageIndex >= MAX_IMAGES_PER_CAPTURE) {
    throw new PresignError("bad_image_index");
  }

  const contentType = typeof o.contentType === "string" ? o.contentType : "";
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new PresignError("bad_content_type");

  const bytes = typeof o.bytes === "number" ? o.bytes : NaN;
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_UPLOAD_BYTES) {
    throw new PresignError("bad_size");
  }

  const imageHash = typeof o.imageHash === "string" ? o.imageHash.toLowerCase() : "";
  if (!SAFE_HASH.test(imageHash)) throw new PresignError("bad_image_hash");

  return { captureId, imageIndex, contentType, bytes, imageHash, refresh: o.refresh === true };
}

export interface PresignDeps {
  /**
   * Typed via `AiStoreOptions` rather than importing `DynamoDBDocumentClient` directly:
   * `@aws-sdk/lib-dynamodb` is installed at BOTH the repo root and in `infra/`, so the
   * two same-named classes are structurally incompatible (private `handlers`). Deriving
   * the type from the consumer keeps this module aligned with whichever copy `src/` uses.
   */
  doc: AiStoreOptions["doc"];
  tableName: string;
  bucket: string;
  s3?: S3Client;
  /**
   * Look up the cached parse's timestamp, or `null` for a miss. Injectable so the tests can
   * exercise both branches offline — signing is a local computation, but `HeadObject` is a
   * network call, and a unit test should not need one.
   */
  headParseCache?: (key: string) => Promise<Date | null>;
}

/**
 * Serve a cached parse if this page has been read before, otherwise count it against today's
 * cap and — only if allowed — sign a single-object PUT.
 *
 * The cache check comes FIRST and before the cap, on purpose: a cache hit uploads nothing and
 * runs no models, so charging it against a 10-a-day limit would be charging for work that
 * didn't happen. It also means re-opening a page you have already read always works, even on
 * a day you have used up.
 *
 * `ContentType` and `ContentLength` are signed, so the URL is usable for exactly the
 * upload that was authorised: a client cannot reuse it to put a 2 GB file, a different
 * media type, or a different key.
 */
export async function presignCapture(
  deps: PresignDeps,
  sub: string,
  raw: unknown,
): Promise<PresignResult> {
  const req = parseRequest(raw);
  const ext = req.contentType === "image/png" ? "png" : "jpg";
  const key = captureKey(sub, req.imageHash, ext);
  const s3 = deps.s3 ?? new S3Client({});

  if (!req.refresh) {
    const cached = await cachedParse(deps, s3, sub, req.imageHash);
    if (cached) return { ok: true, cached: true, key, ...cached };
  }

  const ai = new AiStore({ doc: deps.doc, tableName: deps.tableName, sub });
  const count = await ai.countPhoto(DAILY_PHOTO_LIMIT);
  if (!count.allowed) {
    return { ok: false, reason: "CAP", remaining: 0, resetsAt: count.resetsAt };
  }

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: deps.bucket,
      Key: key,
      ContentType: req.contentType,
      ContentLength: req.bytes,
    }),
    {
      expiresIn: PRESIGN_EXPIRY_SECONDS,
      // `signableHeaders` is required for content-type: the presigner signs
      // `content-length` and `host` by default and leaves `content-type` UNSIGNED, so
      // without this a caller could PUT a PDF (or anything else) to a `.jpg` key. Adding
      // it makes S3 reject any upload whose type differs from the one authorised.
      signableHeaders: new Set(["content-length", "content-type"]),
    },
  );

  return { ok: true, key, url, expiresInSeconds: PRESIGN_EXPIRY_SECONDS, remaining: count.remaining };
}

/**
 * Is there a finished parse for this page? Returns a short-lived GET URL if so.
 *
 * A missing object is the normal case, not an error — `HeadObject` 404s and we sign a PUT
 * instead. Any OTHER failure is also swallowed to a miss: a cache that can't be read should
 * cost a re-parse, never a broken upload.
 */
async function cachedParse(
  deps: PresignDeps,
  s3: S3Client,
  sub: string,
  imageHash: string,
): Promise<{ parseUrl: string; parsedAt?: string } | null> {
  const cacheKey = parseCacheKey(sub, imageHash);
  const head =
    deps.headParseCache ??
    (async (key: string) => {
      const res = await s3.send(new HeadObjectCommand({ Bucket: deps.bucket, Key: key }));
      return res.LastModified ?? null;
    });
  try {
    const parsedAt = await head(cacheKey);
    if (parsedAt === null || parsedAt === undefined) return null;
    const parseUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: deps.bucket, Key: cacheKey }),
      { expiresIn: PRESIGN_EXPIRY_SECONDS },
    );
    return { parseUrl, parsedAt: parsedAt.toISOString() };
  } catch {
    return null;
  }
}
