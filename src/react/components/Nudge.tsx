import { useState } from "react";
import { Link } from "react-router-dom";
import type { Nudge } from "../../logic/nudges";
import { btnGhostSm } from "./ui";

/**
 * The app's uniform "next step" nudge — one visual language for every suggestion, so the
 * whole platform prompts consistently (see `logic/nudges.ts` for the rules). Use this
 * anywhere a screen wants to point the student at the natural next action rather than
 * inventing a bespoke prompt.
 *
 * Tone rule (D7): a nudge is a gentle, momentum-framed offer — capped (top `max`),
 * dismissible, and never a nag. Dismissing hides it for the visit; because nudges are
 * derived from live state, acting on one also makes it fall away on its own.
 */
const TONE: Record<Nudge["tone"], { box: string; icon: string }> = {
  primary: { box: "bg-primary-50/70 ring-primary-100", icon: "text-primary-600" },
  accent: { box: "bg-accent-50/60 ring-accent-100", icon: "text-accent-500" },
  info: { box: "bg-white ring-slate-200", icon: "text-secondary-500" },
};

function NudgeCard({ nudge, onDismiss }: { nudge: Nudge; onDismiss: () => void }) {
  const t = TONE[nudge.tone];
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ring-1 ${t.box}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-5 w-5 shrink-0 ${t.icon}`}
        aria-hidden="true"
      >
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      </svg>
      <span className="min-w-0 flex-1 text-sm text-slate-700">{nudge.message}</span>
      <Link to={nudge.href} className={btnGhostSm + " shrink-0"}>
        {nudge.cta}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </Link>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this suggestion"
        className="-mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Renders the top `max` non-dismissed nudges (or nothing if there are none). */
export function NudgeList({ nudges, max = 2 }: { nudges: Nudge[]; max?: number }) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const shown = nudges.filter((n) => !dismissed.has(n.id)).slice(0, max);
  if (shown.length === 0) return null;
  return (
    <section className="space-y-2" aria-label="Suggested next steps">
      {shown.map((n) => (
        <NudgeCard
          key={n.id}
          nudge={n}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(n.id))}
        />
      ))}
    </section>
  );
}
