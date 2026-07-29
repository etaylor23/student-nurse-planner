import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { STORE_INDEXES, type StoreName } from "../src/data/schema";
import type { SyncRow } from "../src/data/sync/protocol";

/**
 * Drift gate: every syncable store must have a server-side SK derivation.
 *
 * `DynamoRepository.skFor` is a `switch` on the store name that returns `undefined` for
 * anything it doesn't recognise — and `mergeRow` then **silently echoes the row back
 * without persisting it**. So a store added to `EntityMap`/`STORE_INDEXES` but forgotten
 * in `skFor` syncs happily on the device and never reaches the server: no error, no
 * warning, data quietly confined to one browser. This was nearly shipped when the
 * note-capture stores were added (spec-note-capture.md P3).
 *
 * The check is behavioural rather than a peek at the private method: push one row per
 * store through the real `syncPush` and assert the server kept it.
 */

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

/**
 * Stores that legitimately have no server SK. Adding to this list is a deliberate act:
 * it asserts "this data is never persisted server-side", so justify it here.
 */
const CLIENT_ONLY: ReadonlySet<StoreName> = new Set<StoreName>([
  // Bundled NMC reference data, shipped in the client bundle (spec §2.4) — global, not
  // user-owned, and never written back.
  "proficiencies",
]);

/** A minimal row per store: enough fields for `skFor` to build its SK. */
function seedItem(store: StoreName, id: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id,
    userId: "sub-coverage",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  switch (store) {
    case "logItems":
      return { ...base, createdAt: "2026-07-28T00:00:00.000Z", entityType: "SHIFT", entityId: "x" };
    case "medicationConditions":
      return { ...base, medicationId: "med-1", condition: "asthma" };
    case "calcStats":
      return { ...base, calcType: "TABLET_DOSE" };
    case "proficiencyProgress":
      return { ...base, proficiencyId: "prof_1.1" };
    case "proficiencyStatusEvents":
      return { ...base, progressId: "prog-1", createdAt: "2026-07-28T00:00:00.000Z" };
    case "evidenceLinks":
      return { ...base, proficiencyId: "prof_1.1" };
    case "skillProgress":
      return { ...base, skillId: "skill-1" };
    case "reflectionSections":
      return { ...base, reflectionId: "refl-1", stage: "DESCRIPTION" };
    case "tags":
      return { ...base, label: "Haematology" };
    case "reflectionTags":
      return { ...base, reflectionId: "refl-1", tagId: "tag-1" };
    default:
      return base;
  }
}

describe("sync coverage — every syncable store persists server-side", () => {
  const stores = (Object.keys(STORE_INDEXES) as StoreName[]).filter((s) => !CLIENT_ONLY.has(s));

  it.each(stores)("%s survives a push to the server", async (store) => {
    const sub = `sub-cov-${store}`;
    const repo = new DynamoRepository({
      doc: ddb.doc,
      tableName: ddb.tableName,
      principal: { sub },
    });
    const id = `${store}-1`;
    const row: SyncRow = {
      entityType: store,
      id,
      updatedAt: "2026-07-28T00:00:00.000Z",
      deleted: false,
      item: seedItem(store, id),
    };

    await repo.syncPush([row]);

    // The proof is a round-trip through the server, not the push's echo: `mergeRow`
    // returns the input unchanged when it has no SK, so only a pull distinguishes
    // "persisted" from "silently dropped".
    const pulled = await repo.syncPull();
    const found = pulled.find((r) => r.entityType === store && r.id === id);
    expect(
      found,
      `store "${store}" has no case in DynamoRepository.skFor, so its rows are silently ` +
        `dropped on push. Add one, or add the store to CLIENT_ONLY with a reason.`,
    ).toBeDefined();
  });
});
