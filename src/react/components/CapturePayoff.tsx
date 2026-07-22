import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { sentenceCase } from "../../logic/text";

/**
 * The "this counts" payoff — the app's heartbeat (plan A1 / ethos D3). The instant
 * a student captures something, this surfaces what it fed toward NMC registration
 * and clinical confidence — hours banked, a proficiency it can evidence, a skill
 * record, a reflection — each a tappable deep-link to its destination.
 *
 * One global, momentum-framed toast so every capture surface (shift-modal tabs and
 * standalone pages alike) speaks the same encouraging language, instead of each
 * screen inventing its own confirmation. Rendered above the shift modal via a
 * portal; auto-dismisses, pauses on hover, and clicking a link takes you there.
 *
 * Tone rule (D7): momentum, never a nag. Only shown when a capture genuinely fed
 * something — an empty item list shows nothing (no hollow "+0").
 */

/** One downstream effect a capture produced. `href` deep-links to its destination. */
export interface PayoffItem {
  /** Stable key within a payoff. */
  key: string;
  /** Which glyph to show — a light visual cue, not a hard taxonomy. */
  kind: "hours" | "evidence" | "skill" | "reflection" | "med" | "record";
  /** The momentum-framed line, e.g. "Evidences 1.1 — you can take this to your assessor". */
  text: string;
  /** Optional deep-link target (a react-router path). Renders the row as a link. */
  href?: string;
}

interface Payoff {
  id: number;
  /** The celebratory headline, e.g. "Nice — that's logged". */
  title: string;
  items: PayoffItem[];
}

interface CapturePayoffApi {
  /**
   * Show a payoff. Pass the derived downstream effects; if `items` is empty,
   * nothing is shown (a capture that fed nothing gets no hollow confirmation).
   */
  showPayoff: (title: string, items: PayoffItem[]) => void;
}

const CapturePayoffContext = createContext<CapturePayoffApi | null>(null);

/** How long a payoff stays before auto-dismissing (paused while hovered/focused). */
const VISIBLE_MS = 9000;

export function CapturePayoffProvider({ children }: { children: ReactNode }) {
  const [payoff, setPayoff] = useState<Payoff | null>(null);
  const idRef = useRef(0);

  const showPayoff = useCallback((title: string, items: PayoffItem[]) => {
    if (items.length === 0) return; // no hollow "+0"
    idRef.current += 1;
    setPayoff({ id: idRef.current, title, items });
  }, []);

  const api = useMemo(() => ({ showPayoff }), [showPayoff]);

  return (
    <CapturePayoffContext.Provider value={api}>
      {children}
      {payoff && (
        <CapturePayoffToast
          key={payoff.id}
          payoff={payoff}
          onDismiss={() => setPayoff((p) => (p?.id === payoff.id ? null : p))}
        />
      )}
    </CapturePayoffContext.Provider>
  );
}

/** Access the payoff API. Safe to call anywhere under the provider. */
export function useCapturePayoff(): CapturePayoffApi {
  const ctx = useContext(CapturePayoffContext);
  if (!ctx) {
    // A no-op fallback keeps capture flows working even if a surface renders
    // outside the provider (e.g. an isolated test), rather than throwing.
    return { showPayoff: () => {} };
  }
  return ctx;
}

function CapturePayoffToast({ payoff, onDismiss }: { payoff: Payoff; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(onDismiss, VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [paused, onDismiss]);

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center px-4 pb-4 sm:px-6 sm:pb-6"
      aria-live="polite"
    >
      <div
        role="status"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
        className="pm-payoff-in pointer-events-auto w-full max-w-md rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.06),0_24px_48px_-24px_rgba(16,24,40,0.35)] ring-1 ring-emerald-100"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">{payoff.title}</p>
            <ul className="mt-2 space-y-1.5">
              {payoff.items.map((item) => (
                <li key={item.key}>
                  {item.href ? (
                    <Link
                      to={item.href}
                      onClick={onDismiss}
                      className="group flex items-start gap-2 rounded-lg px-1.5 py-1 -mx-1.5 text-sm text-slate-600 transition hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                    >
                      <PayoffGlyph kind={item.kind} />
                      <span className="min-w-0 flex-1">{item.text}</span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-slate-300 transition group-hover:text-emerald-600"
                      >
                        →
                      </span>
                    </Link>
                  ) : (
                    <span className="flex items-start gap-2 px-1.5 py-1 text-sm text-slate-600">
                      <PayoffGlyph kind={item.kind} />
                      <span className="min-w-0 flex-1">{item.text}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- Shared item builders — one phrasing for each downstream effect, so every
//      capture surface speaks the same encouraging language. ----

/** Clip a long statement to a compact tail for a payoff line. */
function clip(s: string, n = 64): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t;
}

/**
 * "Evidences {code} — {statement}" — the strongest "counts toward registration"
 * line, deep-linking to the proficiency it now feeds.
 */
export function evidenceItem(p: { id: string; code: string; statement?: string }): PayoffItem {
  const tail = p.statement ? ` — ${clip(sentenceCase(p.statement))}` : "";
  return {
    key: `evi-${p.id}`,
    kind: "evidence",
    text: `Evidences ${p.code}${tail}`,
    href: `/competencies/proficiency/${p.id}`,
  };
}

/** A small colour-coded glyph per contribution kind. Decorative. */
function PayoffGlyph({ kind }: { kind: PayoffItem["kind"] }) {
  const colour: Record<PayoffItem["kind"], string> = {
    hours: "bg-emerald-400",
    evidence: "bg-sky-400",
    skill: "bg-amber-400",
    reflection: "bg-violet-400",
    med: "bg-indigo-400",
    record: "bg-slate-300",
  };
  return (
    <span
      className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colour[kind]}`}
      aria-hidden="true"
    />
  );
}
