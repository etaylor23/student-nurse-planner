import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import {
  DAILY_PHOTO_LIMIT,
  MAX_UPLOAD_BYTES,
  PresignError,
  presignCapture,
  userPrefix,
} from "../infra/lambda/router/captures";

/**
 * Presigned capture uploads (spec-note-capture.md P1/P17).
 *
 * Two properties matter more than the happy path:
 *   - the object key is derived from the VERIFIED sub, so a caller can't write outside
 *     their own prefix (a presigned URL carries the signer's permissions), and
 *   - the daily cap gates the SIGNING, not just the parsing — otherwise the bucket is
 *     unbounded even while the model calls are capped.
 */

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

// Static creds + region via env so the module's own `new S3Client({})` can sign offline.
// Signing is a local computation — no S3 call is made, so no network and no real account.
// (Deliberately NOT importing @aws-sdk/client-s3 here: it lives in infra/node_modules, and
// Vite resolves a test file's imports from tests/, so importing it directly fails to load.)
process.env.AWS_REGION ??= "eu-west-2";
process.env.AWS_ACCESS_KEY_ID ??= "AKIATEST";
process.env.AWS_SECRET_ACCESS_KEY ??= "secret";

function deps() {
  return { doc: ddb.doc, tableName: ddb.tableName, bucket: "test-captures" };
}

const good = {
  captureId: "cap-abcdef123456",
  imageIndex: 0,
  contentType: "image/jpeg",
  bytes: 700_000,
};

describe("presignCapture — input validation", () => {
  const cases: Array<[string, Record<string, unknown>, string]> = [
    ["path traversal in captureId", { ...good, captureId: "../other-user" }, "bad_capture_id"],
    ["slash in captureId", { ...good, captureId: "a/b/c/deadbeef" }, "bad_capture_id"],
    ["empty captureId", { ...good, captureId: "" }, "bad_capture_id"],
    ["negative imageIndex", { ...good, imageIndex: -1 }, "bad_image_index"],
    ["imageIndex past the max", { ...good, imageIndex: 99 }, "bad_image_index"],
    ["non-integer imageIndex", { ...good, imageIndex: 1.5 }, "bad_image_index"],
    [
      "a PDF pretending to be a photo",
      { ...good, contentType: "application/pdf" },
      "bad_content_type",
    ],
    ["oversized upload", { ...good, bytes: MAX_UPLOAD_BYTES + 1 }, "bad_size"],
    ["zero bytes", { ...good, bytes: 0 }, "bad_size"],
  ];

  it.each(cases)("rejects %s", async (_label, payload, detail) => {
    await expect(presignCapture(deps(), "sub-validation", payload)).rejects.toThrow(PresignError);
    await expect(presignCapture(deps(), "sub-validation", payload)).rejects.toThrow(detail);
  });

  it("rejects a missing payload entirely", async () => {
    await expect(presignCapture(deps(), "sub-validation", undefined)).rejects.toThrow(PresignError);
  });
});

describe("presignCapture — key derivation", () => {
  it("keys the object under the verified sub, ignoring anything the client sends", async () => {
    const res = await presignCapture(deps(), "sub-keys", {
      ...good,
      // A client trying to choose its own key: none of this should reach the key.
      key: "u/someone-else/pwned.jpg",
      sub: "someone-else",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.key).toBe(`${userPrefix("sub-keys")}${good.captureId}/0.jpg`);
    expect(res.key.startsWith("u/sub-keys/")).toBe(true);
    expect(res.key).not.toContain("someone-else");
  });

  it("uses a .png extension for a png upload", async () => {
    const res = await presignCapture(deps(), "sub-png", { ...good, contentType: "image/png" });
    expect(res.ok && res.key.endsWith("/0.png")).toBe(true);
  });

  it("signs the content type and length, so the URL fits only the authorised upload", async () => {
    const res = await presignCapture(deps(), "sub-signed", good);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const signed = decodeURIComponent(res.url);
    expect(signed).toContain("X-Amz-Signature");
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
  });
});

describe("presignCapture — the daily cap gates the signing (P17)", () => {
  it(`allows ${DAILY_PHOTO_LIMIT} photos then caps, returning no URL`, async () => {
    const sub = "sub-cap";
    for (let i = 0; i < DAILY_PHOTO_LIMIT; i++) {
      const res = await presignCapture(deps(), sub, { ...good, captureId: `cap-${i}0000000` });
      expect(res.ok, `photo ${i + 1} of ${DAILY_PHOTO_LIMIT} should be allowed`).toBe(true);
    }

    const capped = await presignCapture(deps(), sub, { ...good, captureId: "cap-oneTooMany" });
    expect(capped.ok).toBe(false);
    if (capped.ok) return;
    expect(capped.reason).toBe("CAP");
    expect(capped.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The point of the test: no signed URL is handed out once capped, so the bucket can't
    // be written to even though the RPC returned 200.
    expect(capped).not.toHaveProperty("url");
  });

  it("counts down remaining as photos are used", async () => {
    const sub = "sub-remaining";
    const first = await presignCapture(deps(), sub, { ...good, captureId: "cap-first00000" });
    const second = await presignCapture(deps(), sub, { ...good, captureId: "cap-second0000" });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.remaining).toBe(DAILY_PHOTO_LIMIT - 1);
    expect(second.remaining).toBe(DAILY_PHOTO_LIMIT - 2);
  });

  it("keeps each user's cap separate", async () => {
    for (let i = 0; i < DAILY_PHOTO_LIMIT; i++) {
      await presignCapture(deps(), "sub-noisy", { ...good, captureId: `cap-n${i}000000` });
    }
    const other = await presignCapture(deps(), "sub-quiet", good);
    expect(other.ok).toBe(true);
  });

  it("does not consume the AI question cap", async () => {
    const sub = "sub-separate";
    for (let i = 0; i < DAILY_PHOTO_LIMIT; i++) {
      await presignCapture(deps(), sub, { ...good, captureId: `cap-s${i}000000` });
    }
    // A separate SK (DAILY#PHOTO#<date> vs DAILY#<date>), so questions are untouched (P17).
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    const q = await ai.countQuestion(30);
    expect(q.allowed).toBe(true);
    expect(q.remaining).toBe(29);
  });
});
