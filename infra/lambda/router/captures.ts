import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
 * 2. **The key is derived, never accepted.** `sub` comes from the verified JWT and
 *    `captureId` is regex-checked, so a caller cannot smuggle `../` or another user's id
 *    into the object key. A presigned URL carries the signer's permissions, so a
 *    client-controlled key would be a cross-user write.
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

export interface PresignRequest {
  captureId: string;
  imageIndex: number;
  contentType: string;
  bytes: number;
}

export type PresignResult =
  | {
      ok: true;
      key: string;
      url: string;
      expiresInSeconds: number;
      /** Photos left today AFTER this one. */
      remaining: number;
    }
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

export function captureKey(sub: string, captureId: string, imageIndex: number, ext: string): string {
  return `${userPrefix(sub)}${captureId}/${imageIndex}.${ext}`;
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

  return { captureId, imageIndex, contentType, bytes };
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
}

/**
 * Count the photo against today's cap, then — only if allowed — sign a single-object PUT.
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

  const ai = new AiStore({ doc: deps.doc, tableName: deps.tableName, sub });
  const count = await ai.countPhoto(DAILY_PHOTO_LIMIT);
  if (!count.allowed) {
    return { ok: false, reason: "CAP", remaining: 0, resetsAt: count.resetsAt };
  }

  const ext = req.contentType === "image/png" ? "png" : "jpg";
  const key = captureKey(sub, req.captureId, req.imageIndex, ext);
  const s3 = deps.s3 ?? new S3Client({});
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
