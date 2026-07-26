import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DynamoLocal, startDynamoLocal } from "./helpers/dynamoLocal";
import { AiStore } from "../src/data/dynamo/aiStore";
import { DynamoRepository } from "../src/data/dynamo/dynamoRepository";
import { buildTurns, extractNoteRefs, HISTORY_TOKEN_BUDGET } from "../infra/lambda/ai/prompt";
import { assembleCorpus } from "../infra/lambda/ai/corpus";
import type { Repository } from "../src/data/repository";

// AI recall persistence (spec-ai-recall.md D15/D16) against an in-process DynamoDB.
// Each store gets a unique `sub`, so tests are isolated without teardown.

let ddb: DynamoLocal;
beforeAll(async () => {
  ddb = await startDynamoLocal();
});
afterAll(async () => {
  await ddb.stop();
});

let counter = 0;
function newSub() {
  return `ai-sub-${counter++}-${Math.random().toString(36).slice(2)}`;
}
function storeFor(sub = newSub()) {
  return new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
}

describe("AiStore — threads", () => {
  it("auto-titles a thread from the first question, truncating long ones", async () => {
    expect(AiStore.titleFrom("  What did I log   about ANTT?  ")).toBe(
      "What did I log about ANTT?",
    );
    expect(AiStore.titleFrom("")).toBe("New chat");
    const long = AiStore.titleFrom("x".repeat(200));
    expect(long.length).toBe(60);
    expect(long.endsWith("…")).toBe(true);
  });

  it("round-trips a thread and its messages in chronological order", async () => {
    const ai = storeFor();
    const thread = await ai.createThread("How do I take a manual BP?");
    await ai.appendMessage({ threadId: thread.id, role: "user", content: "first" });
    await ai.appendMessage({ threadId: thread.id, role: "assistant", content: "second" });
    await ai.bumpThread(thread.id, 2);

    const messages = await ai.listMessages(thread.id);
    expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
    const reloaded = await ai.getThread(thread.id);
    expect(reloaded?.messageCount).toBe(2);
    expect(reloaded?.title).toBe("How do I take a manual BP?");
  });

  it("lists threads newest-first", async () => {
    const ai = storeFor();
    const a = await ai.createThread("older");
    await new Promise((r) => setTimeout(r, 5));
    const b = await ai.createThread("newer");
    const threads = await ai.listThreads();
    expect(threads.map((t) => t.id)).toEqual([b.id, a.id]);
  });

  it("keeps each user's threads private to their own partition", async () => {
    const mine = storeFor();
    const theirs = storeFor();
    const thread = await mine.createThread("my private question");
    expect(await theirs.getThread(thread.id)).toBeUndefined();
    expect(await theirs.listThreads()).toEqual([]);
  });

  it("deleting a thread removes its messages too", async () => {
    const ai = storeFor();
    const thread = await ai.createThread("delete me");
    await ai.appendMessage({ threadId: thread.id, role: "user", content: "q" });
    await ai.appendMessage({ threadId: thread.id, role: "assistant", content: "a" });

    await ai.deleteThread(thread.id);
    expect(await ai.getThread(thread.id)).toBeUndefined();
    expect(await ai.listMessages(thread.id)).toEqual([]);
  });
});

describe("AiStore — feedback", () => {
  it("attaches thumbs + comment to one message and reports a miss", async () => {
    const ai = storeFor();
    const thread = await ai.createThread("q");
    const msg = await ai.appendMessage({ threadId: thread.id, role: "assistant", content: "a" });

    expect(await ai.setFeedback(thread.id, msg.id, "DOWN", "wrong note")).toBe(true);
    const [stored] = await ai.listMessages(thread.id);
    expect(stored.feedback).toBe("DOWN");
    expect(stored.feedbackComment).toBe("wrong note");

    expect(await ai.setFeedback(thread.id, "no-such-message", "UP")).toBe(false);
  });
});

describe("AiStore — daily cap (D11)", () => {
  it("counts down, then refuses past the limit", async () => {
    const ai = storeFor();
    const first = await ai.countQuestion(3);
    expect(first).toMatchObject({ allowed: true, remaining: 2 });
    expect(await ai.countQuestion(3)).toMatchObject({ allowed: true, remaining: 1 });
    expect(await ai.countQuestion(3)).toMatchObject({ allowed: true, remaining: 0 });

    const over = await ai.countQuestion(3);
    expect(over.allowed).toBe(false);
    expect(over.remaining).toBe(0);
  });

  it("counts per user, not globally", async () => {
    const mine = storeFor();
    const theirs = storeFor();
    await mine.countQuestion(2);
    await mine.countQuestion(2);
    expect((await mine.countQuestion(2)).allowed).toBe(false);
    expect((await theirs.countQuestion(2)).allowed).toBe(true);
  });

  it("sets a TTL so counter rows reap themselves", async () => {
    const sub = newSub();
    const ai = storeFor(sub);
    await ai.countQuestion(5);
    const today = new Date().toISOString().slice(0, 10);
    const raw = await ddb.doc.send(
      new (await import("@aws-sdk/lib-dynamodb")).GetCommand({
        TableName: ddb.tableName,
        Key: { PK: `AI#${sub}`, SK: `DAILY#${today}` },
      }),
    );
    const ttl = Number((raw.Item as { ttl?: number }).ttl);
    expect(ttl).toBeGreaterThan(Date.now() / 1000);
    expect(ttl).toBeLessThanOrEqual(Date.now() / 1000 + 48 * 3600 + 5);
  });
});

describe("AI chat is invisible to the sync engine (D16)", () => {
  it("syncPull never returns AI rows — an unknown entityType would break the client", async () => {
    const sub = newSub();
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    const repo = new DynamoRepository({
      doc: ddb.doc,
      tableName: ddb.tableName,
      principal: { sub, email: "x@example.com" },
    });
    await repo.getCurrentUser(); // a real, syncable row
    const thread = await ai.createThread("secret question");
    await ai.appendMessage({ threadId: thread.id, role: "user", content: "secret question" });

    const rows = await repo.syncPull();
    expect(rows.length).toBeGreaterThan(0); // the profile did sync
    const serialised = JSON.stringify(rows);
    expect(serialised).not.toContain("secret question");
    expect(rows.some((r) => r.entityType.toLowerCase().includes("ai"))).toBe(false);
  });

  it("'Clear all data' purges AI chat as well as notes", async () => {
    const sub = newSub();
    const ai = new AiStore({ doc: ddb.doc, tableName: ddb.tableName, sub });
    const repo = new DynamoRepository({
      doc: ddb.doc,
      tableName: ddb.tableName,
      principal: { sub, email: "x@example.com" },
    });
    await repo.getCurrentUser();
    const thread = await ai.createThread("q");
    await ai.appendMessage({ threadId: thread.id, role: "user", content: "q" });
    await ai.countQuestion(30);

    await repo.resetDatabase();

    expect(await ai.listThreads()).toEqual([]);
    expect(await ai.listMessages(thread.id)).toEqual([]);
    // The counter is gone too, so a wipe also resets today's allowance.
    expect((await ai.countQuestion(30)).remaining).toBe(29);
  });
});

describe("prompt assembly", () => {
  it("puts the corpus in a stable opening turn and the question last", () => {
    const turns = buildTurns("[SHIFT:1 · 2026-01-01]\nnote body", [], "what did I log?");
    expect(turns[0].role).toBe("user");
    expect(turns[0].content).toContain("note body");
    expect(turns[1].role).toBe("assistant"); // synthetic ack keeps alternation valid
    expect(turns.at(-1)).toEqual({ role: "user", content: "what did I log?" });
  });

  it("trims history oldest-first, in whole exchanges, to the token budget", () => {
    const big = "x".repeat(HISTORY_TOKEN_BUDGET * 4); // one turn ≈ the whole budget
    const history = [
      { role: "user" as const, content: `old q ${big}` },
      { role: "assistant" as const, content: "old a" },
      { role: "user" as const, content: "recent q" },
      { role: "assistant" as const, content: "recent a" },
    ];
    const turns = buildTurns("corpus", history, "new q");
    const kept = turns.slice(2, -1);
    expect(kept.map((t) => t.content)).toEqual(["recent q", "recent a"]);
    expect(kept[0].role).toBe("user"); // never starts mid-exchange
  });

  it("extracts note refs from sentinel tags, de-duplicated", () => {
    const answer =
      'See <note ref="SHIFT:abc"/> and <note ref="REFLECTION:def" /> and again <note ref="SHIFT:abc"/>.';
    expect(extractNoteRefs(answer)).toEqual(["SHIFT:abc", "REFLECTION:def"]);
    expect(extractNoteRefs("no tags here")).toEqual([]);
  });
});

describe("corpus assembly (D4)", () => {
  it("never reads self-care check-ins", async () => {
    // Structural guarantee, not a filter: the repository blows up if the corpus so much
    // as asks for self-care data, so a future edit that adds it fails loudly here.
    const called: string[] = [];
    const repo = new Proxy({} as Repository, {
      get(_t, prop: string) {
        return (..._args: unknown[]) => {
          called.push(prop);
          if (prop.toLowerCase().includes("selfcare")) {
            throw new Error(`corpus must never read self-care data (called ${prop})`);
          }
          return Promise.resolve([]);
        };
      },
    });

    const result = await assembleCorpus(repo, "sub-1");
    expect(result.blocks).toBe(0);
    expect(called.length).toBeGreaterThan(0);
    expect(called.some((m) => m.toLowerCase().includes("selfcare"))).toBe(false);
  });

  it("formats blocks with a resolvable TYPE:id label and skips empty notes", async () => {
    const repo = {
      listShifts: async () => [
        { id: "s1", date: "2026-03-02", shiftType: "EARLY", notes: "manual BP steps" },
        { id: "s2", date: "2026-03-03", shiftType: "LATE", notes: "   " }, // whitespace only
        { id: "s3", date: "2026-03-04", shiftType: "NIGHT" }, // no notes at all
      ],
      listReflections: async () => [],
      listReflectionSectionsForUser: async () => [],
      listTags: async () => [],
      listReflectionTags: async () => [],
      listMedicationLogs: async () => [],
      listMedications: async () => [],
      listProficiencyProgress: async () => [],
      listProficiencyStatusEvents: async () => [],
    } as unknown as Repository;

    const result = await assembleCorpus(repo, "sub-1");
    expect(result.blocks).toBe(1);
    expect(result.text).toContain("[SHIFT:s1 · 2026-03-02 · EARLY shift]");
    expect(result.text).toContain("manual BP steps");
    expect(result.truncated).toBe(false);
  });
});
