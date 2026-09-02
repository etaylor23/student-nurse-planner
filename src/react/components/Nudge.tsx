import { useState } from "react";
import { Link } from "react-router-dom";
import type { Nudge } from "../../logic/nudges";
import { btnGhostSm } from "./ui";

/**
 * The app's uniform "next step" nudge: one visual language for every suggestion, so the
 * whole platform prompts consistently (see `logic/nudges.ts` for the rules). Use this
 * anywhere a screen wants to point the student at the natural next action rather than
 * inventing a bespoke prompt.
 *
 * Tone rule (D7): a nudge is a gentle, momentum-framed offer. Capped (top `max`),
 * dismissible, and never a nag. Dismissing hides it for the visit; because nudges are
 * derived from live state, acting on one also makes it fall away on its own.
 */
const TONE: Record<Nudge["tone"], { box: string; icon: string }> = {
  primary: { box: "bg-primary-50/70 ring-primary-100", icon: "text-primary-600" },
  accent: { box: "bg-accent-50/60 ring-accent-100", icon: "text-accent-500" },
  info: { box: "bg-white ring-slate-200", icon: "text-secondary-500" },
};

function NudgeCard({
  nudge,
  onDismiss,
  inset,
}: {
  nudge: Nudge;
  onDismiss: () => void;
  /**
   * Render as a bare row rather than its own card, for hosts that already provide the
   * surrounding card (the Today hero). Tone survives in the icon colour, so a row still
   * reads as the same nudge without stacking another box on the page.
   */
  inset?: boolean;
}) {
  const t = TONE[nudge.tone];
  return (
    <div
      // Wraps rather than squeezes: on a phone the CTA is wide enough that a nowrap row
      // would grind the message down to two words per line, so the buttons drop to a
      // second line and the message keeps the first one to itself.
      className={
        inset
          ? "flex flex-wrap items-center gap-x-3 gap-y-2 py-2"
          : `flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 ring-1 ${t.box}`
      }
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`shrink-0 ${inset ? "h-4 w-4" : "h-5 w-5"} ${t.icon}`}
        aria-hidden="true"
      >
        <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      </svg>
      <span className="min-w-[11rem] flex-1 text-sm text-slate-700">{nudge.message}</span>
      <Link to={nudge.href} className={btnGhostSm + " ml-auto shrink-0"}>
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

/**
 * Renders the top `max` non-dismissed nudges (or nothing if there are none).
 *
 * `collapseAfter` turns the list into a queue: that many nudges stay visible and the
 * rest hide behind an "N more" toggle, collapsed by default. A stack of suggestions
 * reads as a to-do list, which is the one thing a nudge must never be, so on a busy
 * page show one and let the student open the rest if they want them.
 *
 * `demoteIds` pushes nudges to the back of the queue without hiding them. Use it
 * when another surface is already saying the same thing (the first-steps checklist
 * and the nudges overlap by design): the duplicate keeps its place in the collapsed
 * set rather than occupying the one visible slot.
 *
 * `hideIds` drops nudges outright. Use it only when another control on the *same*
 * screen already carries both the message and the action, so the nudge would be the
 * second copy of a button the student is already looking at.
 *
 * `inset` renders the list as bare rows inside the host's card instead of a stack of
 * cards of its own.
 */
export function NudgeList({
  nudges,
  max = 2,
  collapseAfter,
  demoteIds,
  hideIds,
  inset = false,
}: {
  nudges: Nudge[];
  max?: number;
  collapseAfter?: number;
  demoteIds?: readonly string[];
  hideIds?: readonly string[];
  inset?: boolean;
}) {
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [expanded, setExpanded] = useState(false);

  const demoted = new Set(demoteIds ?? []);
  const hidden = new Set(hideIds ?? []);
  const live = nudges.filter((n) => !dismissed.has(n.id) && !hidden.has(n.id));
  // Stable partition: priority order (logic/nudges.ts) is preserved within each half.
  const shown = [
    ...live.filter((n) => !demoted.has(n.id)),
    ...live.filter((n) => demoted.has(n.id)),
  ].slice(0, max);
  if (shown.length === 0) return null;

  const onDismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));
  const visible = collapseAfter == null ? shown : shown.slice(0, collapseAfter);
  const rest = collapseAfter == null ? [] : shown.slice(collapseAfter);

  // The toggle sits last in both states. Between the visible row and the expanded ones
  // it would read as another list item, which is exactly what an inset list can't afford.
  const rows = expanded ? [...visible, ...rest] : visible;

  return (
    <section aria-label="Suggested next steps">
      <div className={inset ? "divide-y divide-slate-100" : "space-y-2"}>
        {rows.map((n) => (
          <NudgeCard key={n.id} nudge={n} onDismiss={() => onDismiss(n.id)} inset={inset} />
        ))}
      </div>

      {rest.length > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={`inline-flex items-center gap-1 px-1 text-xs font-medium text-slate-400 transition hover:text-slate-600 ${
            inset ? "mt-1" : "mt-1.5"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3 transition-transform duration-150"
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
          {expanded ? "Show less" : `${rest.length} more suggestion${rest.length === 1 ? "" : "s"}`}
        </button>
      )}
    </section>
  );
}
