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
 */

/** Long-edge target. Do not lower this without re-running `scripts/eval-note-capture.ts`. */
export const LONG_EDGE = 2400;

/** JPEG quality. 0.85 measured clean; below ~0.7 introduces artefacts around thin pen strokes. */
export const JPEG_QUALITY = 0.85;

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

/**
 * Target dimensions preserving aspect ratio, capped on the long edge.
 * An image already within the cap is left alone — upscaling a small photo would invent
 * detail and cost bytes for nothing.
 */
export function targetSize(
  width: number,
  height: number,
  longEdge = LONG_EDGE,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= longEdge || longest === 0) return { width, height };
  const scale = longEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
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
 * Downscale a picked photo to the measured target and re-encode as JPEG.
 *
 * Always re-encodes, even when the image is already small enough: a HEIC or PNG straight
 * off a phone would otherwise reach the model as a content type the presign rejects, and
 * stripping to JPEG also drops EXIF — including any GPS tag the camera attached, which has
 * no business in a note about a patient's ward.
 */
export async function downscaleForUpload(file: File | Blob): Promise<DownscaleResult> {
  const type = (file as File).type ?? "";
  if (type && !type.startsWith("image/")) throw new CaptureImageError("not_an_image");

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
