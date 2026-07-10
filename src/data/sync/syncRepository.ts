import type { Table } from "dexie";
import { DexieRepository } from "../dexie/dexieRepository";
import { PlannerDb } from "../dexie/db";
import { STORE_INDEXES } from "../schema";
import { nowIso } from "../../domain/ids";
import type { SyncRow, SyncTransport } from "./protocol";

/**
 * Local-first sync (spec-backend-dynamodb.md §5). `SyncRepository` IS a `DexieRepository`
 * (the "local half") plus a durable, state-based outbox and a background reconciler.
 * Reads/writes hit local Dexie INSTANTLY (offline-capable) via the inherited methods; the
 * one addition is that every syncable mutation is captured into the outbox and a debounced
 * sync is scheduled. Conflict resolution is record-level, server-authoritative LWW by
 * `updatedAt` with tombstone deletes — identical to the server's write model.
 *
 * The local half is keyed by the Cognito `sub` (passed as the local user id), so rows
 * pulled from the server (which carry `userId = sub`) are visible to lists scoped to
 * `getCurrentUser().id`. Guest mode keeps using a bare `DexieRepository`.
 */

/** A single captured domain-store mutation (a put, or a delete carrying its pre-image). */
interface TrackedChange {
  entityType: string;
  item: Record<string, unknown>;
  deleted: boolean;
}

/** The Dexie `Table` mutators the tracker wraps — a narrow structural view (no `any`). */
interface MutableTable {
  put(item: Record<string, unknown>, key?: string): Promise<unknown>;
  bulkPut(items: readonly Record<string, unknown>[], ...rest: unknown[]): Promise<unknown>;
  delete(key: string): Promise<void>;
  bulkDelete(keys: readonly string[]): Promise<void>;
  get(key: string): Promise<Record<string, unknown> | undefined>;
  bulkGet(keys: readonly string[]): Promise<(Record<string, unknown> | undefined)[]>;
}

/**
 * Reference data is bundled in the client and NEVER stored server-side (§2.4), so it must
 * never enter the outbox: the whole `proficiencies` store, plus the baseline rows of
 * `skills`/`subjects`/`breakRules` (which carry `userId === null`).
 */
function isSyncable(entityType: string, item: Record<string, unknown> | undefined): boolean {
  if (entityType === "proficiencies") return false;
  if (item && item.userId === null) return false;
  return true;
}

/**
 * Wraps every domain-store table's mutators (`put`/`bulkPut`/`delete`/`bulkDelete`) so that
 * every write the inherited `DexieRepository` methods perform is captured — one generic
 * seam rather than 45 hand-mirrored methods, so the outbox can't drift from the repo.
 * Deletes fetch the pre-image first so a tombstone carries the full record (the server
 * derives its storage key from the item's fields). `suspended` turns capture off while the
 * reconciler applies pulled rows, so remote applies don't loop back into the outbox.
 */
class OutboxTracker {
  suspended = false;

  constructor(
    db: PlannerDb,
    private readonly onChange: (change: TrackedChange) => Promise<void>,
  ) {
    // Wrap the PROPERTY accessor (`db.shifts`) that DexieRepository actually calls — Dexie
    // exposes `db.<store>` and `db.table("<store>")` as distinct wrapper instances over the
    // same object store, so wrapping `db.table(name)` would miss the repo's writes entirely.
    const tables = db as unknown as Record<string, MutableTable>;
    for (const name of Object.keys(STORE_INDEXES)) {
      this.instrument(tables[name], name);
    }
  }

  private instrument(t: MutableTable, entityType: string): void {
    const origPut = t.put.bind(t);
    const origBulkPut = t.bulkPut.bind(t);
    const origDelete = t.delete.bind(t);
    const origBulkDelete = t.bulkDelete.bind(t);
    const origGet = t.get.bind(t);
    const origBulkGet = t.bulkGet.bind(t);

    t.put = async (item, key) => {
      const res = await origPut(item, key);
      await this.record(entityType, item, false);
      return res;
    };
    t.bulkPut = async (items, ...rest) => {
      const res = await origBulkPut(items, ...rest);
      for (const item of items) await this.record(entityType, item, false);
      return res;
    };
    t.delete = async (key) => {
      if (this.suspended) return origDelete(key);
      const pre = await origGet(key);
      const res = await origDelete(key);
      if (pre) await this.record(entityType, pre, true);
      return res;
    };
    t.bulkDelete = async (keys) => {
      if (this.suspended) return origBulkDelete(keys);
      const pres = await origBulkGet(keys);
      const res = await origBulkDelete(keys);
      for (const pre of pres) if (pre) await this.record(entityType, pre, true);
      return res;
    };
  }

  private async record(
    entityType: string,
    item: Record<string, unknown>,
    deleted: boolean,
  ): Promise<void> {
    if (this.suspended || !isSyncable(entityType, item)) return;
    await this.onChange({ entityType, item: { ...item }, deleted });
  }
}

export interface SyncRepositoryOptions {
  /** The local Dexie database — namespace it per Cognito `sub` so devices/users don't collide. */
  db: PlannerDb;
  /** The Cognito `sub` — the local user id AND the server partition owner. */
  userId: string;
  transport: SyncTransport;
  /** Wire load/online/poll/debounce triggers. Default true; tests pass false and drive `sync()`. */
  autoSync?: boolean;
  /** Post-mutation debounce (ms) before a sync fires. */
  debounceMs?: number;
  /** Light periodic poll interval (ms) while online. */
  pollMs?: number;
}

export class SyncRepository extends DexieRepository {
  private readonly transport: SyncTransport;
  private readonly tracker: OutboxTracker;
  private readonly autoSync: boolean;
  private readonly debounceMs: number;
  private readonly pollMs: number;

  private inflight: Promise<void> | null = null;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setInterval>;
  private onlineHandler?: () => void;
  private disposed = false;

  constructor(opts: SyncRepositoryOptions) {
    super(opts.db, opts.userId);
    this.transport = opts.transport;
    this.autoSync = opts.autoSync ?? true;
    this.debounceMs = opts.debounceMs ?? 800;
    this.pollMs = opts.pollMs ?? 60_000;
    // Capture every domain write into the outbox (spec §5 state-based write path).
    this.tracker = new OutboxTracker(this.db, (c) => this.recordChange(c));
    this.wireTriggers();
  }

  /** The instrumented `db.<store>` property (NOT `db.table(name)`, a different instance). */
  private domainTable(name: string): Table<Record<string, unknown>, string> {
    return (this.db as unknown as Record<string, Table<Record<string, unknown>, string>>)[name];
  }

  /**
   * Per-user "Clear all data" (spec §5 / repository.ts): soft-delete every user-owned
   * record so the wipe converges to the server, keeping the account profile + bundled
   * reference data (never server-stored) intact. Deviates from the base (which drops the
   * whole DB + reseeds a default user) so the durable outbox + sync clocks survive.
   */
  override async resetDatabase(): Promise<void> {
    for (const name of Object.keys(STORE_INDEXES)) {
      if (name === "users" || name === "proficiencies") continue;
      const table = this.domainTable(name);
      const rows = (await table.toArray()) as Array<Record<string, unknown>>;
      const purge = rows.filter((r) => r.userId !== null).map((r) => String(r.id));
      if (purge.length > 0) await table.bulkDelete(purge); // instrumented → tombstones enqueued
    }
    await this.sync();
  }

  // ---- outbox capture ----
  private async recordChange(change: TrackedChange): Promise<void> {
    const id = String(change.item.id);
    const key = `${change.entityType}#${id}`;
    // The LWW clock stamped at capture: what the server merges by and the client compares.
    const updatedAt = nowIso();
    await this.db.outbox.put({
      key,
      entityType: change.entityType,
      id,
      updatedAt,
      deleted: change.deleted,
      item: change.item,
    });
    await this.db.recordMeta.put({
      key,
      entityType: change.entityType,
      id,
      updatedAt,
      deleted: change.deleted,
    });
    this.scheduleSync();
  }

  // ---- reconciler ----
  /**
   * A full reconcile: flush the outbox, then pull + LWW-merge. Coalesced (a second call
   * while one is in flight rides the same promise) and error-swallowing — a network/offline
   * failure leaves the outbox + watermark intact for a later retry. Safe to call any time.
   */
  async sync(): Promise<void> {
    if (this.disposed) return;
    if (this.inflight) return this.inflight;
    this.inflight = this.reconcile()
      .catch(() => {
        /* offline / transient — keep durable state for the next trigger */
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  private isOffline(): boolean {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  }

  private async reconcile(): Promise<void> {
    if (this.isOffline()) return;
    await this.flushOutbox();
    await this.pull();
  }

  private async flushOutbox(): Promise<void> {
    const pending = await this.db.outbox.toArray();
    if (pending.length === 0) return;
    const rows: SyncRow[] = pending.map((p) => ({
      entityType: p.entityType,
      id: p.id,
      updatedAt: p.updatedAt,
      deleted: p.deleted,
      item: p.item,
    }));
    // Push first; if this throws we keep the outbox untouched (retry later). The server
    // upsert is idempotent by id + LWW, so a double flush never duplicates.
    const resolved = await this.transport.push(rows);
    // Clear only entries we pushed that a concurrent local write hasn't superseded (its
    // updatedAt would have changed during the push await) — no write is ever lost.
    for (const p of pending) {
      const cur = await this.db.outbox.get(p.key);
      if (cur && cur.updatedAt === p.updatedAt) await this.db.outbox.delete(p.key);
    }
    await this.applyRemote(resolved);
  }

  private async pull(): Promise<void> {
    const stored = (await this.db.syncMeta.get("lastPull"))?.value;
    const rows = await this.transport.pull(stored);
    await this.applyRemote(rows);
    // Advance the watermark to (newest row seen − 1 ms). The server filters `updatedAt >
    // since` (spec §5, strict), and millisecond clocks collide: another device can mint a
    // row at the same ms as our current max AFTER we advance. Backing off 1 ms means the
    // next pull re-includes that final-ms boundary — harmless, since the LWW merge is
    // idempotent — so no concurrently-minted row is ever skipped. Never moves backwards.
    let maxTs = "";
    for (const r of rows) if (r.updatedAt > maxTs) maxTs = r.updatedAt;
    if (maxTs) {
      const safe = new Date(new Date(maxTs).getTime() - 1).toISOString();
      const next = stored && stored > safe ? stored : safe;
      await this.db.syncMeta.put({ key: "lastPull", value: next });
    }
  }

  /**
   * LWW-merge a batch of remote rows into local Dexie. Apply a row only when its clock is
   * >= the local clock (server-authoritative — ties apply); older rows are skipped so a
   * pending local edit is never clobbered. Tombstones delete locally + purge any superseded
   * outbox entry. Runs with capture suspended so applies don't re-enter the outbox.
   */
  private async applyRemote(rows: SyncRow[]): Promise<void> {
    this.tracker.suspended = true;
    try {
      for (const row of rows) {
        const key = `${row.entityType}#${row.id}`;
        const localMeta = await this.db.recordMeta.get(key);
        if (localMeta && row.updatedAt < localMeta.updatedAt) continue; // local is newer
        const table = this.domainTable(row.entityType);
        if (row.deleted) {
          await table.delete(row.id);
        } else {
          await table.put(row.item);
        }
        await this.db.recordMeta.put({
          key,
          entityType: row.entityType,
          id: row.id,
          updatedAt: row.updatedAt,
          deleted: row.deleted,
        });
        const ob = await this.db.outbox.get(key);
        if (ob && ob.updatedAt <= row.updatedAt) await this.db.outbox.delete(key);
      }
    } finally {
      this.tracker.suspended = false;
    }
  }

  // ---- triggers (spec §5: app load, `online`, debounced post-mutation, light poll) ----
  private scheduleSync(): void {
    if (!this.autoSync || this.disposed) return;
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.sync();
    }, this.debounceMs);
  }

  private wireTriggers(): void {
    if (!this.autoSync || typeof window === "undefined") return;
    this.onlineHandler = () => void this.sync();
    window.addEventListener("online", this.onlineHandler);
    this.pollTimer = setInterval(() => {
      if (!this.isOffline()) void this.sync();
    }, this.pollMs);
    void this.sync(); // app load
  }

  /** Tear down timers/listeners (call on sign-out / unmount). */
  dispose(): void {
    this.disposed = true;
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
    if (this.onlineHandler && typeof window !== "undefined") {
      window.removeEventListener("online", this.onlineHandler);
    }
  }
}
