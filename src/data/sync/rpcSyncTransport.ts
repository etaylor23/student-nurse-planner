import type { SyncRow, SyncTransport } from "./protocol";

export interface RpcSyncTransportOptions {
  /** API base, e.g. "/api" (same-origin via CloudFront) — mirrors `ApiRepository`. */
  apiBase: string;
  /** Returns a fresh Cognito ID token for the Authorization header. */
  getIdToken: () => Promise<string>;
}

/**
 * The production sync transport: POSTs `syncPull`/`syncPush` to the RPC router (§3/§5),
 * carrying the Cognito ID token. A thin sibling of `ApiRepository` — it speaks only the
 * two batch endpoints, so the sync layer never leaks the full RPC surface. The server
 * derives the partition owner from the verified token.
 */
export class RpcSyncTransport implements SyncTransport {
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;

  constructor(opts: RpcSyncTransportOptions) {
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
    const data = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      throw new Error(data.detail || data.error || `RPC ${method} failed (${res.status})`);
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
