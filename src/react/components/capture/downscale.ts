import { JPEG_QUALITY, LONG_EDGE, targetSize } from "./downscaleTarget";
import type { DownscaleReply, DownscaleRequest } from "./downscale.worker";

/**
 * Client-side downscale before upload (spec-note-capture.md, P24 set-by-default).
 *
 * **2400px, not 1600px, and this is measured rather than chosen.** At 1600px both leading
 * vision models misread `Phenoxymethylpenicillin` — differently — on a real page of
 * handwritten medication notes. At 2400px both read it. See Appendix 2 of the spec. A
 * phone photo is ~3024×4032 and ~6 MB; 2400px at q85 lands around 700 KB, which is small
 * enough for a ward connection and large enough to keep the drug names.
 *
 * Resizing here rather than server-side is deliberate: the upload is a direct presigned
 * PUT (P1), so bytes never pass through a Lambda and there is nowhere else to shrink them.
 *
 * **Off the main thread where possible** (hardening H11). Decode + re-encode is the heaviest
 * local work the app does, and on the main thread it janks the screen at precisely the moment
 * the student has taken the photo and is waiting. So it runs in a module worker on
 * `OffscreenCanvas`, with the original `<canvas>` path kept as the fallback for anything that
 * doesn't have one — the constants are shared (`downscaleTarget.ts`), so the two paths cannot
 * drift into producing different bytes.
 */

// Re-exported so callers (and the tests that pin the measured value) keep one import.
export { JPEG_QUALITY, LONG_EDGE, targetSize };

/** Hard ceiling matching the server's presign check, so oversize fails locally with a
 *  useful message rather than as an opaque 403 from S3. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface DownscaleResult {
  blob: Blob;
  contentType: "image/jpeg";
  bytes: number;
  width: number;
  height: number;
}

export class CaptureImageError extends Error {
  constructor(readonly code: "not_an_image" | "decode_failed" | "encode_failed" | "too_large") {
    super(code);
    this.name = "CaptureImageError";
  }
}

/** Decode a File/Blob to a bitmap, preferring `createImageBitmap` (honours EXIF orientation). */
async function decode(
  file: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      // `imageOrientation: "from-image"` applies the EXIF rotation, so a photo taken in
      // portrait isn't handed to the model sideways — which would defeat the reading-order
      // sort (P36) before it started.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // fall through to the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new CaptureImageError("decode_failed"));
      el.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Can this browser do the work off the main thread?
 *
 * All three are needed, and `OffscreenCanvas` is the one that actually varies — it arrived late
 * on Safari, which is most of the phones this runs on. A browser missing any of them takes the
 * main-thread path and behaves exactly as before, just with the jank.
 */
export function workerDownscaleSupported(): boolean {
  return (
    typeof Worker === "function" &&
    typeof OffscreenCanvas === "function" &&
    typeof createImageBitmap === "function"
  );
}

/** One worker for the session, started on first use — a capture is several pages, and spinning
 *  one up per page would pay the startup cost repeatedly for no gain. */
let worker: Worker | undefined;
let workerBroken = false;
let seq = 0;

function getWorker(): Worker | undefined {
  if (workerBroken) return undefined;
  if (!worker) {
    try {
      worker = new Worker(new URL("./downscale.worker.ts", import.meta.url), { type: "module" });
      // A worker that dies takes the whole path down with it, once: every later page falls
      // back to the main thread rather than waiting on a message that will never arrive.
      worker.onerror = () => {
        workerBroken = true;
        worker = undefined;
      };
    } catch {
      workerBroken = true;
      return undefined;
    }
  }
  return worker;
}

/** Resolves with the worker's result, or `undefined` if it can't do it — never throws. */
function downscaleInWorker(file: Blob): Promise<DownscaleResult | undefined> {
  const w = getWorker();
  if (!w) return Promise.resolve(undefined);
  const id = ++seq;
  return new Promise<DownscaleResult | undefined>((resolve) => {
    const onMessage = (event: MessageEvent<DownscaleReply>) => {
      if (event.data?.id !== id) return; // another page's reply
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      resolve(
        event.data.ok
          ? {
              blob: event.data.blob,
              contentType: "image/jpeg",
              bytes: event.data.blob.size,
              width: event.data.width,
              height: event.data.height,
            }
          : undefined,
      );
    };
    const onError = () => {
      w.removeEventListener("message", onMessage);
      w.removeEventListener("error", onError);
      resolve(undefined);
    };
    w.addEventListener("message", onMessage);
    w.addEventListener("error", onError);
    const request: DownscaleRequest = { id, blob: file };
    w.postMessage(request);
  });
}

/**
 * Downscale a picked photo to the measured target and re-encode as JPEG.
 *
 * Always re-encodes, even when the image is already small enough: a HEIC or PNG straight
 * off a phone would otherwise reach the model as a content type the presign rejects, and
 * stripping to JPEG also drops EXIF — including any GPS tag the camera attached, which has
 * no business in a note about a patient's ward.
 *
 * The worker is tried first (H11) and any failure falls through to the main thread, so a
 * browser quirk in the fast path costs jank rather than the capture.
 */
export async function downscaleForUpload(file: File | Blob): Promise<DownscaleResult> {
  const type = (file as File).type ?? "";
  if (type && !type.startsWith("image/")) throw new CaptureImageError("not_an_image");

  if (workerDownscaleSupported()) {
    const offThread = await downscaleInWorker(file);
    if (offThread) {
      if (offThread.bytes > MAX_UPLOAD_BYTES) throw new CaptureImageError("too_large");
      return offThread;
    }
  }

  const { source, width, height } = await decode(file);
  if (!width || !height) throw new CaptureImageError("decode_failed");

  const size = targetSize(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CaptureImageError("encode_failed");
  ctx.drawImage(source, 0, 0, size.width, size.height);
  if ("close" in source && typeof source.close === "function") source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new CaptureImageError("encode_failed");
  if (blob.size > MAX_UPLOAD_BYTES) throw new CaptureImageError("too_large");

  return {
    blob,
    contentType: "image/jpeg",
    bytes: blob.size,
    width: size.width,
    height: size.height,
  };
}
