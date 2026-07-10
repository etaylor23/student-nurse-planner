/**
 * Sync wire protocol (spec-backend-dynamodb.md §5). The two batch endpoints exchange
 * `SyncRow`s — a small envelope carrying the record-level LWW clock (`updatedAt`), the
 * tombstone flag (`deleted`), enough identity to route the row into the right store
 * (`entityType` + `id`), and the domain object itself (`item`). Both the server
 * (`DynamoRepository`) and the client (`SyncRepository`) speak this shape, so it lives in
 * a neutral module both can import without either depending on the other.
 */
export interface SyncRow {
  /** The `EntityMap`/store key — drives client store routing + server SK derivation. */
  entityType: string;
  /** The record's stable domain id (the Dexie primary key). */
  id: string;
  /** The LWW clock. Record-level, server-authoritative; ties (`==`) resolve to apply. */
  updatedAt: string;
  /** Tombstone flag — a soft delete synced like any other row. */
  deleted: boolean;
  /** The domain object (key/infra attributes stripped). For tombstones, the last state. */
  item: Record<string, unknown>;
}

/**
 * The client-side transport the reconciler drives. Production is an HTTP client hitting
 * the RPC router (`RpcSyncTransport`); tests bind it directly to a `DynamoRepository` on
 * dynalite so the real server LWW/tombstone logic is exercised without HTTP.
 */
export interface SyncTransport {
  /** Every row in the caller's partition changed since `since` (or all), incl. tombstones. */
  pull(since?: string): Promise<SyncRow[]>;
  /** State-based batch upsert; the server LWW-merges each row and returns the resolved set. */
  push(rows: SyncRow[]): Promise<SyncRow[]>;
}
