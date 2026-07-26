/**
 * SSE frame helpers for the ask stream (spec-ai-recall.md §Streaming protocol).
 * Frames: meta (first) · delta (repeated) · done (last) · error (terminal).
 */

export type AskErrorCode = "CAP" | "KILLED" | "THROTTLED" | "UPSTREAM" | "THREAD_FULL";

export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function writeMeta(
  stream: ResponseStream,
  meta: {
    threadId: string;
    messageId: string;
    /** Questions left today — the UI shows a countdown from ~5 (D11). */
    remaining?: number;
    resetsAt?: string;
  },
): void {
  stream.write(sseFrame("meta", meta));
}

export function writeDelta(stream: ResponseStream, text: string): void {
  stream.write(sseFrame("delta", { text }));
}

export function writeDone(
  stream: ResponseStream,
  payload: { stopReason: string; usage?: Record<string, number> },
): void {
  stream.write(sseFrame("done", payload));
}

export function writeError(stream: ResponseStream, code: AskErrorCode, message: string): void {
  stream.write(sseFrame("error", { code, message }));
}
