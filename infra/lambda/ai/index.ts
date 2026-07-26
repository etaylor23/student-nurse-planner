/// <reference path="./runtime.d.ts" />
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { makeDocClient } from "../../../src/data/dynamo/dynamoClient";
import { DynamoRepository } from "../../../src/data/dynamo/dynamoRepository";
import { AiStore } from "../../../src/data/dynamo/aiStore";
import { makeAuthorize } from "../../../src/data/dynamo/authorize";
import type { ChatTurn } from "./prompt";
import { verifyCaller } from "./auth";
import { assembleCorpus } from "./corpus";
import { SYSTEM_PROMPT, buildTurns, extractNoteRefs } from "./prompt";
import { streamChat, UpstreamError } from "./provider";
import { writeMeta, writeDelta, writeDone, writeError } from "./sse";

/**
 * `POST /ask` — the AI recall streaming endpoint (spec-ai-recall.md).
 *
 * Flow: verify Cognito ID token in-Lambda → AVP authorize (owner-scoped list over the
 * caller's own records) → kill switch → daily cap → load/create thread + history →
 * corpus from DynamoDB → mantle provider stream → SSE frames, persisting both turns.
 *
 * Auth note: the dedicated Cedar `aiAsk` action is deferred — assembling the corpus IS
 * a list of the caller's own sensitive records, which the shipped owner-all policy
 * already covers exactly. Adding an action means a policy-store schema migration for no
 * change in decision; revisit if AI ever reads cross-user data.
 */
const TABLE = process.env.TABLE_NAME as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const KILL_SWITCH_PARAM = process.env.AI_KILL_SWITCH_PARAM ?? "/nurse-planner/ai/enabled";
const MAX_QUESTION_CHARS = 2_000;
const MAX_ANSWER_TOKENS = 1_024; // D11
const DAILY_QUESTION_CAP = 30; // D11
const MAX_THREAD_MESSAGES = 50; // spec §UX states — nudge a new chat past this

const doc = makeDocClient();
const ssm = new SSMClient({});
const authorize = makeAuthorize({
  client: new VerifiedPermissionsClient({}),
  policyStoreId: process.env.POLICY_STORE_ID as string,
});

// Kill switch (D11): SSM string param, cached briefly so a flip lands within ~30s
// without a redeploy. Fail-open — an SSM outage must not take the feature down.
let killCache: { enabled: boolean; at: number } = { enabled: true, at: 0 };
async function aiEnabled(): Promise<boolean> {
  if (Date.now() - killCache.at < 30_000) return killCache.enabled;
  try {
    const res = await ssm.send(new GetParameterCommand({ Name: KILL_SWITCH_PARAM }));
    killCache = { enabled: res.Parameter?.Value !== "false", at: Date.now() };
  } catch (err) {
    console.warn("kill-switch read failed (failing open)", err);
    killCache = { enabled: true, at: Date.now() };
  }
  return killCache.enabled;
}

function respondJson(
  responseStream: ResponseStream,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode,
    headers: { "content-type": "application/json" },
  });
  out.write(JSON.stringify(body));
  out.end();
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  if (event.requestContext?.http?.method !== "POST") {
    return respondJson(responseStream, 405, { error: "method_not_allowed" });
  }

  const caller = await verifyCaller(event.headers);
  if (!caller) return respondJson(responseStream, 401, { error: "unauthorized" });

  let question = "";
  let requestedThreadId: string | undefined;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "{}");
    const payload = JSON.parse(raw) as { question?: unknown; threadId?: unknown };
    question = typeof payload.question === "string" ? payload.question.trim() : "";
    requestedThreadId = typeof payload.threadId === "string" ? payload.threadId : undefined;
  } catch {
    return respondJson(responseStream, 400, { error: "bad_json" });
  }
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return respondJson(responseStream, 400, { error: "bad_question" });
  }

  // Same single AVP gate as the router — owner-scoped list over sensitive records.
  const allowed = await authorize({
    identityToken: caller.identityToken,
    action: "List",
    tier: "SensitiveRecord",
    resourceId: "scope:ai-corpus",
    ownerId: `${USER_POOL_ID}|${caller.sub}`,
  });
  if (!allowed) return respondJson(responseStream, 403, { error: "forbidden" });

  const stream = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
    },
  });

  const ai = new AiStore({ doc, tableName: TABLE, sub: caller.sub });
  const repo = new DynamoRepository({
    doc,
    tableName: TABLE,
    principal: { sub: caller.sub, email: caller.email },
  });

  const started = Date.now();
  let thread: Awaited<ReturnType<AiStore["createThread"]>> | undefined;
  let answer = "";
  let usage: Record<string, number> = {};

  try {
    if (!(await aiEnabled())) {
      writeError(stream, "KILLED", "Ask-your-notes is taking a short break.");
      return;
    }

    const cap = await ai.countQuestion(DAILY_QUESTION_CAP);
    if (!cap.allowed) {
      writeError(
        stream,
        "CAP",
        "You've used today's questions — they reset tomorrow. Your notes aren't going anywhere 🌱",
      );
      return;
    }

    // Load the requested thread (ignoring an id that isn't ours — the store is
    // partitioned by sub, so a foreign id simply reads as absent) or start a new one.
    let history: ChatTurn[] = [];
    const existing = requestedThreadId ? await ai.getThread(requestedThreadId) : undefined;
    if (existing) {
      if (existing.messageCount >= MAX_THREAD_MESSAGES) {
        writeError(stream, "THREAD_FULL", "This chat is getting long — start a new one?");
        return;
      }
      thread = existing;
      history = (await ai.listMessages(existing.id)).map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } else {
      thread = await ai.createThread(question);
    }

    const userMessage = await ai.appendMessage({
      threadId: thread.id,
      role: "user",
      content: question,
    });

    const corpus = await assembleCorpus(repo, caller.sub);
    writeMeta(stream, {
      threadId: thread.id,
      messageId: userMessage.id,
      remaining: cap.remaining,
      resetsAt: cap.resetsAt,
    });

    const result = await streamChat({
      system: SYSTEM_PROMPT,
      turns: buildTurns(corpus.text, history, question),
      maxTokens: MAX_ANSWER_TOKENS,
    });
    for await (const text of result.deltas) {
      answer += text;
      writeDelta(stream, text);
    }
    usage = result.usage();

    writeDone(stream, { stopReason: "end_turn", usage });
    console.log(
      JSON.stringify({
        metric: "ai_ask",
        blocks: corpus.blocks,
        truncated: corpus.truncated,
        historyTurns: history.length,
        latencyMs: Date.now() - started,
        ...usage,
      }),
    );
    await persistAnswer(ai, thread.id, answer, usage, started, "end_turn");

    // First-use notice (D13) is driven off the profile flag — stamped once, silently.
    const user = await repo.getCurrentUser();
    if (!user.aiFirstUsedAt) await repo.updateUser({ aiFirstUsedAt: new Date().toISOString() });

    await repo
      .createLogItem({
        userId: caller.sub,
        entityType: "AI",
        entityId: thread.id,
        action: "AI_ASKED",
        summary: "Asked your notes",
      })
      .catch((err: unknown) => console.warn("audit log write failed", err));
  } catch (err) {
    // A partial answer is still the student's — keep it, flagged, rather than lose it.
    if (thread && answer) {
      await persistAnswer(ai, thread.id, answer, usage, started, "aborted").catch(() => {});
    }
    if (err instanceof UpstreamError && err.throttled) {
      writeError(stream, "THROTTLED", "The model is busy — try again in a moment.");
    } else {
      console.error("ask failed", err);
      writeError(stream, "UPSTREAM", "That didn't work — try again.");
    }
  } finally {
    stream.end();
  }
});

async function persistAnswer(
  ai: AiStore,
  threadId: string,
  answer: string,
  usage: Record<string, number>,
  started: number,
  stopReason: string,
): Promise<void> {
  const refs = extractNoteRefs(answer);
  await ai.appendMessage({
    threadId,
    role: "assistant",
    content: answer,
    noteRefs: refs.length ? refs.join(",") : undefined,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    latencyMs: Date.now() - started,
    stopReason,
  });
  await ai.bumpThread(threadId, 2); // the user turn + this one
}
