import { Link } from "react-router-dom";
import type { Shift } from "../../../domain/types";
import { formatHumanDate, hhmm } from "../../../logic/calendar";
import { shiftContribution } from "../../../logic/contributions";
import {
  useMedicationLogs,
  usePlacements,
  useProficiencies,
  useReflections,
  useShifts,
  useSkills,
} from "../../hooks";
import { Panel } from "../ui";

/**
 * "Catch up" — worked shifts you haven't captured anything from yet. A shift that's
 * marked worked but carries no skill, reflection, med log or competency evidence is
 * an easy win waiting to happen: open it and a quick capture makes it count.
 *
 * Framed as a gentle offer, never a guilt trip (ethos D7) — un-captured work is an
 * opportunity, not a debt. Renders nothing when there's nothing to catch up on.
 */
export function CatchUpShifts({ limit = 3 }: { limit?: number }) {
  const { shifts } = useShifts();
  const { placements } = usePlacements();
  const { evidenceLinks } = useProficiencies();
  const { progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { logs } = useMedicationLogs();

  const placeName = new Map(placements.map((p) => [p.id, p.name]));

  const input = { evidenceLinks, skillProgress, reflections, medLogs: logs };
  const unCaptured = shifts
    .filter((s) => s.status === "COMPLETED")
    .filter((s) => {
      const c = shiftContribution(s, input);
      return (
        c.proficienciesEvidenced === 0 && c.skills === 0 && c.reflections === 0 && c.medLogs === 0
      );
    })
    // Newest first — the freshest shifts are the easiest to recall.
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  if (unCaptured.length === 0) return null;

  const label = (s: Shift) => {
    const place = s.placementId ? (placeName.get(s.placementId) ?? "Placement") : "No placement";
    const time =
      s.startAt && s.endAt ? ` · ${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "";
    return `${place}${time}`;
  };

  return (
    <Panel
      title="A few quick wins"
      hint={
        unCaptured.length === 1
          ? "A worked shift you could capture from"
          : `${unCaptured.length} worked shifts you could capture from`
      }
    >
      <p className="mb-3 text-sm text-slate-500">
        You worked these — a quick capture turns each into hours, skills and PAD evidence.
      </p>
      <ul className="divide-y divide-slate-100">
        {unCaptured.slice(0, limit).map((s) => (
          <li key={s.id}>
            <Link
              to={`/planner/${s.id}`}
              className="group flex items-center gap-3 py-2.5 transition first:pt-0 last:pb-0 hover:bg-slate-50"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-700">{formatHumanDate(s.date)}</div>
                <div className="truncate text-xs text-slate-400">{label(s)}</div>
              </div>
              <span className="shrink-0 text-xs font-medium text-emerald-600 group-hover:text-emerald-700">
                Capture →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
