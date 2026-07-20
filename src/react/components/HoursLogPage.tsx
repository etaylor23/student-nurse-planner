import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { medsByPlacement } from "../../logic/medications";
import { useMedicationLogs, usePlacements, useShifts } from "../hooks";
import { useShiftActions } from "../ShiftsContext";
import { useRepository } from "../RepositoryContext";
import { ActivityLog } from "./ActivityLog";
import { BreakRulesEditor } from "./BreakRulesEditor";
import { HoursSummaryPanel } from "./HoursSummaryPanel";
import { PlacementBreakdown } from "./PlacementBreakdown";
import { PlacementManager } from "./PlacementManager";
import { TopGaps } from "./competencies/TopGaps";
import { TimesheetExport } from "./TimesheetExport";
import { Panel } from "./ui";

export function HoursLogPage() {
  const { repo, user, loading } = useRepository();
  const { placements, reload: reloadPlacements } = usePlacements();
  const { shifts, summary, projection } = useShifts();
  const { logs: medLogs } = useMedicationLogs();
  const medCounts = useMemo(() => medsByPlacement(medLogs, shifts), [medLogs, shifts]);
  const { deleteShift, markWorked } = useShiftActions();
  const navigate = useNavigate();

  if (loading || !user) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  const createPlacement = async (name: string, settingType?: string) => {
    await repo.createPlacement({ userId: user.id, name, settingType });
    await reloadPlacements();
  };

  const updatePlacement = async (id: string, patch: { name: string; settingType?: string }) => {
    await repo.updatePlacement(id, patch);
    await reloadPlacements();
  };

  const removePlacement = async (id: string) => {
    const usedByShift = shifts.some((s) => s.placementId === id);
    const message = usedByShift
      ? "Delete this placement? Shifts logged against it keep their hours but will show no placement."
      : "Delete this placement?";
    if (!window.confirm(message)) return;
    await repo.deletePlacement(id);
    await reloadPlacements();
  };

  const findShift = (id: string) => shifts.find((s) => s.id === id);

  return (
    <div className="space-y-6">
      <HoursSummaryPanel summary={summary} projection={projection} />

      <TopGaps />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-1">
          <Panel step="1" title="Placements" hint="Wards or teams you're on">
            <PlacementManager
              placements={placements}
              onCreate={createPlacement}
              onUpdate={updatePlacement}
              onDelete={removePlacement}
            />
          </Panel>

          <Panel step="2" title="Log a shift" hint="Add the hours you worked">
            {/* All shift editing lives in the planner modal now — this opens it on a
                new shift; the table's "edit" opens it on that shift. */}
            <Link
              to="/planner/new"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-emerald-700"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                strokeLinecap="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              New shift
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Opens the shift editor, where you can log medications, skills, reflections and
              competency evidence against the shift too.
            </p>
          </Panel>
        </div>

        <TimesheetExport
          shifts={shifts}
          placements={placements}
          className="xl:col-span-2"
          onEdit={(id) => navigate(`/planner/${id}`)}
          onDelete={(id) => {
            const shift = findShift(id);
            if (shift) void deleteShift(shift);
          }}
          onMarkWorked={(id) => void markWorked(id)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlacementBreakdown shifts={shifts} placements={placements} medCounts={medCounts} />
        <Panel title="Break rules" hint="How long a break is deducted before a shift counts">
          <BreakRulesEditor />
        </Panel>
      </div>

      <ActivityLog />
    </div>
  );
}
