import type { AiMessage, AiThread } from "../../domain/types";

/**
 * Client for the AI recall feature (spec-ai-recall.md). Two transports, by necessity:
 *
 *  - **the ask stream** goes to a Lambda Function URL, because API Gateway can't stream
 *    responses. Same Cognito ID token, verified in-Lambda (D7).
 *  - **thread reads** go through the ordinary `/api/rpc` router, so they inherit the
 *    existing authorizer and AVP gate unchanged.
 */

export type AskErrorCode = "CAP" | "KILLED" | "THROTTLED" | "UPSTREAM" | "THREAD_FULL";

export interface AskMeta {
  threadId: string;
  messageId: string;
  /** Questions left today after this one (D11) — drives the countdown. */
  remaining?: number;
  resetsAt?: string;
}

export interface AskHandlers {
  onMeta(meta: AskMeta): void;
  onDelta(text: string): void;
  onDone(payload: { stopReason: string; usage?: Record<string, number> }): void;
  onError(code: AskErrorCode, message: string): void;
}

export interface AiClientOptions {
  /** Function URL for the streaming ask endpoint. */
  askUrl: string;
  /** RPC base, e.g. "/api" — mirrors ApiRepository. */
  apiBase: string;
  getIdToken: () => Promise<string>;
}

export interface ThreadDetail {
  thread: AiThread;
  messages: AiMessage[];
}

export class AiClient {
  private readonly askUrl: string;
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;
  /**
   * Session read-cache (D16): the server stays the source of truth, this just makes
   * reopening the overlay instant. Dropped on every mutation and on page reload.
   */
  private threadCache = new Map<string, ThreadDetail>();
  private listCache: AiThread[] | null = null;

  constructor(opts: AiClientOptions) {
    this.askUrl = opts.askUrl.replace(/\/$/, "");
    this.apiBase = opts.apiBase.replace(/\/$/, "");
    this.getIdToken = opts.getIdToken;
  }

  private async rpc<T>(method: string, args: unknown[]): Promise<T> {
    const token = await this.getIdToken();
    const res = await fetch(`${this.apiBase}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, args }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok) throw new Error(data.error || `RPC ${method} failed (${res.status})`);
    return data.result as T;
  }

  async listThreads(force = false): Promise<AiThread[]> {
    if (!force && this.listCache) return this.listCache;
    this.listCache = await this.rpc<AiThread[]>("ai/listThreads", []);
    return this.listCache;
  }

  async getThread(threadId: string, force = false): Promise<ThreadDetail> {
    const cached = this.threadCache.get(threadId);
    if (!force && cached) return cached;
    const detail = await this.rpc<ThreadDetail>("ai/getThread", [threadId]);
    this.threadCache.set(threadId, detail);
    return detail;
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.rpc<{ ok: true }>("ai/deleteThread", [threadId]);
    this.threadCache.delete(threadId);
    this.listCache = null;
  }

  async sendFeedback(
    threadId: string,
    messageId: string,
    feedback: "UP" | "DOWN",
    comment?: string,
  ): Promise<void> {
    await this.rpc<{ ok: true }>("ai/feedback", [threadId, messageId, feedback, comment]);
    this.threadCache.delete(threadId);
  }

  /** Invalidate caches after an ask, so the next open reflects the new turns. */
  invalidate(threadId?: string): void {
    this.listCache = null;
    if (threadId) this.threadCache.delete(threadId);
  }

  /**
   * Stream an answer. Resolves when the stream ends (normally or via `signal`).
   *
   * Uses `fetch` + a ReadableStream reader rather than `EventSource`, because
   * EventSource can't send an Authorization header or use POST.
   */
  async ask(
    question: string,
    threadId: string | undefined,
    handlers: AskHandlers,
    signal?: AbortSignal,
  ): Promise<void> {
    const token = await this.getIdToken();
    let res: Response;
    try {
      res = await fetch(this.askUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(threadId ? { question, threadId } : { question }),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      handlers.onError("UPSTREAM", "Couldn't reach PlaceMate — check your connection.");
      return;
    }

    if (!res.ok || !res.body) {
      handlers.onError(
        "UPSTREAM",
        res.status === 401
          ? "Your session expired — sign in again."
          : "That didn't work — try again.",
      );
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by a blank line.
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          this.handleFrame(buffer.slice(0, split), handlers);
          buffer = buffer.slice(split + 2);
        }
      }
      if (buffer.trim()) this.handleFrame(buffer, handlers);
    } catch (err) {
      // An aborted read is the user pressing stop — the partial answer stays on screen.
      if ((err as Error)?.name !== "AbortError") {
        handlers.onError("UPSTREAM", "The answer was cut short — try again.");
      }
    }
  }

  private handleFrame(frame: string, handlers: AskHandlers): void {
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLine.slice(5).trim()) as Record<string, unknown>;
    } catch {
      return; // ignore keep-alives / partial frames
    }
    if (typeof payload.threadId === "string") {
      handlers.onMeta(payload as unknown as AskMeta);
    } else if (typeof payload.text === "string") {
      handlers.onDelta(payload.text);
    } else if (typeof payload.stopReason === "string") {
      handlers.onDone(payload as { stopReason: string; usage?: Record<string, number> });
    } else if (typeof payload.code === "string") {
      handlers.onError(payload.code as AskErrorCode, String(payload.message ?? ""));
    }
  }
}
