import { Link } from "react-router-dom";
import type { Placement, Shift } from "../../../domain/types";
import { formatHumanDate, hhmm } from "../../../logic/calendar";
import { btnPrimary } from "../ui";

/**
 * The hero's anchor: the single answer to "what should I do next?"
 * (spec-home-redesign.md decision 2).
 *
 * Three states, in order of urgency: on shift right now, a shift coming up, or no
 * shifts at all. Each one ends in a button rather than a statistic. Hours pace used to
 * sit beside it here; it moved to the progress chapter, because a number you can't act
 * on isn't a next action.
 *
 * One line of text and one button, laid out as a row on anything wider than a phone,
 * so the whole block is two lines tall. The "why bother" copy (previously its own
 * nudge, and its own third line here) is the block's `title` instead: it earns a hover,
 * not a permanent line in the most expensive part of the page.
 */
export function NextShiftCard({
  current,
  upcoming,
  placements,
}: {
  /** The shift in progress right now, if any. */
  current?: Shift;
  /** The next shift starting after now, if any. */
  upcoming?: Shift;
  placements: Placement[];
}) {
  const placeName = new Map(placements.map((p) => [p.id, p.name]));
  const label = (s: Shift) => {
    const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
    const times =
      s.startAt && s.endAt ? ` · ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
    return `${place}${times}`;
  };

  const state = current
    ? {
        eyebrow: "On shift now",
        line: label(current),
        hint: "Capture what you see while it's fresh.",
        cta: "Open in planner",
        href: `/planner/${current.id}`,
      }
    : upcoming
      ? {
          eyebrow: "Next shift",
          line: `${formatHumanDate(upcoming.date)} · ${label(upcoming)}`,
          hint: "Open it to plan what you want to get out of the shift.",
          cta: "Open in planner",
          href: `/planner/${upcoming.id}`,
        }
      : {
          eyebrow: "Next shift",
          line: "No upcoming shifts",
          hint: "Plan your next shift so your hours keep counting.",
          cta: "Plan a shift",
          href: "/planner",
        };

  return (
    <div
      title={state.hint}
      className="flex flex-col gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {state.eyebrow}
        </span>
        <p className="text-sm font-medium text-ink">{state.line}</p>
      </div>
      <Link to={state.href} className={`${btnPrimary} shrink-0 self-start sm:ml-auto`}>
        {state.cta}
      </Link>
    </div>
  );
}
