import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { makeAuthorize } from "../../../src/data/dynamo/authorize";
import { verifyCaller } from "../ai/auth";
import { UpstreamError } from "../ai/provider";
import { type StudentContext, classify } from "./classify";
import { disputedWords, mapDisputesToBlocks } from "./consensus";
import { normaliseBbox } from "./schema";
import { sanitise } from "./sanitise";
import { readPage } from "./vision";

/**
 * `POST /parse` — note-capture photo parsing (spec-note-capture.md P12).
 *
 * Four model calls: two vision in parallel (P21), then sanitise (P24), then classify (P27).
 * Sanitise must precede classify because matching depends on correct terms —
 * `Phenoxyethylpenicillin` matches no proficiency and no medication card.
 *
 * **No table access at all, not even read** (P32). The student's context — medication card
 * names, tag labels, placement — arrives in the request body, because the app is local-first
 * and already holds it in Dexie. That keeps this function's IAM to Bedrock and one S3 prefix.
 *
 * Phase 2 returns ONE JSON response. P40 specifies a staged response (text at ~20s,
 * classification at ~28s) for the review screen; that is a Phase 4 change to this handler's
 * response shape, deliberately deferred so Gate 2 can prove the pipeline with a terminal
 * script and no UI.
 */

const USER_POOL_ID = process.env.USER_POOL_ID as string;
const CAPTURE_BUCKET = process.env.CAPTURE_BUCKET as string;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const s3 = new S3Client({});
const authorize = makeAuthorize({
  client: new VerifiedPermissionsClient({}),
  policyStoreId: process.env.POLICY_STORE_ID as string,
});

/** Ids we generate — anything else is rejected rather than sanitised (cross-user keys). */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

interface ParseRequest {
  captureId: string;
  imageKey: string;
  imageIndex: number;
  context?: StudentContext;
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function parseBody(event: APIGatewayProxyEventV2): ParseRequest | null {
  if (!event.body) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
  } catch {
    return null;
  }
  const o = (raw ?? {}) as Record<string, unknown>;
  const captureId = typeof o.captureId === "string" ? o.captureId : "";
  const imageKey = typeof o.imageKey === "string" ? o.imageKey : "";
  const imageIndex = typeof o.imageIndex === "number" ? o.imageIndex : 0;
  if (!SAFE_ID.test(captureId) || !imageKey) return null;
  return { captureId, imageKey, imageIndex, context: (o.context ?? {}) as StudentContext };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext?.http?.method !== "POST") return json(405, { error: "method_not_allowed" });

  const caller = await verifyCaller(event.headers as Record<string, string | undefined>);
  if (!caller) return json(401, { error: "unauthorised" });

  const req = parseBody(event);
  if (!req) return json(400, { error: "bad_request" });

  // The key must sit under the caller's own prefix. The presign derives keys server-side,
  // so a key outside it can only come from a caller trying to read someone else's photo.
  const prefix = `u/${caller.sub}/`;
  if (!req.imageKey.startsWith(prefix)) return json(403, { error: "forbidden_key" });

  const ok = await authorize({
    identityToken: caller.identityToken,
    action: "List",
    tier: "SensitiveRecord",
    resourceId: "scope:note-capture",
    ownerId: `${USER_POOL_ID}|${caller.sub}`,
  });
  if (!ok) return json(403, { error: "forbidden" });

  // ---- fetch the photo ----
  let imageBase64: string;
  let contentType: string;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: CAPTURE_BUCKET, Key: req.imageKey }));
    if ((obj.ContentLength ?? 0) > MAX_IMAGE_BYTES) return json(413, { error: "image_too_large" });
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return json(404, { error: "image_not_found" });
    imageBase64 = Buffer.from(bytes).toString("base64");
    contentType = obj.ContentType ?? "image/jpeg";
  } catch (err) {
    console.warn("could not read capture object", err);
    return json(404, { error: "image_not_found" });
  }

  const startedAt = Date.now();
  try {
    // ---- 1 + 2: the vision pair, in parallel ----
    const { structure, check } = await readPage(imageBase64, contentType);
    if (!structure.parsed) {
      // The only failure that fails the parse — there is nothing to show without it.
      return json(502, { error: "parse_failed", detail: "structure model returned no usable JSON" });
    }
    const regions = structure.parsed.blocks.map((b) => b.rawText);
    const pageText = structure.pageText;

    // ---- 3: sanitise ----
    const cleaned = await sanitise(pageText);

    // ---- consensus over the two whole-page transcriptions (P23) ----
    // Against the SANITISED text, so a word the sanitiser already fixed isn't also raised as
    // a dispute — that would ask the student to confirm something already resolved.
    const disputes = check?.pageText ? disputedWords(cleaned.text, check.pageText) : [];
    const checkMissing = !check?.parsed;

    // ---- 4: classify ----
    const classified = await classify(cleaned.text, regions, req.context ?? {});

    // Degraded path (P27): no classifier output → fall back to the vision regions as
    // UNKNOWN blocks so the student can route them by hand. Still a transcription tool.
    const blocks =
      classified.blocks.length > 0
        ? classified.blocks
        : structure.parsed.blocks.map((b, i) => ({
            fromRegions: [i],
            text: b.rawText,
            kind: "UNKNOWN" as const,
            candidateCodes: [] as string[],
            tags: [] as string[],
          }));

    const disputeMap = mapDisputesToBlocks(blocks, disputes);

    return json(200, {
      captureId: req.captureId,
      imageIndex: req.imageIndex,
      pageDateRaw: structure.parsed.pageDateRaw ?? null,
      wardHint: structure.parsed.wardHint ?? null,
      blocks: blocks.map((b, i) => {
        // Geometry comes from the FIRST vision region the block drew from. A semantic block
        // may span several (P26), so this is the anchor for the review overlay, not a tight
        // box — and geometry plays no part in classification at all.
        const region = structure.parsed?.blocks[b.fromRegions?.[0] ?? i];
        return {
          ...b,
          bbox: normaliseBbox(region?.bbox),
          rotationDeg: region?.rotationDeg ?? 0,
          confidence: region?.confidence ?? 0,
          disputedWords: (disputeMap.get(i) ?? []).map((d) => `${d.structure}|${d.check}`),
        };
      }),
      corrections: cleaned.corrections.map((c) => `${c.from}|${c.to}`),
      // Everything a Gate-2 eyeball (and later, metrics) needs to judge the run.
      diagnostics: {
        totalMs: Date.now() - startedAt,
        structure: { model: structure.model, ms: structure.latencyMs, in: structure.inputTokens, out: structure.outputTokens },
        check: check ? { model: check.model, ms: check.latencyMs, missing: checkMissing } : { missing: true },
        sanitiser: { ms: cleaned.latencyMs, failed: cleaned.failed, applied: cleaned.corrections.length, rejected: cleaned.rejected.length },
        classifier: { ms: classified.latencyMs, failed: classified.failed, droppedBlocks: classified.droppedBlocks, droppedCodes: classified.droppedCodes },
        disputes: disputes.length,
      },
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      return json(err.throttled ? 429 : 502, {
        error: err.throttled ? "throttled" : "upstream",
        detail: err.message.slice(0, 300),
      });
    }
    console.error("parse failed", err);
    return json(500, { error: "internal" });
  }
};
