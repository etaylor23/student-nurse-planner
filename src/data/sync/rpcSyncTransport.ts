import type { SyncRow, SyncTransport } from "./protocol";

export interface RpcSyncTransportOptions {
  /** API base, e.g. "/api" (same-origin via CloudFront) — mirrors `ApiRepository`. */
  apiBase: string;
  /** Returns a fresh Cognito ID token for the Authorization header. */
  getIdToken: () => Promise<string>;
  /** Per-request timeout (ms). Default 15s. */
  timeoutMs?: number;
  /** Max retry attempts for a transient failure (network/timeout/5xx/429). Default 3. */
  maxRetries?: number;
}

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * The production sync transport: POSTs `syncPull`/`syncPush` to the RPC router (§3/§5),
 * carrying the Cognito ID token. A thin sibling of `ApiRepository` — it speaks only the
 * two batch endpoints, so the sync layer never leaks the full RPC surface. The server
 * derives the partition owner from the verified token.
 *
 * Requests time out (a hung fetch used to keep sync "in flight" forever) and transient
 * failures — network errors, timeouts, 5xx, 429 — are retried with bounded exponential
 * backoff + jitter. A non-retryable 4xx (e.g. 401 expired auth) throws immediately so the
 * reconciler can surface it as a sync error rather than hammering the endpoint.
 */
export class RpcSyncTransport implements SyncTransport {
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(opts: RpcSyncTransportOptions) {
    this.apiBase = opts.apiBase.replace(/\/$/, "");
    this.getIdToken = opts.getIdToken;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.maxRetries = opts.maxRetries ?? 3;
  }

  private async rpc<T>(method: string, args: unknown[]): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.attempt<T>(method, args);
      } catch (err) {
        const retryable = err instanceof RetryableRpcError;
        if (!retryable || attempt >= this.maxRetries) {
          // Unwrap so callers see the underlying cause, not the retry marker.
          throw retryable ? (err as RetryableRpcError).cause : err;
        }
        // Exponential backoff with jitter: ~0.4s, 0.8s, 1.6s (+ up to 50% jitter).
        const base = 400 * 2 ** attempt;
        await sleep(base + Math.random() * base * 0.5);
        attempt++;
      }
    }
  }

  private async attempt<T>(method: string, args: unknown[]): Promise<T> {
    const token = await this.getIdToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await fetch(`${this.apiBase}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ method, args }),
        signal: controller.signal,
      });
    } catch (err) {
      // Network failure or timeout (abort) — always transient.
      throw new RetryableRpcError(
        err instanceof Error && err.name === "AbortError"
          ? new Error(`RPC ${method} timed out after ${this.timeoutMs}ms`)
          : (err as Error),
      );
    } finally {
      clearTimeout(timer);
    }

    const data = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      const error = new Error(data.detail || data.error || `RPC ${method} failed (${res.status})`);
      if (RETRYABLE_STATUS.has(res.status)) throw new RetryableRpcError(error);
      throw error;
    }
    return data.result as T;
  }

  pull(since?: string): Promise<SyncRow[]> {
    return this.rpc<SyncRow[]>("syncPull", since === undefined ? [] : [since]);
  }

  push(rows: SyncRow[]): Promise<SyncRow[]> {
    return this.rpc<SyncRow[]>("syncPush", [rows]);
  }
}

/** Internal marker: the wrapped failure is worth retrying. Never escapes `rpc`. */
class RetryableRpcError extends Error {
  constructor(readonly cause: Error) {
    super(cause.message);
    this.name = "RetryableRpcError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
