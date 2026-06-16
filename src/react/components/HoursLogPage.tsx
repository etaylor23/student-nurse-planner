import { useState } from "react";
import type { Shift } from "../../domain/types";
import { usePlacements, useShifts } from "../hooks";
import { useRepository } from "../RepositoryContext";
import { HoursSummaryPanel } from "./HoursSummaryPanel";
import { PlacementManager } from "./PlacementManager";
import { ShiftForm, type ShiftDraft } from "./ShiftForm";
import { TimesheetExport } from "./TimesheetExport";
import { Panel } from "./ui";

export function HoursLogPage() {
  const { repo, user, loading } = useRepository();
  const { placements, reload: reloadPlacements } = usePlacements();
  const { shifts, summary, reload: reloadShifts } = useShifts();
  // null = form closed, "new" = adding, Shift = editing that shift.
  const [editing, setEditing] = useState<Shift | "new" | null>(null);

  if (loading || !user) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  const createPlacement = async (name: string, settingType?: string) => {
    await repo.createPlacement({ userId: user.id, name, settingType });
    await reloadPlacements();
  };

  const submitShift = async (draft: ShiftDraft) => {
    if (editing && editing !== "new") {
      await repo.updateShift(editing.id, draft);
    } else {
      await repo.createShift({ ...draft, userId: user.id });
    }
    setEditing(null);
    await reloadShifts();
  };

  const removeShift = async (shift: Shift) => {
    if (!window.confirm(`Delete the ${shift.date} shift? This can't be undone.`)) return;
    if (editing && editing !== "new" && editing.id === shift.id) setEditing(null);
    await repo.deleteShift(shift.id);
    await reloadShifts();
  };

  const findShift = (id: string) => shifts.find((s) => s.id === id);
  const isEditing = editing !== null && editing !== "new";

  return (
    <div className="space-y-6">
      <HoursSummaryPanel summary={summary} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-1">
          <Panel step="1" title="Placements" hint="Wards or teams you're on">
            <PlacementManager placements={placements} onCreate={createPlacement} />
          </Panel>

          <Panel
            step={isEditing ? undefined : "2"}
            title={isEditing ? "Edit shift" : "Log a shift"}
            hint={isEditing ? "Update the details below" : "Add the hours you worked"}
          >
            {editing ? (
              <ShiftForm
                placements={placements}
                initial={editing === "new" ? undefined : editing}
                onSubmit={submitShift}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing("new")}
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
              </button>
            )}
          </Panel>
        </div>

        <TimesheetExport
          shifts={shifts}
          placements={placements}
          className="xl:col-span-2"
          onEdit={(id) => {
            const shift = findShift(id);
            if (shift) setEditing(shift);
          }}
          onDelete={(id) => {
            const shift = findShift(id);
            if (shift) void removeShift(shift);
          }}
        />
      </div>
    </div>
  );
}
