import { Link } from "react-router-dom";
import type { Placement, Shift } from "../../../domain/types";
import { formatHumanDate, hhmm } from "../../../logic/calendar";
import { btnPrimary } from "../ui";

/**
 * The hero's anchor: the single answer to "what should I do next?"
 * (spec-home-redesign.md decision 2).
 *
 * Three states, in order of urgency — on shift right now, a shift coming up, or no
 * shifts at all — and each one ends in a button rather than a statistic. Hours pace
 * used to sit beside it here; it moved to the progress chapter, because a number you
 * can't act on isn't a next action.
 *
 * The CTA is `self-start` deliberately (decision 11): stretched to the card's width it
 * read as a banner and lost its shape as a button.
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

  return (
    <div className="flex flex-col rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/60 sm:min-w-[19rem]">
      {current ? (
        <>
          <span className="text-xs font-medium text-slate-500">On shift now</span>
          <p className="mt-1 text-sm font-medium text-ink">{label(current)}</p>
          <p className="mt-1 text-xs text-slate-400">Capture what you see while it&apos;s fresh.</p>
          <Link to={`/planner/${current.id}`} className={`${btnPrimary} mt-3 self-start`}>
            Open in planner
          </Link>
        </>
      ) : upcoming ? (
        <>
          <span className="text-xs font-medium text-slate-500">Next shift</span>
          <p className="mt-1 text-sm font-medium text-ink">{formatHumanDate(upcoming.date)}</p>
          <p className="text-xs text-slate-400">{label(upcoming)}</p>
          <Link to={`/planner/${upcoming.id}`} className={`${btnPrimary} mt-3 self-start`}>
            Open in planner
          </Link>
        </>
      ) : (
        <>
          <span className="text-xs font-medium text-slate-500">Next shift</span>
          <p className="mt-1 text-sm text-slate-500">No upcoming shifts.</p>
          <Link to="/planner" className={`${btnPrimary} mt-3 self-start`}>
            Plan a shift
          </Link>
        </>
      )}
    </div>
  );
}
