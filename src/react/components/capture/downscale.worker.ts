/// <reference lib="webworker" />
import { JPEG_QUALITY, targetSize } from "./downscaleTarget";

/**
 * Downscale a photo off the main thread (spec-note-capture-hardening.md H11).
 *
 * Decoding a 6 MB phone photo and re-encoding it at 2400px is the heaviest local work the app
 * ever does — hundreds of milliseconds on an older phone, all of it on the main thread, at
 * exactly the moment the student has just taken the photo and is watching for something to
 * happen. Nothing here is different from the main-thread path except where it runs:
 * `createImageBitmap` + `OffscreenCanvas` are the worker-safe equivalents of the `<canvas>`
 * dance, and they share the measured constants rather than copying them.
 *
 * `imageOrientation: "from-image"` is load-bearing, as on the main thread: a portrait photo
 * handed to the vision model sideways defeats the reading-order sort (P36) before it starts.
 */

export interface DownscaleRequest {
  id: number;
  blob: Blob;
}

export type DownscaleReply =
  | { id: number; ok: true; blob: Blob; width: number; height: number }
  | { id: number; ok: false; code: "decode_failed" | "encode_failed" };

self.onmessage = async (event: MessageEvent<DownscaleRequest>) => {
  const { id, blob } = event.data;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    (self as unknown as Worker).postMessage({ id, ok: false, code: "decode_failed" });
    return;
  }
  try {
    const size = targetSize(bitmap.width, bitmap.height);
    if (!size.width || !size.height) throw new Error("empty image");
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const out = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
    const reply: DownscaleReply = {
      id,
      ok: true,
      blob: out,
      width: size.width,
      height: size.height,
    };
    (self as unknown as Worker).postMessage(reply);
  } catch {
    (self as unknown as Worker).postMessage({ id, ok: false, code: "encode_failed" });
  } finally {
    bitmap.close();
  }
};
