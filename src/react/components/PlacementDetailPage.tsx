import { Link, useParams } from "react-router-dom";
import { SHIFT_TYPE_LABEL, type Shift } from "../../domain/types";
import { formatHumanDate, hhmm } from "../../logic/calendar";
import { summarisePlacement } from "../../logic/placementSummary";
import {
  useMedicationLogs,
  useMedications,
  usePlacements,
  useProficiencies,
  useReflections,
  useShifts,
  useSkills,
} from "../hooks";
import { Panel, StatTile } from "./ui";

/**
 * Placement debrief (U3) — "what did this placement give me?". A detail-only route
 * (`/placements/:id`, no nav entry, like `/planner/:shiftId`) answering the question
 * a student takes into a midpoint/final PAD interview: hours, shifts, meds seen,
 * proficiencies evidenced and skills signed off — all in-memory joins off the shift →
 * placement link (aggregation in the pure `logic/placementSummary.ts`).
 */
export function PlacementDetailPage() {
  const { id } = useParams();
  const { shifts } = useShifts();
  const { logs } = useMedicationLogs();
  const { medications } = useMedications();
  const { proficiencies, evidenceLinks } = useProficiencies();
  const { skills, progress: skillProgress } = useSkills();
  const { reflections } = useReflections();
  const { placements } = usePlacements();

  const placement = placements.find((p) => p.id === id);

  if (placements.length === 0) {
    return (
      <Panel title="Placement">
        <p className="text-sm text-slate-400">Loading…</p>
      </Panel>
    );
  }
  if (!placement || !id) {
    return (
      <Panel title="Placement not found">
        <p className="text-sm text-slate-500">
          This placement couldn't be found.{" "}
          <Link to="/placement-hours" className="font-medium text-emerald-700">
            Back to the hours log
          </Link>
        </p>
      </Panel>
    );
  }

  const summary = summarisePlacement(id, {
    shifts,
    medLogs: logs,
    evidenceLinks,
    skillProgress,
    reflections,
  });

  const medName = new Map(medications.map((m) => [m.id, m.name]));
  const profById = new Map(proficiencies.map((p) => [p.id, p]));
  const skillName = new Map(skills.map((s) => [s.id, s.name]));
  const reflectionTitle = new Map(reflections.map((r) => [r.id, r.title]));

  const shiftLine = (s: Shift) => {
    const times =
      s.startAt && s.endAt ? `${hhmm(new Date(s.startAt))}–${hhmm(new Date(s.endAt))}` : "all day";
    return `${SHIFT_TYPE_LABEL[s.shiftType]} · ${times}`;
  };

  // Meds seen here, grouped by medication (most-logged first).
  const medCounts = new Map<string, number>();
  for (const l of summary.medLogs) {
    const key = l.medicationId ?? "__unlinked__";
    medCounts.set(key, (medCounts.get(key) ?? 0) + 1);
  }
  const medRows = [...medCounts.entries()].sort((a, b) => b[1] - a[1]);

  const span = summary.dateSpan;

  return (
    <div className="space-y-6">
      <Link to="/placement-hours" className="text-sm font-medium text-emerald-700">
        ← Hours log
      </Link>

      <Panel
        title={placement.name}
        hint={
          span
            ? `${formatHumanDate(span.from)} – ${formatHumanDate(span.to)}${placement.settingType ? ` · ${placement.settingType}` : ""}`
            : (placement.settingType ?? "What this placement gave you")
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            dot="bg-emerald-500"
            label="Counted"
            value={`${summary.countedHours} h`}
            sub={`${summary.shiftCount} shift${summary.shiftCount === 1 ? "" : "s"}`}
          />
          <StatTile
            dot="bg-amber-500"
            label="Planned"
            value={`${summary.plannedHours} h`}
            sub="not counted yet"
          />
          <StatTile
            dot="bg-sky-500"
            label="Meds seen"
            value={String(summary.medLogs.length)}
            sub={`${medRows.length} medication${medRows.length === 1 ? "" : "s"}`}
          />
          <StatTile
            dot="bg-emerald-500"
            label="Proficiencies"
            value={String(summary.proficiencyIds.length)}
            sub="evidenced here"
          />
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Shifts" hint="Every shift logged at this placement">
          {summary.shifts.length === 0 ? (
            <p className="text-sm text-slate-400">No shifts logged here yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.shifts.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/planner/${s.id}`}
                    className="flex items-center gap-3 py-2.5 transition first:pt-0 last:pb-0 hover:bg-slate-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-700">
                        {formatHumanDate(s.date)}
                      </span>
                      <span className="block text-xs text-slate-400">{shiftLine(s)}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-slate-600">
                      {s.netHours} h
                    </span>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium " +
                        (s.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200/60")
                      }
                    >
                      {s.status === "COMPLETED" ? "Counted" : "Planned"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Medications seen" hint="Logged during shifts here">
          {medRows.length === 0 ? (
            <p className="text-sm text-slate-400">No medications logged here yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {medRows.map(([key, count]) => (
                <li
                  key={key}
                  className="flex items-center gap-2 py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  {key === "__unlinked__" ? (
                    <span className="min-w-0 flex-1 truncate text-slate-500">Unlinked</span>
                  ) : (
                    <Link
                      to={`/medications/${key}`}
                      className="min-w-0 flex-1 truncate text-slate-700 hover:text-emerald-700"
                    >
                      {medName.get(key) ?? "Medication"}
                    </Link>
                  )}
                  <span className="shrink-0 text-xs text-slate-400">×{count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Proficiencies evidenced" hint="Shifts here attached as evidence">
          {summary.proficiencyIds.length === 0 ? (
            <p className="text-sm text-slate-400">
              No proficiencies evidenced from here yet — attach a shift as evidence from its editor.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.proficiencyIds.map((pid) => {
                const p = profById.get(pid);
                return (
                  <li key={pid}>
                    <Link
                      to={`/competencies/proficiency/${pid}`}
                      className="flex items-start gap-3 py-2.5 transition first:pt-0 last:pb-0 hover:bg-slate-50"
                    >
                      <span className="mt-0.5 w-12 shrink-0 text-xs font-semibold tabular-nums text-slate-400">
                        {p?.code ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1 text-sm text-slate-700">
                        {p?.statement ?? "Proficiency"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="Skills signed off" hint="Signed off during shifts here">
          {summary.signedOffSkillIds.length === 0 ? (
            <p className="text-sm text-slate-400">No skills signed off here yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.signedOffSkillIds.map((sid) => (
                <li key={sid}>
                  <Link
                    to={`/skills/${sid}`}
                    className="block truncate py-2.5 text-sm text-slate-700 transition first:pt-0 last:pb-0 hover:text-emerald-700"
                  >
                    {skillName.get(sid) ?? "Skill"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Reflections written" hint="Reflecting on shifts here">
          {summary.reflectionIds.length === 0 ? (
            <p className="text-sm text-slate-400">
              No reflections on this placement yet — write one from a shift's debrief.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {summary.reflectionIds.map((rid) => (
                <li key={rid}>
                  <Link
                    to={`/reflection/${rid}`}
                    className="block truncate py-2.5 text-sm text-slate-700 transition first:pt-0 last:pb-0 hover:text-emerald-700"
                  >
                    {reflectionTitle.get(rid) ?? "Reflection"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
