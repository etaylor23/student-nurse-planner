import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { RelationshipStore } from "../src/data/dynamo/relationships";
import { deriveCounterparts, eraseUserData } from "../scripts/erase-user";

// Proves the GDPR erasure core (scripts/erase-user.ts) deletes a user's WHOLE partition —
// including soft-delete tombstones — plus the share/mentorship counterparts that live in
// other users' partitions, leaving nothing that references the erased user.

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

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

  it("deriveCounterparts maps each relationship row to its partner partition", () => {
    const cps = deriveCounterparts("X", [
      { PK: "USER#X", SK: "SHARE#reflections#r1#G", grantee: "G", entityType: "reflections", resourceId: "r1" },
      { PK: "USER#X", SK: "SHAREDWITHME#O#reflections#r2", owner: "O", entityType: "reflections", resourceId: "r2" },
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
