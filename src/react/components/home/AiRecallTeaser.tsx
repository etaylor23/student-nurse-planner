import { useEffect, useRef, useState } from "react";
import { useRepository } from "../../RepositoryContext";
import { btnPrimary } from "../ui";

/**
 * Coming-soon teaser for AI note-recall: ask in plain English → your own logged note
 * surfaces verbatim → cross-checked against trusted sources. JUST the explainer — the
 * input is a non-functional mock (badged), with an auto-playing scripted demo that
 * rotates through three prompts. A lightweight "notify me" records interest on the
 * synced profile. Source chips are illustrative, not claimed integrations.
 *
 * Rendered INSIDE the Home hero banner (as PageHero children): no card of its own, a
 * hairline divider, and a 1/3 (pitch) · 2/3 (demo) split on desktop.
 *
 * No-jump design: the answer block is revealed ONCE (the only height change) and then
 * stays open — subsequent prompts swap content without collapsing. All three answers
 * share the same line-count so the swap never changes the block's height.
 */
interface Prompt {
  question: string;
  note: string[]; // exactly 6 lines (1 heading + 5 steps) so every answer is the same height
  sources: string[];
}

const PROMPTS: Prompt[] = [
  {
    question:
      "I remember logging how to take a manual blood pressure — but I've forgotten the order of the steps…",
    note: [
      "Manual BP — my note · 2 Mar, Ward 9",
      "1. Rest 5 min, arm supported at heart level",
      "2. Right cuff size, snug on a bare upper arm",
      "3. Estimate systolic from the radial pulse",
      "4. Inflate ~30 mmHg above, then deflate slowly",
      "5. First beat = systolic, last = diastolic",
    ],
    sources: ["NICE", "NMC", "RCN"],
  },
  {
    question: "What was that order I noted down for aseptic non-touch technique again?",
    note: [
      "ANTT — my note · 18 Feb, placement",
      "1. Clean hands, gather and check equipment",
      "2. Clean the tray, decontaminate hands again",
      "3. Set up the field; identify the key-parts",
      "4. Stay non-touch through the whole procedure",
      "5. Dispose of waste, clean hands to finish",
    ],
    sources: ["NICE", "NMC", "RCN"],
  },
  {
    question: "I logged the checks before giving a medication — what were the key ones?",
    note: [
      "Med admin — my note · 9 Mar, Ward 9",
      "1. Right patient, right drug, right dose",
      "2. Right route, right time (the five rights)",
      "3. Check the allergy band and the chart",
      "4. Check expiry, and that it's not withheld",
      "5. Sign only once it's actually been taken",
    ],
    sources: ["BNF", "NICE", "NMC"],
  },
];

export function AiRecallTeaser() {
  const { repo, user, reloadUser } = useRepository();
  const reduceMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // `promptIndex` drives the typing question; `answerIndex` (updated only when the
  // question finishes) drives the shown answer — so the previous answer stays visible
  // while the next question types, keeping the block full-height throughout.
  const [promptIndex, setPromptIndex] = useState(0);
  const [answerIndex, setAnswerIndex] = useState(0);
  const [typed, setTyped] = useState(reduceMotion ? PROMPTS[0].question.length : 0);
  const [revealed, setRevealed] = useState(reduceMotion);
  const [saving, setSaving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const notified = !!user?.aiRecallInterestAt;

  // Auto-playing scripted demo — type a question, reveal/hold, rotate to the next.
  // Disabled under prefers-reduced-motion (initial state shows the first prompt).
  useEffect(() => {
    if (reduceMotion) return;
    let cancelled = false;
    const at = (fn: () => void, ms: number) => {
      timer.current = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };
    const runPrompt = (idx: number) => {
      setPromptIndex(idx);
      setTyped(0);
      const q = PROMPTS[idx].question;
      const typeTo = (i: number) => {
        setTyped(i);
        if (i < q.length) at(() => typeTo(i + 1), 34);
        else {
          setAnswerIndex(idx); // swap the answer to match the question just typed
          setRevealed(true); // one-time reveal; never reset (so the block never collapses)
          at(() => runPrompt((idx + 1) % PROMPTS.length), 4800);
        }
      };
      typeTo(0);
    };
    runPrompt(0);
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

  const question = PROMPTS[promptIndex].question;
  const answer = PROMPTS[answerIndex];

  return (
    <section
      className="mt-5 rounded-2xl border-2 border-dashed border-primary-300 bg-primary-50/40 p-4 lg:p-5"
      aria-label="Coming soon: ask your notes"
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start lg:gap-8">
        {/* Left (1/3) — the pitch + interest capture. */}
        <div className="lg:col-span-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary-700 ring-1 ring-primary-200">
              Coming soon
            </span>
            <span className="text-[11px] font-medium text-slate-400">A taste of what's next</span>
          </div>

          <h2 className="mt-2.5 text-base font-semibold tracking-tight text-ink">
            Ask your own notes anything
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Half-remember something you logged? Ask in plain English and PlaceMate will surface
            your{" "}
            <strong className="font-medium text-slate-700">original note, word for word</strong> —
            then cross-check it against trusted clinical sources.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
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
                <span className="text-xs text-slate-400">
                  No spam — just one heads-up at launch.
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right (2/3) — the live (mock) demo. */}
        <div className="lg:col-span-2">
          {/* Mock chat bar — not live yet (read-only, badged). */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
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
              {question.slice(0, typed)}
              {!reduceMotion && typed < question.length && (
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

          {/* Answer reveal — one-time height change (grid-rows 0fr→1fr), then latched
              open; content swaps between prompts without collapsing. */}
          <div
            className={`grid transition-all duration-500 ${revealed ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
          >
            <div className="overflow-hidden">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
                  From your notes
                </p>
                <div className="mt-2 space-y-0.5 border-l-2 border-primary-200 pl-3 text-sm text-slate-700">
                  {answer.note.map((line, i) => (
                    <p key={line} className={i === 0 ? "text-xs font-medium text-slate-400" : ""}>
                      {line}
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400">Cross-checked against</span>
                  {answer.sources.map((s) => (
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
        </div>
      </div>
    </section>
  );
}
