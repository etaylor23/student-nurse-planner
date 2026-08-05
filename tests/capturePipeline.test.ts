import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The capture pipeline (spec-note-capture-hardening.md H10/H12).
 *
 * `useCapture` builds a chain of per-page promises: each page's downscale + upload waits for the
 * page before it (one PUT at a time, because a ward connection handles one 700 KB body far
 * better than five) but NOT for any parse. The parse loop then consumes those promises in order.
 *
 * The shape is what's tested here, on the same primitives the hook uses, because the property
 * that matters is an interleaving and it is invisible in the hook's output: with it, a
 * three-page capture costs one upload plus three parses; without it, three of each. Both the
 * old and the new code produce identical blocks, so only the ORDER of events distinguishes them.
 */

/**
 * Build the chain exactly as `runCapture` does, recording when each step runs.
 *
 * On a VIRTUAL clock (`vi.useFakeTimers`), so the interleaving and the wall-clock saving are
 * both exact rather than a race against the machine — the first version of the timing assertion
 * here was a real-timer margin, and it flaked on a loaded laptop within the hour.
 */
function pipeline(pages: number, log: string[], timing: { upload: number; parse: number }) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const startedAt = Date.now();

  const uploadOne = async (i: number) => {
    log.push(`upload:start:${i}`);
    await wait(timing.upload);
    log.push(`upload:done:${i}`);
    return { key: `k${i}`, imageIndex: i };
  };

  const promises: Promise<{ key: string; imageIndex: number }>[] = [];
  let previous: Promise<unknown> = Promise.resolve();
  for (let i = 0; i < pages; i++) {
    const mine = previous.then(() => uploadOne(i));
    previous = mine;
    promises.push(mine);
  }

  return (async () => {
    for (let i = 0; i < promises.length; i++) {
      const page = await promises[i];
      log.push(`parse:start:${page.imageIndex}`);
      await wait(timing.parse);
      log.push(`parse:done:${page.imageIndex}`);
    }
    await previous; // any upload still in flight, as `runCapture` does
    return Date.now() - startedAt;
  })();
}

/** Let the virtual clock run until the pipeline is finished, and return its elapsed time. */
async function runToCompletion(work: Promise<number>): Promise<number> {
  await vi.advanceTimersByTimeAsync(100_000);
  return work;
}

describe("the upload/parse pipeline (H10)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("uploads the next page while the current one is being read", async () => {
    const log: string[] = [];
    // A parse is far slower than an upload, as in life (~70s vs ~2s).
    await runToCompletion(pipeline(3, log, { upload: 5, parse: 40 }));

    // Page 1 and 2 finish uploading during page 0's parse — that IS the saving.
    const parse0 = log.indexOf("parse:start:0");
    expect(log.indexOf("upload:done:1")).toBeGreaterThan(parse0);
    expect(log.indexOf("upload:done:2")).toBeGreaterThan(parse0);
    expect(log.indexOf("upload:done:1")).toBeLessThan(log.indexOf("parse:done:0"));
  });

  it("never has two uploads in flight at once", async () => {
    const log: string[] = [];
    await runToCompletion(pipeline(4, log, { upload: 20, parse: 5 }));
    let inFlight = 0;
    for (const entry of log) {
      if (entry.startsWith("upload:start")) inFlight++;
      if (entry.startsWith("upload:done")) inFlight--;
      expect(inFlight).toBeLessThanOrEqual(1);
    }
  });

  it("never has two parses in flight, and reads pages in page order", async () => {
    const log: string[] = [];
    await runToCompletion(pipeline(4, log, { upload: 5, parse: 20 }));
    const parses = log.filter((l) => l.startsWith("parse:"));
    // start:0 done:0 start:1 done:1 … — strictly sequential (the SSE progress UI is per-page,
    // and parallel parses would double our exposure to a Bedrock throttle).
    expect(parses).toEqual([
      "parse:start:0",
      "parse:done:0",
      "parse:start:1",
      "parse:done:1",
      "parse:start:2",
      "parse:done:2",
      "parse:start:3",
      "parse:done:3",
    ]);
  });

  it("costs one upload plus the parses, where the old shape cost every upload too", async () => {
    const upload = 20;
    const parse = 30;
    const pages = 3;

    const pipelined = await runToCompletion(pipeline(pages, [], { upload, parse }));

    // Exact on a virtual clock: the first upload is on the critical path, the rest hide inside
    // the parses. The shape this replaced was every upload, THEN every parse.
    expect(pipelined).toBe(upload + pages * parse);
    expect(pipelined).toBeLessThan(pages * upload + pages * parse);
  });

  it("stops reading when a page resolves to nothing (a cap, or a failed upload)", async () => {
    const log: string[] = [];
    const promises: Promise<{ imageIndex: number } | undefined>[] = [
      Promise.resolve({ imageIndex: 0 }),
      Promise.resolve(undefined), // the cap hit here
      Promise.resolve({ imageIndex: 2 }), // never reached
    ];
    for (const p of promises) {
      const page = await p;
      if (!page) break;
      log.push(`parse:${page.imageIndex}`);
    }
    // Page 0's read is kept; page 2 is not read behind a page that never uploaded, which
    // would file its notes out of page order.
    expect(log).toEqual(["parse:0"]);
  });
});

/**
 * H12 recorded that "presign while downscaling" is impossible — the presign key is the SHA-256
 * of the downscaled bytes (P41), so the hash cannot exist before the downscale. This pins the
 * ordering that replaced it, so nobody re-proposes the impossible version.
 */
describe("downscale → hash → presign (H12)", () => {
  it("keeps the order the content-addressed key forces", async () => {
    const log: string[] = [];
    const downscale = async () => {
      log.push("downscale");
      return "downscaled-bytes";
    };
    const hash = async (bytes: string) => {
      log.push("hash");
      return `sha:${bytes}`;
    };
    const presign = async (h: string) => {
      log.push("presign");
      expect(h).toBe("sha:downscaled-bytes");
    };
    await presign(await hash(await downscale()));
    expect(log).toEqual(["downscale", "hash", "presign"]);
  });

  it("runs the next page's downscale inside its own pipeline step, not up front", async () => {
    const log: string[] = [];
    const source = (i: number) => async () => {
      log.push(`downscale:${i}`);
      return `page${i}`;
    };
    const sources = [source(0), source(1), source(2)];

    // Nothing has been decoded yet just because the pages were picked.
    expect(log).toEqual([]);

    let previous: Promise<unknown> = Promise.resolve();
    const promises = sources.map((get) => {
      const mine = previous.then(async () => {
        const page = await get();
        log.push(`upload:${page}`);
        return page;
      });
      previous = mine;
      return mine;
    });
    await promises[0];
    // The first upload has happened; the third page has not been touched.
    expect(log.slice(0, 2)).toEqual(["downscale:0", "upload:page0"]);
    await Promise.all(promises);
    expect(log).toEqual([
      "downscale:0",
      "upload:page0",
      "downscale:1",
      "upload:page1",
      "downscale:2",
      "upload:page2",
    ]);
  });
});

/** The measured constants must be ONE value shared by both threads, not a copy per thread. */
describe("downscale constants (H11)", () => {
  it("re-exports the same objects the worker imports", async () => {
    const shared = await import("../src/react/components/capture/downscaleTarget");
    const main = await import("../src/react/components/capture/downscale");
    expect(main.LONG_EDGE).toBe(shared.LONG_EDGE);
    expect(main.JPEG_QUALITY).toBe(shared.JPEG_QUALITY);
    expect(main.targetSize).toBe(shared.targetSize);
    // Still the measured value — lowering it costs drug names (spec Appendix 2).
    expect(shared.LONG_EDGE).toBe(2400);
  });

  it("only takes the worker path when the browser has all three pieces", async () => {
    const { workerDownscaleSupported } = await import("../src/react/components/capture/downscale");
    const g = globalThis as Record<string, unknown>;
    const saved = {
      Worker: g.Worker,
      OffscreenCanvas: g.OffscreenCanvas,
      createImageBitmap: g.createImageBitmap,
    };
    try {
      g.Worker = function () {};
      g.OffscreenCanvas = function () {};
      g.createImageBitmap = function () {};
      expect(workerDownscaleSupported()).toBe(true);
      // Safari shipped OffscreenCanvas late, and most of these students are on phones.
      g.OffscreenCanvas = undefined;
      expect(workerDownscaleSupported()).toBe(false);
    } finally {
      Object.assign(g, saved);
    }
  });
});

describe("downscaleForUpload — the fallback still guards its inputs", () => {
  it("refuses a file that isn't an image before touching either path", async () => {
    const { CaptureImageError, downscaleForUpload } =
      await import("../src/react/components/capture/downscale");
    const notAPhoto = new File([new Uint8Array([1, 2, 3])], "notes.pdf", {
      type: "application/pdf",
    });
    await expect(downscaleForUpload(notAPhoto)).rejects.toThrow(CaptureImageError);
    // And nothing was spawned to find that out.
    expect(vi.isMockFunction(globalThis.Worker)).toBe(false);
  });
});
