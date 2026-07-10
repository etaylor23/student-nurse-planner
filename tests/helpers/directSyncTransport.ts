import type { DynamoRepository } from "../../src/data/dynamo/dynamoRepository";
import type { SyncRow, SyncTransport } from "../../src/data/sync/protocol";

/**
 * A `SyncTransport` that calls a `DynamoRepository` directly (no HTTP), so the sync-logic
 * tests exercise the REAL server-side LWW + tombstone merge on dynalite. `online` toggles
 * an "offline" simulation: while false, pull/push reject, so the reconciler leaves the
 * durable outbox intact (proving offline writes survive to reconnect).
 */
export class DirectSyncTransport implements SyncTransport {
  online = true;

  constructor(private readonly server: DynamoRepository) {}

  async pull(since?: string): Promise<SyncRow[]> {
    if (!this.online) throw new Error("offline");
    return this.server.syncPull(since);
  }

  async push(rows: SyncRow[]): Promise<SyncRow[]> {
    if (!this.online) throw new Error("offline");
    return this.server.syncPush(rows);
  }
}
