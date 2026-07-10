import {
  type DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { nowIso } from "../../domain/ids";
import type { Tier } from "./authorize";

/**
 * Cross-user relationship storage (spec-backend-dynamodb.md §4.5) — the mirror-item pattern.
 *
 * Every grant is stored as TWO items so both directions are a plain base-table query
 * (zero-GSI online path preserved): a **canonical** record in the owner's/student's
 * partition and a **mirror** record in the grantee's/mentor's partition. Both carry the
 * owner `sub`. Writes are sequential PutCommands (dynalite has no TransactWrite; production
 * should upgrade to a TransactWrite for atomicity — noted below).
 *
 *   Share canonical  PK=USER#<owner>    SK=SHARE#<entityType>#<resourceId>#<grantee>
 *   Share mirror     PK=USER#<grantee>  SK=SHAREDWITHME#<owner>#<entityType>#<resourceId>
 *   Mentor canonical PK=USER#<student>  SK=MENTOR#<mentor>
 *   Mentor mirror    PK=USER#<mentor>   SK=MENTEE#<student>
 *
 * The CALLER is always the owner of what they grant: a student shares their OWN record /
 * names their OWN mentor. The router derives every `owner`/`student` from the verified JWT
 * `sub` and never trusts a client-supplied owner for a write.
 */

export interface SharedGrant {
  owner: string;
  entityType: string;
  resourceId: string;
  tier: Tier;
}

const pk = (sub: string): string => `USER#${sub}`;
const shareCanonicalSk = (entityType: string, resourceId: string, grantee: string): string =>
  `SHARE#${entityType}#${resourceId}#${grantee}`;
const shareMirrorSk = (owner: string, entityType: string, resourceId: string): string =>
  `SHAREDWITHME#${owner}#${entityType}#${resourceId}`;
const mentorCanonicalSk = (mentor: string): string => `MENTOR#${mentor}`;
const menteeMirrorSk = (student: string): string => `MENTEE#${student}`;

export class RelationshipStore {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(doc: DynamoDBDocumentClient, tableName: string) {
    this.doc = doc;
    this.tableName = tableName;
  }

  private async query(partition: string, prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": partition, ":sk": prefix },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) items.push(it as Record<string, unknown>);
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  // ---- Share (per-item, revocable) ----

  /** Grant `grantee` read access to one of the owner's records. Caller = owner. */
  async shareRecord(
    owner: string,
    entityType: string,
    resourceId: string,
    tier: Tier,
    grantee: string,
  ): Promise<void> {
    const createdAt = nowIso();
    const attrs = { owner, grantee, entityType, resourceId, tier, createdAt };
    // Sequential (no TransactWrite in dynalite): canonical then mirror.
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: pk(owner), SK: shareCanonicalSk(entityType, resourceId, grantee), ...attrs },
      }),
    );
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: pk(grantee), SK: shareMirrorSk(owner, entityType, resourceId), ...attrs },
      }),
    );
  }

  /** Revoke a share (hard-delete both items → access ends immediately). Caller = owner. */
  async revokeShare(
    owner: string,
    entityType: string,
    resourceId: string,
    grantee: string,
  ): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk(owner), SK: shareCanonicalSk(entityType, resourceId, grantee) },
      }),
    );
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk(grantee), SK: shareMirrorSk(owner, entityType, resourceId) },
      }),
    );
  }

  /** Whether a live share grants `grantee` read of (owner, entityType, resourceId). */
  async getShare(
    owner: string,
    entityType: string,
    resourceId: string,
    grantee: string,
  ): Promise<SharedGrant | undefined> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk(owner), SK: shareCanonicalSk(entityType, resourceId, grantee) },
      }),
    );
    const item = res.Item as Record<string, unknown> | undefined;
    if (!item) return undefined;
    return {
      owner: String(item.owner),
      entityType: String(item.entityType),
      resourceId: String(item.resourceId),
      tier: item.tier as Tier,
    };
  }

  /** Every record shared WITH `grantee` (their mirror partition). */
  async listSharedWithMe(grantee: string): Promise<SharedGrant[]> {
    const rows = await this.query(pk(grantee), "SHAREDWITHME#");
    return rows.map((r) => ({
      owner: String(r.owner),
      entityType: String(r.entityType),
      resourceId: String(r.resourceId),
      tier: r.tier as Tier,
    }));
  }

  // ---- Mentorship ----

  /** Record that `mentor` mentors `student`. Caller = student (names their own mentor). */
  async addMentorship(student: string, mentor: string): Promise<void> {
    const createdAt = nowIso();
    const attrs = { student, mentor, createdAt };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: pk(student), SK: mentorCanonicalSk(mentor), ...attrs },
      }),
    );
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: pk(mentor), SK: menteeMirrorSk(student), ...attrs },
      }),
    );
  }

  /** Remove a mentorship (hard-delete both items). Caller = student. */
  async removeMentorship(student: string, mentor: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk(student), SK: mentorCanonicalSk(mentor) },
      }),
    );
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk(mentor), SK: menteeMirrorSk(student) },
      }),
    );
  }

  /** Whether `mentor` mentors `student` (reads the canonical record in the student partition). */
  async isMentor(mentor: string, student: string): Promise<boolean> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk(student), SK: mentorCanonicalSk(mentor) },
      }),
    );
    return res.Item !== undefined;
  }

  /** The students `mentor` mentors (their mirror partition). */
  async listMyMentees(mentor: string): Promise<string[]> {
    const rows = await this.query(pk(mentor), "MENTEE#");
    return rows.map((r) => String(r.student));
  }

  /** The mentors `student` has named (their canonical partition). */
  async listMyMentors(student: string): Promise<string[]> {
    const rows = await this.query(pk(student), "MENTOR#");
    return rows.map((r) => String(r.mentor));
  }
}
