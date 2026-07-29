import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { RelationshipStore } from "../src/data/dynamo/relationships";
import { deriveCounterparts, eraseUserCaptures, eraseUserData } from "../scripts/lib/admin";
import type { S3Client } from "@aws-sdk/client-s3";

// Proves the erasure core (scripts/lib/admin.ts, used by delete-user.ts) deletes a user's WHOLE partition —
// including soft-delete tombstones — plus the share/mentorship counterparts that live in
// other users' partitions, leaving nothing that references the erased user.

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

/** Rows in the sibling AI partition (chat threads/messages + the daily counters). */
async function countAi(sub: string): Promise<number> {
  const res = await ddb.doc.send(
    new QueryCommand({
      TableName: ddb.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `AI#${sub}` },
    }),
  );
  return res.Items?.length ?? 0;
}

async function count(sub: string): Promise<number> {
  const res = await ddb.doc.send(
    new QueryCommand({
      TableName: ddb.tableName,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `USER#${sub}` },
    }),
  );
  return res.Items?.length ?? 0;
}

describe("erase-user — GDPR erasure core", () => {
  it("deletes the whole partition incl. tombstones + cross-partition grants", async () => {
    const X = "erase-X";
    const Y = "erase-Y"; // X shares a record with Y
    const M = "erase-M"; // X names M as a mentor
    const O = "erase-O"; // O shares a record with X

    // A live row + a tombstone (soft delete) in X's own partition.
    await ddb.doc.send(
      new PutCommand({
        TableName: ddb.tableName,
        Item: { PK: `USER#${X}`, SK: "SHIFT#s1", id: "s1", owner: X, deleted: false },
      }),
    );
    await ddb.doc.send(
      new PutCommand({
        TableName: ddb.tableName,
        Item: { PK: `USER#${X}`, SK: "SHIFT#s2", id: "s2", owner: X, deleted: true, ttl: 123 },
      }),
    );

    const rel = new RelationshipStore(ddb.doc, ddb.tableName);
    await rel.shareRecord(X, "reflections", "r1", "EvidenceRecord", Y); // canonical in X, mirror in Y
    await rel.addMentorship(X, M); // MENTOR#M in X, MENTEE#X in M
    await rel.shareRecord(O, "reflections", "r2", "EvidenceRecord", X); // canonical in O, mirror in X

    // Pre-conditions.
    expect(await count(X)).toBe(5); // s1, s2(tombstone), SHARE#…#Y, MENTOR#M, SHAREDWITHME#O…
    expect(await count(Y)).toBe(1); // SHAREDWITHME mirror of X's share
    expect(await count(M)).toBe(1); // MENTEE mirror
    expect(await count(O)).toBe(1); // canonical of O's share to X

    // Dry run changes nothing.
    const dry = await eraseUserData(ddb.doc, ddb.tableName, X, { dryRun: true });
    expect(dry.partitionItems).toBe(5);
    expect(dry.counterparts).toBe(3);
    expect(await count(X)).toBe(5);

    // Execute.
    await eraseUserData(ddb.doc, ddb.tableName, X, { dryRun: false });

    expect(await count(X)).toBe(0); // partition + tombstone gone
    expect(await count(Y)).toBe(0); // share mirror gone
    expect(await count(M)).toBe(0); // mentee mirror gone
    expect(await count(O)).toBe(0); // O's canonical share to the erased user gone
  });

  it("also erases the sibling AI partition (chat + daily counters)", async () => {
    const A = "erase-ai";
    // AI recall keeps chat in `AI#<sub>` so it stays out of the sync scan (D16) — which is
    // exactly why a USER#-only erasure used to leave every question and answer behind.
    for (const SK of [
      "THREAD#t1",
      "MSG#t1#2026-07-28T00:00:00.000Z#m1",
      "DAILY#2026-07-28",
      "DAILY#PHOTO#2026-07-28",
    ]) {
      await ddb.doc.send(
        new PutCommand({ TableName: ddb.tableName, Item: { PK: `AI#${A}`, SK, owner: A } }),
      );
    }
    await ddb.doc.send(
      new PutCommand({
        TableName: ddb.tableName,
        Item: { PK: `USER#${A}`, SK: "SHIFT#s1", id: "s1", owner: A },
      }),
    );

    expect(await countAi(A)).toBe(4);

    const dry = await eraseUserData(ddb.doc, ddb.tableName, A, { dryRun: true });
    expect(dry.aiItems).toBe(4);
    expect(await countAi(A)).toBe(4); // dry run changed nothing

    await eraseUserData(ddb.doc, ddb.tableName, A, { dryRun: false });
    expect(await countAi(A)).toBe(0);
    expect(await count(A)).toBe(0);
  });

  it("deriveCounterparts maps each relationship row to its partner partition", () => {
    const cps = deriveCounterparts("X", [
      {
        PK: "USER#X",
        SK: "SHARE#reflections#r1#G",
        grantee: "G",
        entityType: "reflections",
        resourceId: "r1",
      },
      {
        PK: "USER#X",
        SK: "SHAREDWITHME#O#reflections#r2",
        owner: "O",
        entityType: "reflections",
        resourceId: "r2",
      },
      { PK: "USER#X", SK: "MENTOR#M", mentor: "M" },
      { PK: "USER#X", SK: "MENTEE#S", student: "S" },
      { PK: "USER#X", SK: "SHIFT#s1" }, // non-relationship row → no counterpart
    ]);
    expect(cps).toEqual([
      { PK: "USER#G", SK: "SHAREDWITHME#X#reflections#r1" },
      { PK: "USER#O", SK: "SHARE#reflections#r2#X" },
      { PK: "USER#M", SK: "MENTEE#X" },
      { PK: "USER#S", SK: "MENTOR#X" },
    ]);
  });
});

/**
 * Note-capture photos (spec-note-capture.md P1/P13). These have NO lifecycle expiry by
 * decision, so erasure is the only thing that ever removes them: if this is wrong, a GDPR
 * request reports success while the student's clinical imagery stays in the bucket.
 *
 * A stub S3 client rather than a real bucket — what's being tested is the prefix scoping,
 * the pagination and the dry-run contract, all of which are ours.
 */
describe("erase-user — note-capture photos", () => {
  function stubS3(keysByPrefix: Record<string, string[]>) {
    const deleted: string[] = [];
    const listCalls: Array<string | undefined> = [];
    const s3 = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        const name = cmd.constructor.name;
        if (name === "ListObjectsV2Command") {
          const prefix = String(cmd.input.Prefix);
          listCalls.push(cmd.input.ContinuationToken as string | undefined);
          const all = keysByPrefix[prefix] ?? [];
          // Paginate at 2 keys so the loop's continuation handling is actually exercised.
          const token = cmd.input.ContinuationToken as string | undefined;
          const start = token ? Number(token) : 0;
          const page = all.slice(start, start + 2);
          const nextStart = start + 2;
          const truncated = nextStart < all.length;
          return {
            Contents: page.map((Key) => ({ Key })),
            IsTruncated: truncated,
            NextContinuationToken: truncated ? String(nextStart) : undefined,
          };
        }
        if (name === "DeleteObjectsCommand") {
          const objs = (cmd.input.Delete as { Objects: Array<{ Key: string }> }).Objects;
          deleted.push(...objs.map((o) => o.Key));
          return {};
        }
        throw new Error(`unexpected command ${name}`);
      },
    } as unknown as S3Client;
    return { s3, deleted, listCalls };
  }

  const keys = {
    "u/photo-user/": [
      "u/photo-user/cap-1/0.jpg",
      "u/photo-user/cap-1/1.jpg",
      "u/photo-user/cap-2/0.jpg",
      "u/photo-user/cap-2/1.png",
      "u/photo-user/cap-3/0.jpg",
    ],
    "u/other-user/": ["u/other-user/cap-9/0.jpg"],
  };

  it("deletes every object under the user's prefix, across pages", async () => {
    const { s3, deleted, listCalls } = stubS3(keys);
    const res = await eraseUserCaptures(s3, "bucket", "photo-user", { dryRun: false });
    expect(res.objects).toBe(5);
    expect(deleted.sort()).toEqual(keys["u/photo-user/"].slice().sort());
    // 5 keys at 2 per page = 3 list calls; proves continuation tokens are followed rather
    // than the first page being mistaken for the whole set.
    expect(listCalls.length).toBe(3);
  });

  it("never touches another user's prefix", async () => {
    const { s3, deleted } = stubS3(keys);
    await eraseUserCaptures(s3, "bucket", "photo-user", { dryRun: false });
    expect(deleted.some((k) => k.startsWith("u/other-user/"))).toBe(false);
  });

  it("dry run reports the count and deletes nothing", async () => {
    const { s3, deleted } = stubS3(keys);
    const res = await eraseUserCaptures(s3, "bucket", "photo-user", { dryRun: true });
    expect(res.objects).toBe(5);
    expect(deleted).toEqual([]);
  });

  it("is a no-op for a user with no photos", async () => {
    const { s3, deleted } = stubS3(keys);
    const res = await eraseUserCaptures(s3, "bucket", "nobody", { dryRun: false });
    expect(res.objects).toBe(0);
    expect(deleted).toEqual([]);
  });
});
