import { useCallback, useMemo, useRef, useState } from "react";
import { retrieveTokens } from "amazon-cognito-passwordless-auth/storage";
import { AiClient, type AskErrorCode, type AskMeta } from "../../../data/api/aiClient";
import { API_BASE } from "../../../auth/passwordlessConfig";
import { AI_ASK_URL } from "./config";
import { type Segment, SentinelParser, parseAnswer } from "./sentinelParser";
import type { AiMessage, AiThread } from "../../../domain/types";

/**
 * The ask-your-notes state machine (spec-ai-recall.md §UX states). One hook owns the
 * conversation so the Home panel and the global ask overlay are the *same* component
 * with the same behaviour (D8).
 */

export interface Turn {
  id: string;
  role: "user" | "assistant";
  /** Prose + note/more segments, parsed incrementally as the answer streams. */
  segments: Segment[];
  feedback?: "UP" | "DOWN";
  /** True while this answer is still streaming. */
  streaming?: boolean;
  /** Set when the stream ended early — the partial answer is kept, flagged. */
  interrupted?: boolean;
}

export interface AskState {
  turns: Turn[];
  threadId?: string;
  busy: boolean;
  error?: { code: AskErrorCode; message: string };
  /** Questions left today; undefined until the first ask of the session. */
  remaining?: number;
}

function messageToTurn(m: AiMessage): Turn {
  return {
    id: m.id,
    role: m.role,
    segments: m.role === "assistant" ? parseAnswer(m.content) : [{ kind: "text", text: m.content }],
    feedback: m.feedback,
    interrupted: m.stopReason === "aborted",
  };
}

export function useAskNotes() {
  const client = useMemo(
    () =>
      new AiClient({
        askUrl: AI_ASK_URL,
        apiBase: API_BASE,
        getIdToken: async () => {
          const tokens = await retrieveTokens();
          if (!tokens?.idToken) throw new Error("Not signed in");
          return tokens.idToken;
        },
      }),
    [],
  );

  const [state, setState] = useState<AskState>({ turns: [], busy: false });
  const [threads, setThreads] = useState<AiThread[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadThreads = useCallback(
    async (force = false) => {
      try {
        setThreads(await client.listThreads(force));
      } catch {
        setThreads([]); // history is a nicety — never block asking on it
      }
    },
    [client],
  );

  const openThread = useCallback(
    async (threadId: string) => {
      setState((s) => ({ ...s, busy: true, error: undefined }));
      try {
        const { messages } = await client.getThread(threadId);
        setState({ turns: messages.map(messageToTurn), threadId, busy: false });
      } catch {
        setState((s) => ({
          ...s,
          busy: false,
          error: { code: "UPSTREAM", message: "Couldn't open that chat. Try again." },
        }));
      }
    },
    [client],
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setState({ turns: [], busy: false });
  }, []);

  const deleteThread = useCallback(
    async (threadId: string) => {
      await client.deleteThread(threadId).catch(() => {});
      setThreads((ts) => (ts ?? []).filter((t) => t.id !== threadId));
      setState((s) => (s.threadId === threadId ? { turns: [], busy: false } : s));
    },
    [client],
  );

  const rate = useCallback(
    async (messageId: string, feedback: "UP" | "DOWN", comment?: string) => {
      const threadId = state.threadId;
      if (!threadId) return;
      // Optimistic — a failed thumbs-up is not worth interrupting anyone for.
      setState((s) => ({
        ...s,
        turns: s.turns.map((t) => (t.id === messageId ? { ...t, feedback } : t)),
      }));
      await client.sendFeedback(threadId, messageId, feedback, comment).catch(() => {});
    },
    [client, state.threadId],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || state.busy) return;

      const controller = new AbortController();
      abortRef.current = controller;
      const parser = new SentinelParser();
      const answerId = `pending-${Date.now()}`;

      setState((s) => ({
        ...s,
        busy: true,
        error: undefined,
        turns: [
          ...s.turns,
          { id: `q-${Date.now()}`, role: "user", segments: [{ kind: "text", text: trimmed }] },
          { id: answerId, role: "assistant", segments: [], streaming: true },
        ],
      }));

      let realId: string | undefined;
      let sawDelta = false;

      await client.ask(
        trimmed,
        state.threadId,
        {
          onMeta: (meta: AskMeta) => {
            realId = meta.messageId;
            setState((s) => ({ ...s, threadId: meta.threadId, remaining: meta.remaining }));
          },
          onDelta: (text) => {
            sawDelta = true;
            const segments = [...parser.feed(text)];
            setState((s) => ({
              ...s,
              turns: s.turns.map((t) => (t.id === answerId ? { ...t, segments } : t)),
            }));
          },
          onDone: () => {
            const segments = [...parser.end()];
            setState((s) => ({
              ...s,
              busy: false,
              turns: s.turns.map((t) =>
                t.id === answerId
                  ? // Swap in the server's message id so feedback targets the stored row.
                    { ...t, id: realId ?? t.id, segments, streaming: false }
                  : t,
              ),
            }));
          },
          onError: (code, message) => {
            const segments = [...parser.end()];
            setState((s) => ({
              ...s,
              busy: false,
              error: { code, message },
              // Drop the empty assistant bubble if nothing streamed; keep a partial.
              turns: sawDelta
                ? s.turns.map((t) =>
                    t.id === answerId
                      ? { ...t, id: realId ?? t.id, segments, streaming: false, interrupted: true }
                      : t,
                  )
                : s.turns.filter((t) => t.id !== answerId),
            }));
          },
        },
        controller.signal,
      );

      // An abort resolves without onDone/onError — settle the bubble here.
      setState((s) => {
        if (!s.busy) return s;
        const segments = [...parser.end()];
        return {
          ...s,
          busy: false,
          turns: s.turns.map((t) =>
            t.id === answerId
              ? { ...t, id: realId ?? t.id, segments, streaming: false, interrupted: true }
              : t,
          ),
        };
      });
      client.invalidate(realId ? state.threadId : undefined);
      void loadThreads(true);
    },
    [client, state.busy, state.threadId, loadThreads],
  );

  return { state, threads, ask, stop, newChat, openThread, deleteThread, rate, loadThreads };
}
