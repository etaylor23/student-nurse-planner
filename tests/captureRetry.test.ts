import { describe, expect, it, vi } from "vitest";
import { isTransient, withRetry } from "../src/data/api/retry";
import { CaptureClient, CaptureUploadError } from "../src/data/api/captureClient";
import { ParseClient, ParseError, type ParseHandlers } from "../src/data/api/parseClient";

/**
 * Retry on the capture client path (spec-note-capture-hardening.md H7).
 *
 * The design case is UCLH WiFi: the connection drops mid-capture and the student is standing
 * in a corridor with a photo of their notes. So the rule being tested is narrow and matters in
 * both directions — a dropped connection is tried again, and a refusal (a cap, a bad request,
 * a cancel) is not, because repeating it would only spend the student's allowance or their
 * time. Delays are asserted because "with backoff" is the whole point: retrying a failed
 * connection immediately is what the first version did and it helped nothing.
 */

/** Instant, recorded backoff — the delays are asserted, never waited out. */
function fakeSleep() {
  const delays: number[] = [];
  return {
    delays,
    sleep: async (ms: number) => {
      delays.push(ms);
    },
    // No jitter, so the base cadence is exactly assertable.
    jitter: () => 0,
  };
}

function httpError(status: number): Error {
  return Object.assign(new Error(`boom ${status}`), { status });
}

describe("isTransient", () => {
  it("retries what never reached the server, or a server that failed to answer", () => {
    expect(isTransient(new TypeError("Failed to fetch"))).toBe(true);
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isTransient(httpError(status))).toBe(true);
    }
  });

  it("does NOT retry a refusal the server meant", () => {
    for (const status of [400, 401, 403, 404, 409, 413]) {
      expect(isTransient(httpError(status))).toBe(false);
    }
  });

  it("does NOT retry a cancel — the student closed the dialog", () => {
    expect(isTransient(Object.assign(new Error("aborted"), { name: "AbortError" }))).toBe(false);
  });

  it("does NOT retry a plain programming error — that should surface on the first go", () => {
    expect(isTransient(new RangeError("off by one"))).toBe(false);
    expect(isTransient("not even an error")).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first success without waiting at all", async () => {
    const { sleep, delays } = fakeSleep();
    const op = vi.fn().mockResolvedValue("ok");
    await expect(withRetry(op, { sleep })).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("backs off ~1s then ~3s, then succeeds", async () => {
    const { sleep, delays, jitter } = fakeSleep();
    const op = vi
      .fn()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue("ok");
    await expect(withRetry(op, { sleep, jitter })).resolves.toBe("ok");
    expect(delays).toEqual([1000, 3000]);
  });

  it("gives up after three attempts and rethrows the LAST failure untouched", async () => {
    const { sleep, jitter } = fakeSleep();
    const last = httpError(503);
    const op = vi.fn().mockRejectedValue(last);
    await expect(withRetry(op, { sleep, jitter })).rejects.toBe(last);
    expect(op).toHaveBeenCalledTimes(3);
  });

  it("stops immediately on a refusal, however many attempts are allowed", async () => {
    const { sleep, delays } = fakeSleep();
    const op = vi.fn().mockRejectedValue(httpError(403));
    await expect(withRetry(op, { sleep, attempts: 5 })).rejects.toThrow(/boom 403/);
    expect(op).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("announces each retry before it waits, so a UI can say what's happening", async () => {
    const { sleep, jitter } = fakeSleep();
    const notices: string[] = [];
    const op = vi.fn().mockRejectedValueOnce(httpError(500)).mockResolvedValue("ok");
    await withRetry(op, {
      sleep,
      jitter,
      onRetry: (n) => notices.push(`${n.attempt}/${n.of} in ${n.delayMs}ms`),
    });
    expect(notices).toEqual(["2/3 in 1000ms"]);
  });

  it("spreads jitter over the base delay, so parallel pages don't retry in lockstep", async () => {
    const { sleep, delays } = fakeSleep();
    const op = vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValue("ok");
    await withRetry(op, { sleep, jitter: () => 1 });
    expect(delays).toEqual([1500]); // 1000 + 50%
  });
});

// ---- the clients ------------------------------------------------------------------

const PRESIGNED = {
  ok: true,
  key: "u/sub/h/abc/page.jpg",
  url: "https://s3/put?sig",
  expiresInSeconds: 300,
  remaining: 9,
};

/** One canned answer: an HTTP reply, or a thrown failure (the connection never got there). */
type Answer = { status: number; body?: unknown } | Error;

/** A fetch stub driven by a function per URL kind, called with the attempt number. */
function stub(answers: { rpc?: (n: number) => Answer; put?: (n: number) => Answer }) {
  const calls: string[] = [];
  let rpcs = 0;
  let puts = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const isRpc = url.endsWith("/rpc");
    calls.push(isRpc ? "rpc" : (init?.method ?? "GET").toLowerCase());
    const answer = isRpc ? answers.rpc?.(++rpcs) : answers.put?.(++puts);
    if (answer instanceof Error) throw answer;
    const { status, body } = answer ?? { status: 200, body: { result: PRESIGNED } };
    return { ok: status < 400, status, json: async () => body ?? {} } as Response;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function client(fetchImpl: typeof fetch, onRetrySleep = fakeSleep()) {
  return new CaptureClient({
    apiBase: "/api",
    getIdToken: async () => "tok",
    fetchImpl,
    retry: { sleep: onRetrySleep.sleep, jitter: onRetrySleep.jitter },
  });
}

const photo = () => ({
  captureId: "cap-abcdef123456",
  imageIndex: 0,
  blob: new Blob([new Uint8Array(1000)], { type: "image/jpeg" }),
  contentType: "image/jpeg",
});

describe("CaptureClient — retrying the two hops (H7)", () => {
  it("asks for the presign again after a 503, then uploads", async () => {
    const { fetchImpl, calls } = stub({
      rpc: (n) => (n === 1 ? { status: 503 } : { status: 200, body: { result: PRESIGNED } }),
    });
    const res = await client(fetchImpl).uploadPhoto(photo());
    expect(res).toEqual({ ok: true, key: PRESIGNED.key, remaining: 9 });
    expect(calls).toEqual(["rpc", "rpc", "put"]);
  });

  it("repeats the PUT when the connection drops, with the same signed URL", async () => {
    const { fetchImpl, calls } = stub({
      put: (n) => (n === 1 ? new TypeError("Failed to fetch") : { status: 200 }),
    });
    const res = await client(fetchImpl).uploadPhoto(photo());
    expect(res.ok).toBe(true);
    // One presign, two PUTs: the URL is still valid, so re-asking would be a wasted round-trip.
    expect(calls).toEqual(["rpc", "put", "put"]);
  });

  it("re-requests the URL when S3 refuses the signature, then PUTs once more", async () => {
    const { fetchImpl, calls } = stub({ put: (n) => ({ status: n === 1 ? 403 : 200 }) });
    const res = await client(fetchImpl).uploadPhoto(photo());
    expect(res.ok).toBe(true);
    // A signature S3 won't accept can't be fixed by repeating it — the URL is asked for again.
    expect(calls).toEqual(["rpc", "put", "rpc", "put"]);
  });

  it("gives up on a second 403 rather than looping between the two hops", async () => {
    const { fetchImpl, calls } = stub({ put: () => ({ status: 403 }) });
    await expect(client(fetchImpl).uploadPhoto(photo())).rejects.toThrow(/S3 upload failed/);
    expect(calls).toEqual(["rpc", "put", "rpc", "put"]);
  });

  it("does not retry a bad request — the server means it", async () => {
    const { fetchImpl, calls } = stub({
      rpc: () => ({ status: 400, body: { error: "bad_size" } }),
    });
    await expect(client(fetchImpl).uploadPhoto(photo())).rejects.toThrow(CaptureUploadError);
    expect(calls).toEqual(["rpc"]);
  });

  it("tells the caller about each retry, naming the hop in the student's terms", async () => {
    const { fetchImpl } = stub({
      put: (n) => (n === 1 ? new TypeError("offline") : { status: 200 }),
    });
    const steps: string[] = [];
    await client(fetchImpl).uploadPhoto({
      ...photo(),
      onRetry: (n) => steps.push(`${n.step} ${n.attempt}/${n.of}`),
    });
    expect(steps).toEqual(["upload 2/3"]);
  });

  it("treats the daily cap as an answer, never something to retry", async () => {
    const capped = { ok: false, reason: "CAP", remaining: 0, resetsAt: "2026-08-05T23:59:59.999Z" };
    const { fetchImpl, calls } = stub({ rpc: () => ({ status: 200, body: { result: capped } }) });
    const res = await client(fetchImpl).uploadPhoto(photo());
    expect(res).toEqual(capped);
    expect(calls).toEqual(["rpc"]);
  });
});

// ---- the parse endpoint -----------------------------------------------------------

const HANDLERS: ParseHandlers = {
  onStage: () => {},
  onTranscribed: () => {},
  onCorrected: () => {},
  onBlocks: () => {},
  onDone: () => {},
  onError: () => {},
};

/** An SSE body as the endpoint writes it, or a stream that dies part-way through. */
function sseBody(frames: string[], dieAfter?: number) {
  let i = 0;
  return {
    getReader: () => ({
      read: async () => {
        if (dieAfter !== undefined && i === dieAfter) throw new TypeError("network error");
        if (i >= frames.length) return { done: true, value: undefined };
        return { done: false, value: new TextEncoder().encode(frames[i++]) };
      },
    }),
  };
}

const BLOCKS_FRAME = `event: blocks\ndata: ${JSON.stringify({ blocks: [{ text: "x" }] })}\n\n`;

function parseClient(fetchImpl: typeof fetch, s = fakeSleep()) {
  return new ParseClient({
    parseUrl: "https://parse.example",
    getIdToken: async () => "tok",
    fetchImpl,
    retry: { sleep: s.sleep, jitter: s.jitter },
  });
}

describe("ParseClient — retrying a read that never started (H7)", () => {
  const input = { captureId: "cap-abcdef123456", imageKey: "u/sub/h/abc/page.jpg", imageIndex: 0 };

  it("retries a 503 and streams the second attempt", async () => {
    let n = 0;
    const blocks = vi.fn();
    const fetchImpl = (async () => {
      if (++n === 1) return { ok: false, status: 503, json: async () => ({}) } as Response;
      return { ok: true, status: 200, body: sseBody([BLOCKS_FRAME]) } as unknown as Response;
    }) as unknown as typeof fetch;

    await parseClient(fetchImpl).parse(input, { ...HANDLERS, onBlocks: blocks });
    expect(n).toBe(2);
    expect(blocks).toHaveBeenCalledOnce();
  });

  it("does NOT retry the daily read cap — it reports it, with the rollover time (H8)", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return {
        ok: false,
        status: 429,
        json: async () => ({
          error: "CAP",
          detail: "That's as many pages as we can read today",
          resetsAt: "2026-08-05T23:59:59.999Z",
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const err = await parseClient(fetchImpl)
      .parse(input, HANDLERS)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).code).toBe("capped");
    expect((err as ParseError).resetsAt).toBe("2026-08-05T23:59:59.999Z");
    expect(n).toBe(1);
  });

  it("still retries a model throttle, which IS transient", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      if (++n === 1) return { ok: false, status: 429, json: async () => ({ error: "THROTTLED" }) };
      return { ok: true, status: 200, body: sseBody([BLOCKS_FRAME]) };
    }) as unknown as typeof fetch;

    await parseClient(fetchImpl).parse(input, HANDLERS);
    expect(n).toBe(2);
  });

  it("does not re-run the pipeline when the stream breaks after frames arrived", async () => {
    // The ~70s of model calls has already been spent and the caller has partial state; a
    // second run would replay stages over it. So this surfaces instead of retrying.
    let n = 0;
    const fetchImpl = (async () => {
      n++;
      return {
        ok: true,
        status: 200,
        body: sseBody([`event: stage\ndata: {"stage":"reading"}\n\n`], 1),
      };
    }) as unknown as typeof fetch;

    await expect(parseClient(fetchImpl).parse(input, HANDLERS)).rejects.toThrow(ParseError);
    expect(n).toBe(1);
  });

  it("DOES retry when the stream dies before anything was forwarded", async () => {
    let n = 0;
    const fetchImpl = (async () => {
      if (++n === 1) return { ok: true, status: 200, body: sseBody([], 0) };
      return { ok: true, status: 200, body: sseBody([BLOCKS_FRAME]) };
    }) as unknown as typeof fetch;

    const blocks = vi.fn();
    await parseClient(fetchImpl).parse(input, { ...HANDLERS, onBlocks: blocks });
    expect(n).toBe(2);
    expect(blocks).toHaveBeenCalledOnce();
  });
});
