import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import {
  DAILY_PHOTO_LIMIT,
  MAX_UPLOAD_BYTES,
  PAGE_VIEW_EXPIRY_SECONDS,
  PRESIGN_EXPIRY_SECONDS,
  PresignError,
  cachedParseForKey,
  presignCapture,
  presignPageImage,
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

/** No cached parse unless a test says otherwise — `headParseCache` keeps this offline. */
function deps(parsedAt: Date | null = null) {
  return {
    doc: ddb.doc,
    tableName: ddb.tableName,
    bucket: "test-captures",
    headParseCache: async () => parsedAt,
  };
}

const HASH = "a".repeat(64);

const good = {
  captureId: "cap-abcdef123456",
  imageIndex: 0,
  contentType: "image/jpeg",
  bytes: 700_000,
  imageHash: HASH,
};

/**
 * A distinct page. The cap is claimed per PAGE per day (H7), so a test that means "ten
 * photos" has to send ten different hashes — which is what ten photos of ten pages are.
 */
const hashFor = (n: number) => n.toString(16).padStart(64, "0");

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
    // The hash IS the object key, so anything that isn't 64 hex chars is a path injection.
    ["path traversal in the hash", { ...good, imageHash: "../../etc/passwd" }, "bad_image_hash"],
    ["short hash", { ...good, imageHash: "abc123" }, "bad_image_hash"],
    ["non-hex hash", { ...good, imageHash: "z".repeat(64) }, "bad_image_hash"],
    ["missing hash", { ...good, imageHash: undefined }, "bad_image_hash"],
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
    // Content-addressed (P41): the hash, not the captureId, decides where the page lives.
    expect(res.key).toBe(`${userPrefix("sub-keys")}h/${HASH}/page.jpg`);
    expect(res.key).not.toContain(good.captureId);
    expect(res.key.startsWith("u/sub-keys/")).toBe(true);
    expect(res.key).not.toContain("someone-else");
  });

  it("uses a .png extension for a png upload", async () => {
    const res = await presignCapture(deps(), "sub-png", { ...good, contentType: "image/png" });
    expect(res.ok && res.key.endsWith("/page.png")).toBe(true);
  });

  it("signs the content type and length, so the URL fits only the authorised upload", async () => {
    const res = await presignCapture(deps(), "sub-signed", good);
    expect(res.ok).toBe(true);
    if (!res.ok || res.cached) return;
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
      const res = await presignCapture(deps(), sub, {
        ...good,
        captureId: `cap-${i}0000000`,
        imageHash: hashFor(i),
      });
      expect(res.ok, `photo ${i + 1} of ${DAILY_PHOTO_LIMIT} should be allowed`).toBe(true);
    }

    const capped = await presignCapture(deps(), sub, {
      ...good,
      captureId: "cap-oneTooMany",
      imageHash: hashFor(99),
    });
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
    const first = await presignCapture(deps(), sub, {
      ...good,
      captureId: "cap-first00000",
      imageHash: hashFor(1),
    });
    const second = await presignCapture(deps(), sub, {
      ...good,
      captureId: "cap-second0000",
      imageHash: hashFor(2),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || first.cached || !second.ok || second.cached) return;
    expect(first.remaining).toBe(DAILY_PHOTO_LIMIT - 1);
    expect(second.remaining).toBe(DAILY_PHOTO_LIMIT - 2);
  });

  it("keeps each user's cap separate", async () => {
    for (let i = 0; i < DAILY_PHOTO_LIMIT; i++) {
      await presignCapture(deps(), "sub-noisy", {
        ...good,
        captureId: `cap-n${i}000000`,
        imageHash: hashFor(i),
      });
    }
    const other = await presignCapture(deps(), "sub-quiet", good);
    expect(other.ok).toBe(true);
  });

  it("does not consume the AI question cap", async () => {
    const sub = "sub-separate";
    for (let i = 0; i < DAILY_PHOTO_LIMIT; i++) {
      await presignCapture(deps(), sub, {
        ...good,
        captureId: `cap-s${i}000000`,
        imageHash: hashFor(i),
      });
    }
    // A separate SK (DAILY#PHOTO#<date> vs DAILY#<date>), so questions are untouched (P17).
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    const q = await ai.countQuestion(30);
    expect(q.allowed).toBe(true);
    expect(q.remaining).toBe(29);
  });
});

/**
 * The cap counts PAGES, not calls (hardening H7). This is what lets the client retry a presign
 * at all: on a ward connection the reply is often lost rather than never sent, so without it a
 * page asked for three times would quietly spend three of the student's ten.
 */
describe("presignCapture — a retried presign costs one photo, not three", () => {
  it("charges the same page once however many times it is asked for today", async () => {
    const sub = "sub-idempotent";
    const first = await presignCapture(deps(), sub, good);
    const second = await presignCapture(deps(), sub, good);
    const third = await presignCapture(deps(), sub, good);
    if (!first.ok || first.cached || !second.ok || second.cached || !third.ok || third.cached) {
      throw new Error("expected three signed uploads");
    }
    // Same answer each time: one photo spent, nine left — not seven.
    expect([first.remaining, second.remaining, third.remaining]).toEqual([
      DAILY_PHOTO_LIMIT - 1,
      DAILY_PHOTO_LIMIT - 1,
      DAILY_PHOTO_LIMIT - 1,
    ]);
  });

  it("still signs a usable URL on the repeat, so the retry can actually upload", async () => {
    const sub = "sub-idempotent-url";
    await presignCapture(deps(), sub, good);
    const again = await presignCapture(deps(), sub, good);
    if (!again.ok || again.cached) throw new Error("expected a signed upload");
    expect(again.url).toContain("X-Amz-Signature");
    expect(again.key).toContain(`h/${HASH}/page.jpg`);
  });

  it("keeps counting DIFFERENT pages, so the cap still means something", async () => {
    const sub = "sub-idempotent-distinct";
    await presignCapture(deps(), sub, good);
    await presignCapture(deps(), sub, good); // a retry of page one
    const other = await presignCapture(deps(), sub, { ...good, imageHash: hashFor(7) });
    if (!other.ok || other.cached) throw new Error("expected a signed upload");
    expect(other.remaining).toBe(DAILY_PHOTO_LIMIT - 2);
  });

  it("does not let one student's page free another's", async () => {
    await presignCapture(deps(), "sub-a-pages", good);
    const b = await presignCapture(deps(), "sub-b-pages", good);
    if (!b.ok || b.cached) throw new Error("expected a signed upload");
    expect(b.remaining).toBe(DAILY_PHOTO_LIMIT - 1);
  });
});

/**
 * The fresh-read cap (hardening H8). Before this, "read it again from scratch" and any direct
 * POST to the parse endpoint ran four model calls uncounted — the one path where spend was
 * unbounded, because the photo cap gates presigns and a re-read presigns nothing.
 */
describe("countParse — the daily fresh-read cap (H8)", () => {
  it("counts up to the limit, then refuses, with a rollover time", async () => {
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub: "sub-parse-cap" });
    for (let i = 0; i < 3; i++) {
      const res = await ai.countParse(3);
      expect(res.allowed, `read ${i + 1} of 3`).toBe(true);
      expect(res.remaining).toBe(3 - (i + 1));
    }
    const capped = await ai.countParse(3);
    expect(capped.allowed).toBe(false);
    expect(capped.remaining).toBe(0);
    expect(capped.resetsAt).toMatch(/^\d{4}-\d{2}-\d{2}T23:59:59\.999Z$/);
  });

  it("is a SEPARATE counter from photos and questions, in both directions", async () => {
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const sub = "sub-parse-separate";
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    // Spending every read leaves the photo allowance and the question allowance untouched:
    // a day of re-reads must not stop the student photographing a new page or asking anything.
    for (let i = 0; i < 30; i++) await ai.countParse(30);
    expect((await ai.countPhoto(DAILY_PHOTO_LIMIT)).remaining).toBe(DAILY_PHOTO_LIMIT - 1);
    expect((await ai.countQuestion(30)).remaining).toBe(29);
  });

  it("keeps each student's reads their own", async () => {
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const noisy = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub: "sub-parse-noisy" });
    for (let i = 0; i < 5; i++) await noisy.countParse(5);
    const quiet = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub: "sub-parse-quiet" });
    expect((await quiet.countParse(5)).allowed).toBe(true);
  });
});

describe("presignCapture — the content-addressed parse cache (P41)", () => {
  const parsedAt = new Date("2026-07-28T09:15:00.000Z");

  it("hands back the previous parse instead of an upload URL", async () => {
    const res = await presignCapture(deps(parsedAt), "sub-cache-hit", good);
    expect(res.ok).toBe(true);
    if (!res.ok || !res.cached) throw new Error("expected a cache hit");

    // A GET for the cached JSON, not a PUT for the photo — nothing is uploaded.
    expect(res.parseUrl).toContain(`h/${HASH}/parse.json`);
    expect(res.parseUrl).toContain("X-Amz-Signature");
    expect(res).not.toHaveProperty("url");
    expect(res.parsedAt).toBe(parsedAt.toISOString());
  });

  it("does NOT spend a photo from the daily cap on a cache hit", async () => {
    const sub = "sub-cache-free";
    // Twenty re-reads of a page already parsed: twice the daily limit, all served.
    for (let i = 0; i < DAILY_PHOTO_LIMIT * 2; i++) {
      const res = await presignCapture(deps(parsedAt), sub, good);
      expect(res.ok, `re-read ${i + 1} should be served`).toBe(true);
    }
    // And the cap is still completely untouched, because no model ever ran.
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    const count = await ai.countPhoto(DAILY_PHOTO_LIMIT);
    expect(count.remaining).toBe(DAILY_PHOTO_LIMIT - 1); // -1 for this very check
  });

  it("`refresh` ignores the cache and signs a fresh upload", async () => {
    const res = await presignCapture(deps(parsedAt), "sub-refresh", { ...good, refresh: true });
    expect(res.ok).toBe(true);
    if (!res.ok || res.cached) throw new Error("expected a fresh upload");
    expect(res.url).toContain("X-Amz-Signature");
    // The same key, so a re-read OVERWRITES the cache rather than orphaning it.
    expect(res.key).toBe(`${userPrefix("sub-refresh")}h/${HASH}/page.jpg`);
    expect(res.remaining).toBe(DAILY_PHOTO_LIMIT - 1); // and it does cost a photo
  });

  it("caches per user, never across them", async () => {
    // The cache key includes the sub, so one student's parse can't be served to another.
    const mine = await presignCapture(deps(parsedAt), "sub-mine", good);
    if (!mine.ok || !mine.cached) throw new Error("expected a cache hit");
    expect(mine.parseUrl).toContain("u/sub-mine/");
    expect(mine.parseUrl).not.toContain("sub-theirs");
  });

  it("treats an unreadable cache as a miss rather than a failure", async () => {
    const res = await presignCapture(
      {
        doc: ddb.doc,
        tableName: ddb.tableName,
        bucket: "test-captures",
        headParseCache: async () => {
          throw new Error("S3 is having a day");
        },
      },
      "sub-cache-broken",
      good,
    );
    // A cache that can't be read costs a re-parse, never a broken upload.
    expect(res.ok).toBe(true);
    if (!res.ok || res.cached) throw new Error("expected a fresh upload");
    expect(res.url).toContain("X-Amz-Signature");
  });
});

describe("presignPageImage — reading a page back (P1)", () => {
  const view = { bucket: "test-captures" };
  const key = `${userPrefix("sub-mine")}h/${HASH}/page.jpg`;

  it("signs a GET for a page the caller uploaded", async () => {
    const res = await presignPageImage(view, "sub-mine", { imageKey: key });
    expect(res.url).toContain("X-Amz-Signature");
    expect(res.url).toContain(`u/sub-mine/h/${HASH}/page.jpg`);
    expect(res.expiresInSeconds).toBe(PAGE_VIEW_EXPIRY_SECONDS);
  });

  it("lasts longer than an upload URL, because review is a screen you sit on", () => {
    // A five-minute URL would show a broken photo exactly when the student comes back to
    // finish filing — the capture deliberately outlives the dialog.
    expect(PAGE_VIEW_EXPIRY_SECONDS).toBeGreaterThan(PRESIGN_EXPIRY_SECONDS);
  });

  it("refuses another student's key rather than signing it", async () => {
    // A presigned URL carries the SIGNER's permissions, so honouring a caller-supplied key
    // would be a cross-user read of clinical imagery.
    await expect(presignPageImage(view, "sub-theirs", { imageKey: key })).rejects.toThrow(
      PresignError,
    );
  });

  const bad: Array<[string, unknown]> = [
    ["nothing at all", {}],
    ["a key that isn't a string", { imageKey: 42 }],
    ["path traversal", { imageKey: "u/sub-mine/h/../../other/page.jpg" }],
    ["a hash that isn't one", { imageKey: "u/sub-mine/h/not-a-hash/page.jpg" }],
    ["the cached parse instead of the photo", { imageKey: `u/sub-mine/h/${HASH}/parse.json` }],
    ["an unexpected extension", { imageKey: `u/sub-mine/h/${HASH}/page.svg` }],
    ["a bare prefix", { imageKey: `u/sub-mine/h/${HASH}/` }],
  ];
  for (const [name, raw] of bad) {
    it(`rejects ${name}`, async () => {
      await expect(presignPageImage(view, "sub-mine", raw)).rejects.toThrow(PresignError);
    });
  }
});

/**
 * The finished parse, by key (hardening H9). This is what makes resuming an interrupted
 * capture free: after a reload the client no longer has the bytes to hash, so it cannot ask
 * `presignCapture`, but the capture row still holds the key.
 */
describe("cachedParseForKey — resuming without paying for the read again", () => {
  const parsedAt = new Date("2026-08-05T09:15:00.000Z");
  const key = `${userPrefix("sub-mine")}h/${HASH}/page.jpg`;

  it("hands back a signed GET for the parse beside the photo", async () => {
    const res = await cachedParseForKey(
      { bucket: "test-captures", headParseCache: async () => parsedAt },
      "sub-mine",
      { imageKey: key },
    );
    expect(res?.parseUrl).toContain(`h/${HASH}/parse.json`);
    expect(res?.parseUrl).toContain("X-Amz-Signature");
    expect(res?.parsedAt).toBe(parsedAt.toISOString());
  });

  it("says no when the page was never parsed — that page needs a real read", async () => {
    const res = await cachedParseForKey(
      { bucket: "test-captures", headParseCache: async () => null },
      "sub-mine",
      { imageKey: key },
    );
    expect(res).toBeNull();
  });

  it("spends nothing: no counter, no upload URL, no table access at all", async () => {
    // Deps carry only a bucket — there is no `doc` to count with, which is the guarantee.
    const deps = { bucket: "test-captures", headParseCache: async () => parsedAt };
    const mine = `${userPrefix("sub-free")}h/${HASH}/page.jpg`;
    for (let i = 0; i < DAILY_PHOTO_LIMIT * 2; i++) {
      expect(await cachedParseForKey(deps, "sub-free", { imageKey: mine })).not.toBeNull();
    }
    const { AiStore } = await import("../src/data/dynamo/aiStore");
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub: "sub-free" });
    expect((await ai.countPhoto(DAILY_PHOTO_LIMIT)).remaining).toBe(DAILY_PHOTO_LIMIT - 1);
  });

  it("refuses another student's key rather than reading it", async () => {
    await expect(
      cachedParseForKey({ bucket: "test-captures" }, "sub-theirs", { imageKey: key }),
    ).rejects.toThrow(PresignError);
  });

  it("rejects a key that isn't a page", async () => {
    for (const imageKey of [`u/sub-mine/h/${HASH}/parse.json`, "u/sub-mine/../x/page.jpg", ""]) {
      await expect(
        cachedParseForKey({ bucket: "test-captures" }, "sub-mine", { imageKey }),
      ).rejects.toThrow(PresignError);
    }
  });
});
