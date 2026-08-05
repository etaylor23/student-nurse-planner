/**
 * Bounded retry for the note-capture client path (spec-note-capture-hardening.md H7).
 *
 * The design case is a ward connection: UCLH WiFi drops a socket mid-upload, and the student
 * is standing in a corridor with a photo of their notes. Losing the capture there is worse
 * than waiting three seconds, so presign, the S3 PUT and the parse POST each get three goes
 * with exponential backoff and jitter (~1s, 3s, 9s) — slow on purpose, because a connection
 * that just failed is not helped by being hit again immediately.
 *
 * Retrying is only safe because the capture path is idempotent by construction: object keys
 * are the SHA-256 of the bytes (P41), the parse cache overwrites in place, and the photo
 * counter is claimed once per page per day — so a duplicate attempt cannot double-count, or
 * upload two copies of the same page.
 *
 * `RpcSyncTransport` has its own copy of this shape for the sync path. It stays separate:
 * that path retries a batch of rows on a 15s timeout with a much tighter cadence (~0.4s),
 * and merging the two would mean one set of numbers serving two very different waits.
 */

/** Transient by status: a timeout, a throttle, or a server that failed to answer properly. */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/** Our own errors carry the status they came from, so classification is explicit. */
interface WithStatus {
  status?: number;
}

export interface RetryNotice {
  /** 1-based number of the attempt about to be made (so the FIRST retry is 2). */
  attempt: number;
  /** Total attempts allowed, including the first. */
  of: number;
  delayMs: number;
}

export interface RetryOptions {
  /** Total attempts including the first. Default 3. */
  attempts?: number;
  /** Called before each wait — the progress UI says "trying again" rather than dying. */
  onRetry?: (notice: RetryNotice) => void;
  /** Injected by tests so the backoff is instant; production sleeps for real. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected by tests to make jitter deterministic. */
  jitter?: () => number;
}

/**
 * Is this failure worth another go?
 *
 * A cancel is never retried — the student closed the dialog, and the whole point of an
 * `AbortSignal` is that it stops work. Any other 4xx is a refusal the server means: a cap, a
 * bad key, an expired signature. Those need a different request, not the same one again.
 *
 * A failure with NO status never reached the server (DNS, a dropped socket, `fetch` rejecting
 * outright), which is the ward-WiFi case and always transient. That is deliberately narrowed
 * to network-shaped errors: a `TypeError` from our own code should surface on the first go
 * rather than be tried three times.
 */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return false;
  const status = (err as WithStatus).status;
  if (typeof status === "number") return RETRYABLE_STATUS.has(status);
  // `fetch` rejects with a TypeError when it never got a response at all.
  return err instanceof TypeError || err.name === "TypeError" || err.name === "NetworkError";
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run `op`, retrying transient failures with exponential backoff + jitter.
 *
 * The last failure is rethrown untouched, so callers keep their own typed errors and their
 * own messages — this adds waiting, never a new failure mode.
 */
export async function withRetry<T>(op: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? defaultSleep;
  const jitter = opts.jitter ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (attempt >= attempts || !isTransient(err)) throw err;
      // ~1s, 3s, 9s, plus up to 50% jitter so several pages don't retry in lockstep.
      const base = 1000 * 3 ** (attempt - 1);
      const delayMs = Math.round(base + jitter() * base * 0.5);
      opts.onRetry?.({ attempt: attempt + 1, of: attempts, delayMs });
      await sleep(delayMs);
    }
  }
}
