/// <reference path="./runtime.d.ts" />
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { VerifiedPermissionsClient } from "@aws-sdk/client-verifiedpermissions";
import { randomUUID } from "node:crypto";
import { makeDocClient } from "../../../src/data/dynamo/dynamoClient";
import { DynamoRepository } from "../../../src/data/dynamo/dynamoRepository";
import { makeAuthorize } from "../../../src/data/dynamo/authorize";
import { verifyCaller } from "./auth";
import { assembleCorpus } from "./corpus";
import { SYSTEM_PROMPT, buildUserContext } from "./prompt";
import { streamChat, UpstreamError } from "./provider";
import { writeMeta, writeDelta, writeDone, writeError } from "./sse";

/**
 * `POST /ask` — the AI recall streaming endpoint (spec-ai-recall.md, Phase 1 slice).
 *
 * Flow: verify Cognito ID token in-Lambda → AVP authorize (List/SensitiveRecord,
 * owner-scoped — assembling the corpus IS a list of the caller's own records; the
 * dedicated Cedar `aiAsk` action is deferred until the schema next changes) → kill
 * switch → corpus from DynamoDB → mantle provider stream → SSE frames per spec.
 *
 * Phase 1 limits: no threads/persistence (threadId in `meta` is a placeholder), no
 * daily cap (Phase 2). Audit: one LogItem per ask (no question text — the activity log
 * is user-visible; full Q&A persistence lands in Phase 2).
 */
const TABLE = process.env.TABLE_NAME as string;
const USER_POOL_ID = process.env.USER_POOL_ID as string;
const KILL_SWITCH_PARAM = process.env.AI_KILL_SWITCH_PARAM ?? "/nurse-planner/ai/enabled";
const MAX_QUESTION_CHARS = 2_000;
const MAX_ANSWER_TOKENS = 1_024; // D11

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
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf8")
      : (event.body ?? "{}");
    const payload = JSON.parse(raw) as { question?: unknown };
    question = typeof payload.question === "string" ? payload.question.trim() : "";
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

  if (!(await aiEnabled())) {
    writeError(stream, "KILLED", "Ask-your-notes is taking a short break.");
    stream.end();
    return;
  }

  const repo = new DynamoRepository({
    doc,
    tableName: TABLE,
    principal: { sub: caller.sub, email: caller.email },
  });

  const started = Date.now();
  try {
    const corpus = await assembleCorpus(repo, caller.sub);
    writeMeta(stream, { threadId: `ephemeral-${randomUUID()}`, messageId: randomUUID() });

    const result = await streamChat({
      system: SYSTEM_PROMPT,
      turns: [{ role: "user", content: buildUserContext(corpus.text, question) }],
      maxTokens: MAX_ANSWER_TOKENS,
    });
    for await (const text of result.deltas) writeDelta(stream, text);

    const usage = result.usage();
    writeDone(stream, { stopReason: "end_turn", usage });
    console.log(
      JSON.stringify({
        metric: "ai_ask",
        blocks: corpus.blocks,
        truncated: corpus.truncated,
        latencyMs: Date.now() - started,
        ...usage,
      }),
    );

    // Audit-trail entry (existing LogItem pattern) — action only, never question text.
    await repo
      .createLogItem({
        userId: caller.sub,
        entityType: "AI",
        entityId: "ask",
        action: "AI_ASKED",
        summary: "Asked your notes",
      })
      .catch((err: unknown) => console.warn("audit log write failed", err));
  } catch (err) {
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
