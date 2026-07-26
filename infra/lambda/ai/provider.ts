import { SignatureV4 } from "@smithy/signature-v4";
import { HttpRequest } from "@smithy/protocol-http";
import { Sha256 } from "@aws-crypto/sha256-js";
import type { ChatTurn } from "./prompt";

/**
 * Provider adapter (spec-ai-recall.md D6a): both routes target the Bedrock mantle
 * endpoint with plain IAM SigV4 (verified 2026-07-26) — no API keys.
 *
 * - `openai-compat` → POST /v1/chat/completions — the interim open-weight model.
 * - `anthropic`     → POST /anthropic/v1/messages — Sonnet 5 + prompt caching, flipped
 *                     on via AI_PROVIDER once the account's Anthropic agreement unblocks.
 *
 * Model + provider are env config; everything upstream (corpus, prompt contract, SSE
 * protocol to the client) is identical across the two.
 */

export type Provider = "openai-compat" | "anthropic";

export interface StreamRequest {
  system: string;
  turns: ChatTurn[]; // history + final user turn (corpus+question)
  maxTokens: number;
}

export interface StreamResult {
  /** Text deltas as they arrive. */
  deltas: AsyncGenerator<string, void, void>;
  /** Resolves after the stream ends; fields best-effort per provider. */
  usage: () => { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number };
}

export class UpstreamError extends Error {
  constructor(
    readonly status: number,
    readonly throttled: boolean,
    body: string,
  ) {
    super(`upstream ${status}: ${body.slice(0, 300)}`);
  }
}

const REGION = process.env.AWS_REGION ?? "eu-west-2";
const ENDPOINT = process.env.MANTLE_ENDPOINT ?? `https://bedrock-mantle.${REGION}.api.aws`;

const signer = new SignatureV4({
  service: "bedrock",
  region: REGION,
  sha256: Sha256,
  credentials: () =>
    Promise.resolve({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    }),
});

async function signedStreamingPost(path: string, body: unknown): Promise<Response> {
  const url = new URL(ENDPOINT + path);
  const payload = JSON.stringify(body);
  const request = new HttpRequest({
    method: "POST",
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers: { "content-type": "application/json", host: url.hostname },
    body: payload,
  });
  const signed = await signer.sign(request);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: signed.headers as Record<string, string>,
    body: payload,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new UpstreamError(res.status, res.status === 429 || res.status === 503, text);
  }
  return res;
}

/** Split a streamed body into SSE `data:` payload strings. */
async function* sseData(res: Response): AsyncGenerator<string, void, void> {
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trimEnd();
      buf = buf.slice(idx + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

export function streamChat(req: StreamRequest): Promise<StreamResult> {
  const provider = (process.env.AI_PROVIDER ?? "openai-compat") as Provider;
  return provider === "anthropic" ? anthropicStream(req) : openAiCompatStream(req);
}

async function openAiCompatStream(req: StreamRequest): Promise<StreamResult> {
  const res = await signedStreamingPost("/v1/chat/completions", {
    model: process.env.AI_MODEL_ID,
    max_tokens: req.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
    messages: [{ role: "system", content: req.system }, ...req.turns],
  });
  const captured: { u?: Record<string, number> } = {};
  async function* deltas(): AsyncGenerator<string, void, void> {
    for await (const data of sseData(res)) {
      if (data === "[DONE]") return;
      let chunk: {
        choices?: Array<{ delta?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        continue; // tolerate keep-alives / partial frames
      }
      if (chunk.usage) {
        captured.u = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
      const text = chunk.choices?.[0]?.delta?.content;
      if (typeof text === "string" && text) yield text;
    }
  }
  return { deltas: deltas(), usage: () => captured.u ?? {} };
}

async function anthropicStream(req: StreamRequest): Promise<StreamResult> {
  // System + the corpus-bearing first user turn carry cache_control so repeat questions
  // hit the prompt cache (D6). Turn content is plain text on this route.
  const [first, ...rest] = req.turns;
  const res = await signedStreamingPost("/anthropic/v1/messages", {
    model: process.env.AI_MODEL_ID,
    max_tokens: req.maxTokens,
    stream: true,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: first.role,
        content: [{ type: "text", text: first.content, cache_control: { type: "ephemeral" } }],
      },
      ...rest.map((t) => ({ role: t.role, content: t.content })),
    ],
  });
  const captured: { u: Record<string, number> } = { u: {} };
  async function* deltas(): AsyncGenerator<string, void, void> {
    for await (const data of sseData(res)) {
      let ev: {
        type?: string;
        delta?: { type?: string; text?: string };
        message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number } };
        usage?: { output_tokens?: number };
      };
      try {
        ev = JSON.parse(data);
      } catch {
        continue;
      }
      if (ev.type === "message_start" && ev.message?.usage) {
        captured.u.inputTokens = ev.message.usage.input_tokens ?? 0;
        captured.u.cacheReadTokens = ev.message.usage.cache_read_input_tokens ?? 0;
      }
      if (ev.type === "message_delta" && ev.usage) {
        captured.u.outputTokens = ev.usage.output_tokens ?? 0;
      }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
        yield ev.delta.text;
      }
    }
  }
  return { deltas: deltas(), usage: () => captured.u };
}
