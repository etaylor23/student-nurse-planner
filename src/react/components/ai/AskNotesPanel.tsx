import { useEffect, useRef, useState } from "react";
import { useRepository } from "../../RepositoryContext";
import { btnGhostSm, btnPrimary, inputCls } from "../ui";
import { useAskNotes, type Turn } from "./useAskNotes";
import { NoteCard } from "./NoteCard";
import { resolveSource } from "./config";
import type { Segment } from "./sentinelParser";

/**
 * "Ask your own notes" — the live feature the Home teaser promised
 * (spec-ai-recall.md §UX states). ONE component, mounted both in the Home hero slot and
 * in the global ask overlay (D8), so behaviour can't drift between the two.
 */
export function AskNotesPanel({ autoFocus = false }: { autoFocus?: boolean }) {
  const { user, reloadUser } = useRepository();
  const { state, threads, ask, stop, newChat, openThread, deleteThread, rate, loadThreads } =
    useAskNotes();
  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // The one-off beta notice (D13): auto-dismisses the moment they ask — no button.
  const [showNotice, setShowNotice] = useState(!user?.aiFirstUsedAt);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.turns]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || state.busy) return;
    setDraft("");
    if (showNotice) {
      setShowNotice(false);
      // The server stamps aiFirstUsedAt; refresh the profile so it stays dismissed.
      void ask(q).then(() => reloadUser().catch(() => {}));
      return;
    }
    void ask(q);
  };

  const capReached = state.error?.code === "CAP";
  const killed = state.error?.code === "KILLED";
  const disabled = state.busy || capReached || killed;

  return (
    <div className="flex min-h-0 flex-col">
      {showNotice && (
        <p className="mb-3 rounded-xl bg-secondary-50 px-3 py-2 text-xs text-secondary-800 ring-1 ring-secondary-100">
          During beta, your questions and answers are stored and may be reviewed by the PlaceMate
          team to improve accuracy. Your notes themselves stay yours.
        </p>
      )}

      {/* History strip — past chats (D15). Collapsed by default so the input leads. */}
      {(threads?.length ?? 0) > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className={btnGhostSm}
              aria-expanded={showHistory}
            >
              {showHistory ? "Hide" : "Past chats"} ({threads?.length})
            </button>
            {state.turns.length > 0 && (
              <button type="button" onClick={newChat} className={btnGhostSm}>
                New chat
              </button>
            )}
          </div>
          {showHistory && (
            <ul className="mt-2 space-y-1">
              {threads?.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHistory(false);
                      void openThread(t.id);
                    }}
                    className="min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm text-slate-600 hover:bg-slate-50"
                  >
                    {t.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteThread(t.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Delete chat: ${t.title}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Transcript */}
      {state.turns.length > 0 && (
        <div className="mb-3 max-h-[26rem] min-h-0 space-y-3 overflow-y-auto pr-1">
          {state.turns.map((turn) => (
            <TurnView
              key={turn.id}
              turn={turn}
              onRate={(fb) => {
                if (fb === "DOWN") {
                  setCommentFor(turn.id);
                  setComment("");
                }
                void rate(turn.id, fb);
              }}
              showCommentBox={commentFor === turn.id}
              comment={comment}
              onComment={setComment}
              onSubmitComment={() => {
                void rate(turn.id, "DOWN", comment.trim() || undefined);
                setCommentFor(null);
              }}
            />
          ))}
          <div ref={endRef} />
        </div>
      )}

      {/* Error / limit states */}
      {state.error && (
        <p
          className={`mb-3 rounded-xl px-3 py-2 text-sm ${
            capReached || killed
              ? "bg-primary-50 text-primary-800 ring-1 ring-primary-100"
              : "bg-amber-50 text-amber-900 ring-1 ring-amber-100"
          }`}
          role="status"
        >
          {state.error.message}
        </p>
      )}

      {/* Composer */}
      <form onSubmit={submit} className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={killed}
          maxLength={2000}
          placeholder="Ask about something you've logged…"
          aria-label="Ask your notes"
          className={`${inputCls} flex-1`}
        />
        {state.busy ? (
          <button type="button" onClick={stop} className={btnGhostSm}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={disabled || !draft.trim()} className={btnPrimary}>
            Ask
          </button>
        )}
      </form>

      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-400">
        <span>
          Answers come from your own notes. Educational support, not clinical guidance. Always check
          your placement&apos;s local policy.
        </span>
        {typeof state.remaining === "number" && state.remaining <= 5 && (
          <span className="font-medium text-slate-500">
            {state.remaining} question{state.remaining === 1 ? "" : "s"} left today
          </span>
        )}
      </p>
    </div>
  );
}

function TurnView({
  turn,
  onRate,
  showCommentBox,
  comment,
  onComment,
  onSubmitComment,
}: {
  turn: Turn;
  onRate: (fb: "UP" | "DOWN") => void;
  showCommentBox: boolean;
  comment: string;
  onComment: (v: string) => void;
  onSubmitComment: () => void;
}) {
  if (turn.role === "user") {
    return (
      <p className="ml-auto max-w-[85%] rounded-2xl bg-primary-600 px-3 py-2 text-sm text-white">
        {turn.segments.map((s) => (s.kind === "text" ? s.text : "")).join("")}
      </p>
    );
  }

  return (
    <div className="max-w-[95%]">
      <div className="text-sm leading-relaxed text-slate-700">
        {turn.segments.map((seg, i) => (
          <SegmentView key={i} seg={seg} />
        ))}
        {turn.streaming && (
          <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-slate-400 align-middle" />
        )}
      </div>

      {turn.interrupted && (
        <p className="mt-1 text-[11px] text-amber-700">
          That answer was cut short. Ask again to get the rest.
        </p>
      )}

      {!turn.streaming && turn.segments.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1">
          <button
            type="button"
            onClick={() => onRate("UP")}
            aria-label="Helpful"
            aria-pressed={turn.feedback === "UP"}
            className={`rounded-lg px-1.5 py-0.5 text-xs ${turn.feedback === "UP" ? "bg-primary-100 text-primary-700" : "text-slate-400 hover:bg-slate-100"}`}
          >
            👍
          </button>
          <button
            type="button"
            onClick={() => onRate("DOWN")}
            aria-label="Not helpful"
            aria-pressed={turn.feedback === "DOWN"}
            className={`rounded-lg px-1.5 py-0.5 text-xs ${turn.feedback === "DOWN" ? "bg-rose-100 text-rose-700" : "text-slate-400 hover:bg-slate-100"}`}
          >
            👎
          </button>
        </div>
      )}

      {showCommentBox && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            value={comment}
            onChange={(e) => onComment(e.target.value)}
            placeholder="What was off? (optional)"
            maxLength={500}
            className={`${inputCls} flex-1 text-xs`}
          />
          <button type="button" onClick={onSubmitComment} className={btnGhostSm}>
            Send
          </button>
        </div>
      )}
    </div>
  );
}

function SegmentView({ seg }: { seg: Segment }) {
  if (seg.kind === "text") return <span className="whitespace-pre-wrap">{seg.text}</span>;
  if (seg.kind === "note") return <NoteCard type={seg.type} id={seg.id} />;
  const { label, href } = resolveSource(seg.source);
  return (
    <a
      href={href(seg.topic)}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-0.5 inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 align-middle text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
    >
      Find more on {label}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
