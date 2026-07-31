import { describe, expect, it } from "vitest";
import { CaptureClient, CaptureUploadError, hashBlob } from "../src/data/api/captureClient";
import { LONG_EDGE, targetSize } from "../src/react/components/capture/downscale";

/**
 * Client half of the capture flow (spec-note-capture.md P1/P17).
 *
 * The downscale target is asserted because it is a MEASURED value, not a preference: at
 * 1600px both leading vision models misread `Phenoxymethylpenicillin` on a real page, and
 * at 2400px both read it (Appendix 2). A well-meaning "let's save bandwidth" edit would
 * silently cost drug names, so the number is pinned here with the reason attached.
 */

describe("downscale — target size", () => {
  it("caps the long edge at the measured 2400px, preserving aspect ratio", () => {
    // A portrait iPhone photo.
    expect(targetSize(3024, 4032)).toEqual({ width: 1800, height: 2400 });
    // Landscape.
    expect(targetSize(4032, 3024)).toEqual({ width: 2400, height: 1800 });
  });

  it("leaves an image already within the cap alone rather than upscaling", () => {
    expect(targetSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetSize(2400, 1200)).toEqual({ width: 2400, height: 1200 });
  });

  it("is pinned to 2400 — lowering it costs drug names (spec Appendix 2)", () => {
    expect(LONG_EDGE).toBe(2400);
  });

  it("handles a degenerate zero-size image without dividing by zero", () => {
    expect(targetSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

interface FetchCall {
  url: string;
  init?: RequestInit;
}

/** A fetch stub that answers the presign RPC and the S3 PUT, recording both. */
function stubFetch(opts: {
  presign?: unknown;
  presignStatus?: number;
  uploadStatus?: number;
  /** Body served for the cached-parse GET (P41). */
  cachedParse?: unknown;
}): {
  fetchImpl: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/rpc")) {
      const status = opts.presignStatus ?? 200;
      return {
        ok: status < 400,
        status,
        json: async () => ({ result: opts.presign, error: status >= 400 ? "boom" : undefined }),
      } as Response;
    }
    if (opts.cachedParse !== undefined && (init?.method ?? "GET") === "GET") {
      return { ok: true, status: 200, json: async () => opts.cachedParse } as Response;
    }
    const status = opts.uploadStatus ?? 200;
    return { ok: status < 400, status, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch) {
  return new CaptureClient({
    apiBase: "/api",
    getIdToken: async () => "test-id-token",
    fetchImpl,
  });
}

const blob = () => new Blob([new Uint8Array(1000)], { type: "image/jpeg" });

describe("CaptureClient", () => {
  it("presigns then PUTs the blob to the returned URL", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: {
        ok: true,
        key: "u/sub-1/cap-1/0.jpg",
        url: "https://bucket.s3.amazonaws.com/u/sub-1/cap-1/0.jpg?sig",
        expiresInSeconds: 300,
        remaining: 9,
      },
    });
    const res = await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 0,
      blob: blob(),
      contentType: "image/jpeg",
    });

    expect(res).toEqual({ ok: true, key: "u/sub-1/cap-1/0.jpg", remaining: 9 });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("/api/rpc");
    expect(calls[1].init?.method).toBe("PUT");
  });

  it("sends the ID token to the RPC but NOT to S3", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: { ok: true, key: "k", url: "https://s3/k?sig", expiresInSeconds: 300, remaining: 5 },
    });
    await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 0,
      blob: blob(),
      contentType: "image/jpeg",
    });

    const rpcHeaders = calls[0].init?.headers as Record<string, string>;
    expect(rpcHeaders.authorization).toBe("Bearer test-id-token");
    // The signature IS the authorisation on the PUT. An Authorization header would change
    // the signed header set and S3 would reject it.
    const putHeaders = calls[1].init?.headers as Record<string, string>;
    expect(putHeaders.authorization).toBeUndefined();
    expect(putHeaders["content-type"]).toBe("image/jpeg");
  });

  it("sends the DOWNSCALED byte count, so it matches what gets signed", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: { ok: true, key: "k", url: "https://s3/k?sig", expiresInSeconds: 300, remaining: 5 },
    });
    const b = new Blob([new Uint8Array(4321)], { type: "image/jpeg" });
    await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 2,
      blob: b,
      contentType: "image/jpeg",
    });
    const body = JSON.parse(String(calls[0].init?.body)) as {
      args: Array<Record<string, unknown>>;
    };
    expect(body.args[0]).toEqual({
      captureId: "cap-1",
      imageIndex: 2,
      contentType: "image/jpeg",
      bytes: 4321,
      // The hash of those same bytes — the page's identity (P41).
      imageHash: await hashBlob(b),
      refresh: undefined,
    });
  });

  it("hashes the DOWNSCALED bytes, so a 'hit' can only be the image the models saw (P41)", async () => {
    const a = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const b = new Blob([new Uint8Array([1, 2, 4])], { type: "image/jpeg" });
    const ha = await hashBlob(a);
    expect(ha).toMatch(/^[a-f0-9]{64}$/);
    expect(ha).toBe(await hashBlob(new Blob([new Uint8Array([1, 2, 3])])));
    expect(ha).not.toBe(await hashBlob(b));
  });

  it("returns the cap result without attempting an upload", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: { ok: false, reason: "CAP", remaining: 0, resetsAt: "2026-07-29T23:59:59.999Z" },
    });
    const res = await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 0,
      blob: blob(),
      contentType: "image/jpeg",
    });

    expect(res.ok).toBe(false);
    // The point: capped means no S3 traffic at all, so only the RPC call happened.
    expect(calls).toHaveLength(1);
  });

  it("throws presign_failed when the RPC rejects", async () => {
    const { fetchImpl } = stubFetch({ presignStatus: 403 });
    await expect(
      client(fetchImpl).uploadPhoto({
        captureId: "cap-1",
        imageIndex: 0,
        blob: blob(),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(CaptureUploadError);
  });

  it("throws upload_failed when S3 rejects the PUT", async () => {
    const { fetchImpl } = stubFetch({
      presign: { ok: true, key: "k", url: "https://s3/k?sig", expiresInSeconds: 300, remaining: 5 },
      uploadStatus: 403,
    });
    await expect(
      client(fetchImpl).uploadPhoto({
        captureId: "cap-1",
        imageIndex: 0,
        blob: blob(),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(/S3 upload failed \(403\)/);
  });
});

describe("CaptureClient — the parse cache (P41)", () => {
  const cached = {
    ok: true,
    cached: true,
    key: "u/sub/h/abc/page.jpg",
    parseUrl: "https://s3/parse.json?sig",
    parsedAt: "2026-07-28T09:15:00.000Z",
  };

  it("fetches the stored parse and never uploads the photo", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: cached,
      cachedParse: { blocks: [{ text: "Aciclovir" }] },
    });

    const res = await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 0,
      blob: blob(),
      contentType: "image/jpeg",
    });

    expect(res.ok && res.cached).toBe(true);
    if (!res.ok || !res.cached) return;
    expect(res.parse).toEqual({ blocks: [{ text: "Aciclovir" }] });
    expect(res.parsedAt).toBe(cached.parsedAt);
    // Two calls: the RPC and the cache GET. No PUT — the whole point.
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(false);
  });

  it("asks to skip the cache when re-reading from scratch", async () => {
    const { fetchImpl, calls } = stubFetch({
      presign: { ok: true, key: "k", url: "https://s3/k?sig", expiresInSeconds: 300, remaining: 4 },
    });
    await client(fetchImpl).uploadPhoto({
      captureId: "cap-1",
      imageIndex: 0,
      blob: blob(),
      contentType: "image/jpeg",
      refresh: true,
    });
    const body = JSON.parse(String(calls[0].init?.body)) as {
      args: Array<Record<string, unknown>>;
    };
    expect(body.args[0].refresh).toBe(true);
    // And it does upload, because the server will re-read the page.
    expect(calls.some((c) => c.init?.method === "PUT")).toBe(true);
  });

  it("surfaces an unreadable cache rather than pretending it parsed", async () => {
    const { fetchImpl } = stubFetch({ presign: cached, uploadStatus: 500 });
    await expect(
      client(fetchImpl).uploadPhoto({
        captureId: "cap-1",
        imageIndex: 0,
        blob: blob(),
        contentType: "image/jpeg",
      }),
    ).rejects.toThrow(CaptureUploadError);
  });
});
