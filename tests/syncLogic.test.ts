import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DirectSyncTransport } from "./helpers/directSyncTransport";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { PUSH_CHUNK, SyncRepository } from "../src/data/sync/syncRepository";
import { PlannerDb } from "../src/data/dexie/db";
import type { Shift } from "../src/domain/types";

// Sync-logic tests (spec-backend-dynamodb.md §5) — the correctness proof for Phase 3.
// A "device" is a SyncRepository over its own local Dexie (fake-indexeddb) talking to a
// DynamoRepository on an in-process DynamoDB (dynalite) via a direct transport, so the
// REAL server LWW + tombstone merge runs. Two devices for the same Cognito `sub` model a
// user on two machines; convergence is asserted on their local reads.

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let n = 0;
/** A server (DynamoRepository) bound to `sub`, sharing the one dynalite table. */
function server(sub: string) {
  return new DynamoRepository({ doc: ddb.doc, tableName: ddb.tableName, principal: { sub } });
}
/**
 * A device for `sub`: a SyncRepository over a fresh local Dexie. The `db` + `srv` handles
 * are returned so tests can inspect the durable outbox/record-meta and the server state.
 */
function device(sub: string) {
  const db = new PlannerDb(`sync-test-${n++}-${Math.random().toString(36).slice(2)}`);
  const srv = server(sub);
  const transport = new DirectSyncTransport(srv);
  const repo = new SyncRepository({ db, userId: sub, transport, autoSync: false });
  return { repo, transport, db, srv };
}

const baseShift = (userId: string) =>
  ({
    userId,
    date: "2026-05-01",
    shiftType: "EARLY",
    entryMode: "NET",
    netHours: 7,
    isSimulated: false,
    status: "PLANNED",
  }) as Omit<Shift, "id" | "createdAt" | "updatedAt">;

describe("sync — outbox flush idempotency", () => {
  it("pushes a local write to the server; a double flush yields no duplicate and no error", async () => {
    const { repo: a, srv, db } = device(`sub-idem-${n}`);
    const u = await a.getCurrentUser();
    const shift = await a.createShift(baseShift(u.id));

    await a.sync();
    // The write reached the server exactly once.
    expect((await srv.listShifts(u.id)).map((s) => s.id)).toEqual([shift.id]);

    // Flushing again must not error, re-push a duplicate, or resurrect anything.
    await a.sync();
    await a.sync();
    expect(await srv.listShifts(u.id)).toHaveLength(1);
    // The outbox entry for the shift was cleared once confirmed.
    expect(await db.outbox.get(`shifts#${shift.id}`)).toBeUndefined();
  });
});

describe("sync — LWW resolution (record-level, server-authoritative)", () => {
  it("the later edit wins on both devices; the older edit loses regardless of push order", async () => {
    const sub = `sub-lww-${n}`;
    const a = device(sub);
    const b = device(sub);

    // Seed a shared shift and converge it onto both devices.
    const ua = await a.repo.getCurrentUser();
    await b.repo.getCurrentUser();
    const shift = await a.repo.createShift(baseShift(ua.id));
    await a.repo.sync();
    await b.repo.sync();
    expect((await b.repo.getShift(shift.id))?.status).toBe("PLANNED");

    // Both edit the SAME record locally. B edits AFTER A, so B carries the newer clock.
    await a.repo.updateShift(shift.id, { supervisingRnName: "Edited by A" });
    await sleep(4);
    await b.repo.updateShift(shift.id, { supervisingRnName: "Edited by B" });

    // Push A first, then B — B is newer, so server LWW keeps B even though A arrived first.
    await a.repo.sync();
    await b.repo.sync();
    // A pulls again and must converge onto B's newer value (server-authoritative).
    await a.repo.sync();

    expect((await a.repo.getShift(shift.id))?.supervisingRnName).toBe("Edited by B");
    expect((await b.repo.getShift(shift.id))?.supervisingRnName).toBe("Edited by B");
  });

  it("does not clobber a newer local pending edit with an older remote row on pull", async () => {
    const sub = `sub-lww2-${n}`;
    const a = device(sub);
    const b = device(sub);

    const ua = await a.repo.getCurrentUser();
    await b.repo.getCurrentUser();
    const shift = await a.repo.createShift(baseShift(ua.id));
    await a.repo.sync();
    await b.repo.sync();

    // B pushes an edit; A then makes a strictly-later local edit but hasn't synced yet.
    await b.repo.updateShift(shift.id, { supervisingRnName: "B (older)" });
    await b.repo.sync();
    await sleep(4);
    await a.repo.updateShift(shift.id, { supervisingRnName: "A (newer)" });

    // A syncs: the pull carries B's older row, which must NOT overwrite A's newer pending edit.
    await a.repo.sync();
    expect((await a.repo.getShift(shift.id))?.supervisingRnName).toBe("A (newer)");
    // ...and A's newer edit then wins everywhere.
    await b.repo.sync();
    expect((await b.repo.getShift(shift.id))?.supervisingRnName).toBe("A (newer)");
  });
});

describe("sync — tombstone lifecycle", () => {
  it("local delete → tombstone pushed → pulled by another device → local purge", async () => {
    const sub = `sub-tomb-${n}`;
    const a = device(sub);
    const b = device(sub);

    const ua = await a.repo.getCurrentUser();
    await b.repo.getCurrentUser();
    const shift = await a.repo.createShift(baseShift(ua.id));
    await a.repo.sync();
    await b.repo.sync();
    expect(await b.repo.getShift(shift.id)).toBeDefined();

    // Delete on A and push — the server holds a tombstone; A's local row is gone immediately.
    await a.repo.deleteShift(shift.id);
    expect(await a.repo.getShift(shift.id)).toBeUndefined();
    await a.repo.sync();

    // B pulls the tombstone and purges its local copy.
    await b.repo.sync();
    expect(await b.repo.getShift(shift.id)).toBeUndefined();
    expect(await b.repo.listShifts(ua.id)).toHaveLength(0);
    // The purge is durable: B's record clock marks the row deleted.
    expect((await b.db.recordMeta.get(`shifts#${shift.id}`))?.deleted).toBe(true);
  });
});

describe("sync — offline → reconnect convergence", () => {
  it("queues writes while offline and flushes them all on reconnect", async () => {
    const { repo: a, transport, srv, db } = device(`sub-offline-${n}`);
    const u = await a.getCurrentUser();

    // Go offline, make two writes, and attempt to sync — it must not throw or lose writes.
    transport.online = false;
    const s1 = await a.createShift({ ...baseShift(u.id), date: "2026-05-01" });
    const s2 = await a.createShift({ ...baseShift(u.id), date: "2026-05-02" });
    await a.sync();
    expect(await srv.listShifts(u.id)).toHaveLength(0); // nothing reached the server
    // Both writes are still readable locally (offline-capable) and still queued.
    expect((await a.listShifts(u.id)).map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
    expect(await db.outbox.get(`shifts#${s1.id}`)).toBeDefined();

    // Reconnect and sync — the durable outbox flushes.
    transport.online = true;
    await a.sync();
    expect((await srv.listShifts(u.id)).map((s) => s.id).sort()).toEqual([s1.id, s2.id].sort());
  });

  it("survives a forced re-login: a >30-day-offline outbox flushes after re-instantiation", async () => {
    const sub = `sub-relogin-${n}`;
    const dbName = `sync-relogin-${n++}`;
    const srv = server(sub);

    // Device session 1: offline write, then "the session dies" (dispose) with it still queued.
    const t1 = new DirectSyncTransport(srv);
    t1.online = false;
    const dev1 = new SyncRepository({
      db: new PlannerDb(dbName),
      userId: sub,
      transport: t1,
      autoSync: false,
    });
    const u = await dev1.getCurrentUser();
    const shift = await dev1.createShift(baseShift(u.id));
    await dev1.sync(); // offline — stays in the outbox
    dev1.dispose();

    // Re-login: a brand-new SyncRepository over the SAME durable local DB, now online.
    const t2 = new DirectSyncTransport(srv);
    const dev2 = new SyncRepository({
      db: new PlannerDb(dbName),
      userId: sub,
      transport: t2,
      autoSync: false,
    });
    await dev2.sync();
    // The write survived and reached the server — nothing lost.
    expect((await srv.listShifts(u.id)).map((s) => s.id)).toContain(shift.id);
    dev2.dispose();
  });

  it("a fresh signed-in device adopts the server profile instead of clobbering it", async () => {
    const sub = `sub-profile-${n}`;
    const a = device(sub);
    // Device A customises the profile and pushes it to the server.
    await a.repo.getCurrentUser();
    await a.repo.updateUser({ displayName: "Priya", currentPart: 2 });
    await a.repo.sync();

    // Device B is brand new: on first read it seeds a DEFAULT user ("Me", part 1) locally.
    const b = device(sub);
    const seeded = await b.repo.getCurrentUser();
    expect(seeded.displayName).toBe("Me");

    // The first sync must ADOPT the server profile, not push the seeded default over it.
    await b.repo.sync();
    const afterB = await b.repo.getCurrentUser();
    expect(afterB.displayName).toBe("Priya");
    expect(afterB.currentPart).toBe(2);

    // And the server profile is unchanged — B never clobbered it.
    await a.repo.sync();
    const afterA = await a.repo.getCurrentUser();
    expect(afterA.displayName).toBe("Priya");
    expect(afterA.currentPart).toBe(2);
  });

  it("pushes a backlog larger than one chunk in full, exactly once", async () => {
    const { repo: a, srv } = device(`sub-chunk-${n}`);
    const u = await a.getCurrentUser();
    const count = PUSH_CHUNK + 10; // spans two push chunks
    for (let i = 0; i < count; i++) {
      const date = new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10);
      await a.createShift({ ...baseShift(u.id), date });
    }
    await a.sync();
    const ids = (await srv.listShifts(u.id)).map((s) => s.id);
    expect(ids).toHaveLength(count); // every row reached the server
    expect(new Set(ids).size).toBe(count); // and none duplicated
  });

  it("surfaces a sync failure and keeps the outbox intact for retry", async () => {
    const { repo: a, transport, srv, db } = device(`sub-fail-${n}`);
    const u = await a.getCurrentUser();
    const shift = await a.createShift(baseShift(u.id));

    transport.online = false; // every pull/push rejects
    await a.sync();

    const status = a.getSyncStatus();
    expect(status.phase).toBe("error");
    expect(status.lastError).toBeTruthy();
    // Nothing reached the server, and the write is still queued for a later retry.
    expect(await srv.listShifts(u.id)).toHaveLength(0);
    expect(await db.outbox.get(`shifts#${shift.id}`)).toBeDefined();

    // Recovery: back online, the same durable outbox flushes cleanly.
    transport.online = true;
    await a.sync();
    expect((await srv.listShifts(u.id)).map((s) => s.id)).toEqual([shift.id]);
    expect(a.getSyncStatus().phase).toBe("idle");
  });

  it("two devices creating independently both converge to the union", async () => {
    const sub = `sub-converge-${n}`;
    const a = device(sub);
    const b = device(sub);
    const ua = await a.repo.getCurrentUser();
    const ub = await b.repo.getCurrentUser();

    const x = await a.repo.createShift({ ...baseShift(ua.id), date: "2026-05-01" });
    const y = await b.repo.createShift({ ...baseShift(ub.id), date: "2026-05-02" });

    // Round-trip both directions until settled.
    await a.repo.sync();
    await b.repo.sync();
    await a.repo.sync();
    await b.repo.sync();

    const idsA = (await a.repo.listShifts(ua.id)).map((s) => s.id).sort();
    const idsB = (await b.repo.listShifts(ub.id)).map((s) => s.id).sort();
    expect(idsA).toEqual([x.id, y.id].sort());
    expect(idsB).toEqual([x.id, y.id].sort());
  });
});
