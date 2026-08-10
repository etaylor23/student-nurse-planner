/// <reference path="./runtime.d.ts" />
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { AiStore } from "../../../src/data/dynamo/aiStore";
import { makeAuthorize } from "../../../src/data/dynamo/authorize";
import { makeDocClient } from "../../../src/data/dynamo/dynamoClient";
import { verifyCaller } from "../ai/auth";
import { UpstreamError } from "../ai/provider";
import { type StudentContext, classify } from "./classify";
import { disputedWords, mapDisputesToBlocks } from "./consensus";
import { ensureRegionsCovered } from "./coverage";
import {
  guardMermaid,
  mergeNomination,
  synthesiseDiagramBlock,
  visionDiagramClusters,
} from "./diagram";
import { reflow } from "./reflow";
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
 * **No table READS at all** (P32). The student's context — medication card names, tag labels,
 * placement — arrives in the request body, because the app is local-first and already holds it
 * in Dexie. The one table touch is a write: a single atomic counter row for the daily
 * fresh-read cap (H8), which has to live here because this is the only place that knows a read
 * is actually about to spend four model calls. So the IAM is Bedrock, one S3 prefix, and
 * `UpdateItem`/`PutItem` on the table — still no query, scan or get.
 *
 * **Streamed, in stages (P40).** The whole pipeline takes ~70s measured, and a blank spinner
 * for that long reads as a hang. So this streams SSE and reports each stage as it lands:
 * the transcription arrives around 40s, the classified blocks around 70s, and stage markers
 * before both. The student sees their own words long before the filing suggestions.
 */

const USER_POOL_ID = process.env.USER_POOL_ID as string;
const CAPTURE_BUCKET = process.env.CAPTURE_BUCKET as string;
const TABLE_NAME = process.env.TABLE_NAME as string;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Fresh reads per user per day (hardening H8).
 *
 * Higher than the 10-photo cap on purpose: this counts a *read*, and re-reading a page from
 * scratch is a legitimate thing to do when the models got it wrong (P41), so it must not come
 * out of the photo allowance. 30 bounds the model spend on the one path where nothing else
 * did — a cache hit never arrives here at all, so it costs nothing against this.
 */
const DAILY_PARSE_LIMIT = 30;

const s3 = new S3Client({});
const doc = makeDocClient();
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

/** Non-200s stay plain JSON: nothing has been streamed yet, so there is no partial state. */
function fail(stream: ResponseStream, statusCode: number, body: unknown): void {
  const out = awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { "content-type": "application/json" },
  });
  out.write(JSON.stringify(body));
  out.end();
}

function frame(stream: ResponseStream, event: string, data: unknown): void {
  stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** A stage marker, so the UI can say what is happening rather than just spinning. */
function stage(stream: ResponseStream, name: string, detail?: Record<string, unknown>): void {
  frame(stream, "stage", { stage: name, ...detail });
}

/**
 * Cache the finished parse beside the photo it came from (P41).
 *
 * The key is content-addressed, so the same page always maps to the same prefix and this file
 * is what lets the presign hand back a previous read instead of spending ~70 seconds and four
 * model calls again. What's stored is the `blocks` payload **as first presented** — before any
 * of the student's edits, retyping or filing, since those live on their `NoteBlock` rows.
 *
 * A failure here is logged and swallowed: the student already has their parse on the stream,
 * and losing the cache costs a re-read next time, not this result.
 */
async function cacheParse(imageKey: string, payload: unknown): Promise<void> {
  const dir = imageKey.slice(0, imageKey.lastIndexOf("/") + 1);
  if (!dir) return;
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: CAPTURE_BUCKET,
        Key: `${dir}parse.json`,
        ContentType: "application/json",
        Body: JSON.stringify(payload),
      }),
    );
  } catch (err) {
    console.warn("could not cache parse", err);
  }
}

function parseBody(event: FunctionUrlEvent): ParseRequest | null {
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

async function run(event: FunctionUrlEvent, responseStream: ResponseStream): Promise<void> {
  if (event.requestContext?.http?.method !== "POST") {
    return fail(responseStream, 405, { error: "method_not_allowed" });
  }

  const caller = await verifyCaller(event.headers as Record<string, string | undefined>);
  if (!caller) return fail(responseStream, 401, { error: "unauthorised" });

  const req = parseBody(event);
  if (!req) return fail(responseStream, 400, { error: "bad_request" });

  // The key must sit under the caller's own prefix. The presign derives keys server-side,
  // so a key outside it can only come from a caller trying to read someone else's photo.
  const prefix = `u/${caller.sub}/`;
  if (!req.imageKey.startsWith(prefix)) return fail(responseStream, 403, { error: "forbidden_key" });

  const ok = await authorize({
    identityToken: caller.identityToken,
    action: "List",
    tier: "SensitiveRecord",
    resourceId: "scope:note-capture",
    ownerId: `${USER_POOL_ID}|${caller.sub}`,
  });
  if (!ok) return fail(responseStream, 403, { error: "forbidden" });

  // ---- fetch the photo ----
  let imageBase64: string;
  let contentType: string;
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: CAPTURE_BUCKET, Key: req.imageKey }));
    if ((obj.ContentLength ?? 0) > MAX_IMAGE_BYTES) {
      return fail(responseStream, 413, { error: "image_too_large" });
    }
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) return fail(responseStream, 404, { error: "image_not_found" });
    imageBase64 = Buffer.from(bytes).toString("base64");
    contentType = obj.ContentType ?? "image/jpeg";
  } catch (err) {
    console.warn("could not read capture object", err);
    return fail(responseStream, 404, { error: "image_not_found" });
  }

  // The day's fresh reads (H8) — counted HERE, with the photo in hand and the models about to
  // run, so a page that was never readable doesn't spend one. A cache hit never reaches this
  // function, so re-opening a page you have already read stays free (P41).
  //
  // Fails OPEN: this is a courtesy bound on model spend, not a security control, and a counter
  // that can't be written (a throttle, a permission that didn't land with a deploy) must not
  // be the reason a student can't read their own notes. Alarms cover the spend side.
  const ai = new AiStore({ doc, tableName: TABLE_NAME, sub: caller.sub });
  const count = await ai.countParse(DAILY_PARSE_LIMIT).catch((err) => {
    console.warn("could not count this parse against the daily cap", err);
    return { allowed: true, remaining: DAILY_PARSE_LIMIT, resetsAt: "" };
  });
  if (!count.allowed) {
    return fail(responseStream, 429, {
      error: "CAP",
      detail: "That's as many pages as we can read today — your photos are safe, back tomorrow 🌱",
      resetsAt: count.resetsAt,
    });
  }

  const startedAt = Date.now();
  // From here the response is a stream: 200 is already committed, so later failures arrive as
  // an `error` FRAME rather than an HTTP status (the same shape askFn uses).
  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
  });

  try {
    stage(out, "reading", { message: "Reading your handwriting" });

    // ---- 1 + 2: the vision pair, in parallel ----
    const { structure, check, structureRetried } = await readPage(imageBase64, contentType);
    if (!structure.parsed) {
      frame(out, "error", { code: "PARSE_FAILED", message: "Could not read that photo." });
      out.end();
      return;
    }
    const regions = structure.parsed.blocks.map((b) => b.rawText);
    const pageText = structure.pageText;

    // The student's own words, as soon as they exist — ~40s earlier than the blocks. This is
    // the whole point of streaming: they can start checking the transcription while the
    // filing suggestions are still being worked out.
    frame(out, "transcribed", {
      pageText,
      regions,
      pageDateRaw: structure.parsed.pageDateRaw ?? null,
      wardHint: structure.parsed.wardHint ?? null,
    });
    stage(out, "spellchecking", { message: "Checking drug names and clinical terms" });

    // ---- 3: sanitise ----
    const cleaned = await sanitise(pageText);
    if (cleaned.corrections.length > 0) {
      frame(out, "corrected", {
        text: cleaned.text,
        corrections: cleaned.corrections.map((c) => `${c.from}|${c.to}`),
      });
    }
    stage(out, "classifying", { message: "Working out what each note is" });

    // ---- consensus over the two whole-page transcriptions (P23) ----
    // Against the SANITISED text, so a word the sanitiser already fixed isn't also raised as
    // a dispute — that would ask the student to confirm something already resolved.
    const disputes = check?.pageText ? disputedWords(cleaned.text, check.pageText) : [];
    const checkMissing = !check?.parsed;

    // ---- 4: classify ----
    const classified = await classify(cleaned.text, regions, req.context ?? {}, cleaned.corrections);

    // DIAGRAM blocks are SYNTHESISED from region nominations (P43/P45, diagram.ts) — one
    // per drawing; a page can hold several. Vision is the primary nominator (it saw the
    // drawings; the text-only classifier can't), with the classifier's flat nomination
    // folded in by overlap. Each drawing's Mermaid rebuild rides the structure call's
    // response (P44), matched by groupKey and admitted only word-guarded — checked against
    // the WHOLE page rather than the cluster, because the two models draw a drawing's
    // boundary independently and a label the cluster missed is still the student's own
    // word, not an invention.
    const visionClusters = visionDiagramClusters(structure.parsed.blocks);
    const clusters = mergeNomination(visionClusters, classified.diagramRegions);
    // Cluster provenance, indices only (content-free, so CloudWatch-safe). Added after
    // `real-diabetes-meds` (2026-08-10): a margin note's region turned up inside the
    // flowchart's cluster and nothing recorded WHICH nominator put it there — vision's
    // groupKey hints and the classifier's flat list were indistinguishable after the fact.
    if (visionClusters.length > 0 || classified.diagramRegions.length > 0) {
      console.log(
        `diagram clusters: vision=${JSON.stringify(visionClusters.map((c) => c.regions))}` +
          ` classifier=${JSON.stringify(classified.diagramRegions)}` +
          ` merged=${JSON.stringify(clusters.map((c) => c.regions))}`,
      );
    }
    const visionDiagrams = structure.parsed.diagrams;
    const synthesised = clusters.flatMap((cluster) => {
      const meta = cluster.groupKey
        ? visionDiagrams.find((d) => d.groupKey === cluster.groupKey)
        : undefined;
      const form = meta?.form ?? (clusters.length === 1 ? classified.diagramForm : undefined);
      const block = synthesiseDiagramBlock(cluster.regions, regions, cleaned.corrections, form);
      if (!block) return [];
      block.diagramSource = guardMermaid(meta?.mermaid, pageText);
      return [block];
    });
    const classifiedBlocks =
      synthesised.length > 0
        ? classified.blocks.filter((b) => b.kind !== "DIAGRAM")
        : classified.blocks;

    // Degraded path (P27): no classifier output → fall back to the vision regions as
    // UNKNOWN blocks so the student can route them by hand. Still a transcription tool.
    const classifiedOrRaw =
      classifiedBlocks.length > 0
        ? classifiedBlocks
        : structure.parsed.blocks.map((b, i) => ({
            fromRegions: [i],
            text: b.rawText,
            kind: "UNKNOWN" as const,
            candidateCodes: [] as string[],
            tags: [] as string[],
          }));

    // Coverage guard: the classifier measurably loses whole regions (3 blocks from 5 on the
    // real test page, a whole drug missing). Anything it didn't account for comes back as
    // UNKNOWN rather than disappearing.
    const { blocks: covered, recovered } = ensureRegionsCovered(classifiedOrRaw, regions);
    if (recovered.length > 0) {
      console.warn(`coverage: recovered ${recovered.length} region(s) the classifier dropped`);
    }

    // Appended LAST, after coverage: the diagram deliberately duplicates pass-1 words, so it
    // must never satisfy coverage on their behalf — and disputes map to the first block
    // containing the word, which keeps them on the fileable block, not the drawing.
    const blocks = synthesised.length > 0 ? [...covered, ...synthesised] : covered;

    const disputeMap = mapDisputesToBlocks(blocks, disputes);

    const blocksPayload = {
      captureId: req.captureId,
      imageIndex: req.imageIndex,
      pageDateRaw: structure.parsed.pageDateRaw ?? null,
      wardHint: structure.parsed.wardHint ?? null,
      blocks: blocks.map((b, i) => {
        // Geometry comes from the FIRST vision region the block drew from. A semantic block
        // may span several (P26), so this is the anchor for the review overlay, not a tight
        // box — and geometry plays no part in classification at all. The exception is a
        // DIAGRAM, whose whole point is spanning the drawing: it gets the union of every
        // region it drew from, so the overlay outlines the map rather than one spoke.
        const region = structure.parsed?.blocks[b.fromRegions?.[0] ?? i];
        const bbox =
          b.kind === "DIAGRAM" && (b.fromRegions?.length ?? 0) > 1
            ? (b.fromRegions ?? [])
                .map((r) => normaliseBbox(structure.parsed?.blocks[r]?.bbox))
                .reduce((a, c) => ({
                  x0: Math.min(a.x0, c.x0),
                  y0: Math.min(a.y0, c.y0),
                  x1: Math.max(a.x1, c.x1),
                  y1: Math.max(a.y1, c.y1),
                }))
            : normaliseBbox(region?.bbox);
        return {
          ...b,
          // Whitespace only, and after every guard above has run on the original: the notebook's
          // line breaks are an artefact of the paper, and the degraded path has no classifier
          // output to have joined them already.
          text: reflow(b.text),
          bbox,
          rotationDeg: region?.rotationDeg ?? 0,
          confidence: region?.confidence ?? 0,
          disputedWords: (disputeMap.get(i) ?? []).map((d) => `${d.structure}|${d.check}`),
        };
      }),
      corrections: cleaned.corrections.map((c) => `${c.from}|${c.to}`),
    };

    frame(out, "blocks", blocksPayload);

    // Cached AFTER the student has their result, so a slow PutObject can't delay the thing
    // they are waiting for.
    await cacheParse(req.imageKey, { ...blocksPayload, parsedAt: new Date().toISOString() });

    frame(out, "done", {
      // Everything a Gate-2 eyeball (and later, metrics) needs to judge the run.
      diagnostics: {
        totalMs: Date.now() - startedAt,
        structure: { model: structure.model, ms: structure.latencyMs, in: structure.inputTokens, out: structure.outputTokens, retried: structureRetried },
        check: check ? { model: check.model, ms: check.latencyMs, missing: checkMissing } : { missing: true },
        sanitiser: { ms: cleaned.latencyMs, failed: cleaned.failed, applied: cleaned.corrections.length, rejected: cleaned.rejected.length },
        classifier: { ms: classified.latencyMs, failed: classified.failed, droppedBlocks: classified.droppedBlocks, salvagedBlocks: classified.salvagedBlocks, droppedCodes: classified.droppedCodes },
        disputes: disputes.length,
        recoveredRegions: recovered.length,
        // Indices only — which nominator drew each drawing's boundary (see the log above).
        diagram: {
          vision: visionClusters.map((c) => c.regions),
          classifier: classified.diagramRegions,
          merged: clusters.map((c) => c.regions),
        },
      },
    });
    out.end();
  } catch (err) {
    // 200 is already sent, so an error can only be a frame from here.
    if (err instanceof UpstreamError) {
      frame(out, "error", {
        code: err.throttled ? "THROTTLED" : "UPSTREAM",
        message: err.throttled ? "The models are busy — try again in a moment." : "That didn't work — try again.",
      });
    } else {
      console.error("parse failed", err);
      frame(out, "error", { code: "INTERNAL", message: "Something went wrong reading that photo." });
    }
    out.end();
  }
}

export const handler = awslambda.streamifyResponse(run);
