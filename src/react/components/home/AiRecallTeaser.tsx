import { useEffect, useRef, useState } from "react";
import { useRepository } from "../../RepositoryContext";
import { btnPrimary, card } from "../ui";

/**
 * Coming-soon teaser for AI note-recall: ask in plain English → your own logged note
 * surfaces verbatim → cross-checked against trusted sources. This is JUST the explainer
 * — the input is a non-functional mock (clearly badged), with an auto-playing scripted
 * demo. A lightweight "notify me" records interest on the synced profile so we get a
 * real launch list. Source chips are illustrative, not claimed integrations.
 */
const QUESTION =
  "I remember logging how to take a manual blood pressure in clinical skills — but I've forgotten the order of the steps…";

const NOTE_LINES = [
  "Manual BP — my note · 2 Mar, Ward 9",
  "1. Rest 5 min, arm supported at heart level",
  "2. Right cuff size, snug on a bare upper arm",
  "3. Estimate systolic from the radial pulse first",
  "4. Inflate ~30 mmHg above, deflate 2–3 mmHg/sec",
  "5. First beat = systolic, last beat = diastolic",
];

const SOURCES = ["NICE", "NMC", "RCN"];

export function AiRecallTeaser() {
  const { repo, user, reloadUser } = useRepository();
  const reduceMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const [typed, setTyped] = useState(reduceMotion ? QUESTION.length : 0);
  const [showAnswer, setShowAnswer] = useState(reduceMotion);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const notified = !!user?.aiRecallInterestAt;

  // Auto-playing scripted demo — type the question, reveal the answer, loop gently.
  // Disabled entirely under prefers-reduced-motion (initial state shows the end frame).
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const at = (fn: () => void, ms: number) => {
      timer.current = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const cycle = () => {
      setShowAnswer(false);
      setTyped(0);
      const typeTo = (i: number) => {
        setTyped(i);
        if (i < QUESTION.length) at(() => typeTo(i + 1), 34);
        else
          at(() => {
            setShowAnswer(true);
            at(cycle, 5200);
          }, 500);
      };
      typeTo(0);
    };
    cycle();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [reduceMotion]);

  const notifyMe = async () => {
    setSaving(true);
    try {
      await repo.updateUser({ aiRecallInterestAt: new Date().toISOString() });
      await reloadUser();
    } catch {
      setSaving(false); // let them try again if the save failed
    }
  };

  return (
    <section
      className={`${card} bg-gradient-to-br from-white to-secondary-50/40`}
      aria-label="Coming soon: ask your notes"
    >
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-secondary-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-secondary-700 ring-1 ring-secondary-100">
          Coming soon
        </span>
        <span className="text-[11px] font-medium text-slate-400">A taste of what's next</span>
      </div>

      <h2 className="mt-3 text-lg font-semibold tracking-tight text-ink">
        Ask your own notes anything
      </h2>
      <p className="mt-1 max-w-xl text-sm text-slate-500">
        Half-remember something you logged? Ask in plain English and PlaceMate will surface
        your <strong className="font-medium text-slate-700">original note, word for word</strong> —
        then cross-check it against trusted clinical sources.
      </p>

      {/* Mock chat bar — not live yet (read-only, badged). */}
      <div className="mt-5 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 shrink-0 text-secondary-500"
          aria-hidden="true"
        >
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
          {QUESTION.slice(0, typed)}
          {!reduceMotion && typed < QUESTION.length && (
            <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-slate-400 align-middle" />
          )}
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 rounded-lg bg-primary-600/40 px-2.5 py-1 text-xs font-medium text-white"
        >
          Ask
        </span>
      </div>

      {/* Answer reveal (CSS grid-rows height animation). */}
      <div
        className={`grid transition-all duration-500 ${showAnswer ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
              From your notes
            </p>
            <div className="mt-2 space-y-0.5 border-l-2 border-primary-200 pl-3 text-sm text-slate-700">
              {NOTE_LINES.map((line, i) => (
                <p key={line} className={i === 0 ? "text-xs font-medium text-slate-400" : ""}>
                  {line}
                </p>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400">Cross-checked against</span>
              {SOURCES.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                >
                  {s}
                </span>
              ))}
              <span className="text-[11px] text-slate-300">· examples</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interest capture. */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {notified ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            We'll let you know when it lands 🌱
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void notifyMe()}
              disabled={saving}
              className={btnPrimary}
            >
              {saving ? "Saving…" : "Notify me when it's ready"}
            </button>
            <span className="text-xs text-slate-400">No spam — just one heads-up at launch.</span>
          </>
        )}
      </div>
    </section>
  );
}
