import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { newId, nowIso } from "../../domain/ids";
import { aiMessageSchema, aiThreadSchema } from "../../domain/schemas.generated";
import type { AiFeedback, AiMessage, AiThread } from "../../domain/types";

/**
 * Server-side store for AI recall chat (spec-ai-recall.md D15/D16). Deliberately NOT
 * part of the `Repository` interface: these rows never reach Dexie, never enter the
 * sync outbox, and have no client-side implementation.
 *
 * **Partition choice — a considered deviation from D16's letter.** The spec says "the
 * user's partition"; these rows instead live in a sibling `AI#<sub>` partition. Reason:
 * `syncPull` does a full scan of `USER#<sub>` and ships every row to the client, where
 * `applyRemote` looks up `db[entityType]` — an unregistered `aiThreads` store resolves
 * to `undefined` and throws, breaking sync outright for anyone who used the feature.
 * A separate partition makes the exclusion structural rather than a filter someone can
 * later forget. `purgeAll()` keeps "Clear all data" honest across both partitions.
 *
 * Rows are hard-deleted (no tombstones): nothing syncs them, so there is no peer that
 * needs to learn about the delete.
 */

export interface DailyCountResult {
  allowed: boolean;
  /** Questions left today AFTER this one (0 when the cap was just hit). */
  remaining: number;
  /** UTC midnight the counter rolls over (ISO) — shown in the cap message. */
  resetsAt: string;
}

export interface AiStoreOptions {
  doc: DynamoDBDocumentClient;
  tableName: string;
  /** The verified Cognito `sub` — the server owns identity; never a client value. */
  sub: string;
}

/** Counter rows outlive the day they count so a late read still sees them; 48h is ample. */
const DAILY_TTL_SECONDS = 48 * 60 * 60;

export class AiStore {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly sub: string;

  constructor(opts: AiStoreOptions) {
    this.doc = opts.doc;
    this.tableName = opts.tableName;
    this.sub = opts.sub;
  }

  private pk(): string {
    return `AI#${this.sub}`;
  }
  private static sk = {
    thread: (id: string) => `THREAD#${id}`,
    /** createdAt first so a thread's messages query back in chronological order. */
    message: (threadId: string, createdAt: string, id: string) =>
      `MSG#${threadId}#${createdAt}#${id}`,
    messagePrefix: (threadId: string) => `MSG#${threadId}#`,
    daily: (isoDate: string) => `DAILY#${isoDate}`,
  };

  /**
   * Query this user's AI partition. An empty `prefix` means the WHOLE partition and must
   * omit `begins_with` entirely: real DynamoDB rejects an empty key-condition value with
   * a ValidationException (dynalite happily accepts it, so the unit tests did not catch
   * this — it surfaced the first time `resetDatabase` ran against AWS).
   */
  private async query(prefix: string): Promise<Record<string, unknown>[]> {
    const items: Record<string, unknown>[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: prefix ? "PK = :pk AND begins_with(SK, :sk)" : "PK = :pk",
          ExpressionAttributeValues: prefix
            ? { ":pk": this.pk(), ":sk": prefix }
            : { ":pk": this.pk() },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) items.push(it as Record<string, unknown>);
      ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (ExclusiveStartKey);
    return items;
  }

  // ---- daily cap (D11) ----

  /**
   * Atomically count this question against today's cap. `ADD` is a single-round-trip
   * counter, so concurrent asks can't both read a stale value — worst case two requests
   * interleave and the effective cap is off by one, which is fine for a courtesy limit.
   */
  async countQuestion(limit: number): Promise<DailyCountResult> {
    const today = nowIso().slice(0, 10);
    const resetsAt = `${today}T23:59:59.999Z`;
    const res = await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(), SK: AiStore.sk.daily(today) },
        UpdateExpression: "ADD #c :one SET #ttl = :ttl, #o = :owner",
        ExpressionAttributeNames: { "#c": "count", "#ttl": "ttl", "#o": "owner" },
        ExpressionAttributeValues: {
          ":one": 1,
          ":ttl": Math.floor(Date.now() / 1000) + DAILY_TTL_SECONDS,
          ":owner": this.sub,
        },
        ReturnValues: "UPDATED_NEW",
      }),
    );
    const used = Number((res.Attributes as { count?: number } | undefined)?.count ?? 1);
    return { allowed: used <= limit, remaining: Math.max(0, limit - used), resetsAt };
  }

  // ---- threads ----

  async createThread(firstQuestion: string): Promise<AiThread> {
    const ts = nowIso();
    const thread: AiThread = {
      id: newId(),
      userId: this.sub,
      title: AiStore.titleFrom(firstQuestion),
      messageCount: 0,
      lastMessageAt: ts,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { PK: this.pk(), SK: AiStore.sk.thread(thread.id), owner: this.sub, ...thread },
      }),
    );
    return thread;
  }

  /** Auto-title from the first question (D15) — never regenerated afterwards. */
  static titleFrom(question: string): string {
    const clean = question.replace(/\s+/g, " ").trim();
    if (clean.length <= 60) return clean || "New chat";
    return `${clean.slice(0, 59).trimEnd()}…`;
  }

  async getThread(id: string): Promise<AiThread | undefined> {
    const res = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(), SK: AiStore.sk.thread(id) },
      }),
    );
    return res.Item ? (aiThreadSchema.parse(res.Item) as AiThread) : undefined;
  }

  /** Newest conversation first — the history list order (D15). */
  async listThreads(): Promise<AiThread[]> {
    const rows = await this.query("THREAD#");
    return rows
      .map((r) => aiThreadSchema.parse(r) as AiThread)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }

  async bumpThread(threadId: string, addedMessages: number): Promise<void> {
    const ts = nowIso();
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(), SK: AiStore.sk.thread(threadId) },
        UpdateExpression: "ADD messageCount :n SET lastMessageAt = :ts, updatedAt = :ts",
        ExpressionAttributeValues: { ":n": addedMessages, ":ts": ts },
      }),
    );
  }

  /** Hard-deletes the thread and every message in it. */
  async deleteThread(threadId: string): Promise<void> {
    const msgs = await this.query(AiStore.sk.messagePrefix(threadId));
    for (const m of msgs) {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(), SK: m.SK as string },
        }),
      );
    }
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(), SK: AiStore.sk.thread(threadId) },
      }),
    );
  }

  /** Every AI row for this user — wired into "Clear all data" so chat history goes too. */
  async purgeAll(): Promise<void> {
    const rows = await this.query("");
    for (const r of rows) {
      await this.doc.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { PK: this.pk(), SK: r.SK as string },
        }),
      );
    }
  }

  // ---- messages ----

  async appendMessage(
    input: Omit<AiMessage, "id" | "userId" | "createdAt"> & { createdAt?: string },
  ): Promise<AiMessage> {
    const createdAt = input.createdAt ?? nowIso();
    const message: AiMessage = {
      ...input,
      id: newId(),
      userId: this.sub,
      createdAt,
    };
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: this.pk(),
          SK: AiStore.sk.message(message.threadId, createdAt, message.id),
          owner: this.sub,
          ...message,
        },
      }),
    );
    return message;
  }

  /** Chronological (the SK sorts by createdAt). */
  async listMessages(threadId: string): Promise<AiMessage[]> {
    const rows = await this.query(AiStore.sk.messagePrefix(threadId));
    return rows.map((r) => aiMessageSchema.parse(r) as AiMessage);
  }

  /**
   * Attach 👍/👎 to one assistant message. The SK embeds `createdAt`, which the caller
   * doesn't hold, so the message is located by scanning its thread — threads are capped
   * at 50 messages, so this is a small, bounded read.
   */
  async setFeedback(
    threadId: string,
    messageId: string,
    feedback: AiFeedback,
    comment?: string,
  ): Promise<boolean> {
    const rows = await this.query(AiStore.sk.messagePrefix(threadId));
    const row = rows.find((r) => r.id === messageId);
    if (!row) return false;
    await this.doc.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: this.pk(), SK: row.SK as string },
        UpdateExpression: comment
          ? "SET feedback = :f, feedbackComment = :c"
          : "SET feedback = :f REMOVE feedbackComment",
        ExpressionAttributeValues: comment ? { ":f": feedback, ":c": comment } : { ":f": feedback },
      }),
    );
    return true;
  }
}
