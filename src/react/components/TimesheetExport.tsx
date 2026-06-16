import { useState } from "react";
import { Link } from "react-router-dom";
import type { Placement, Shift } from "../../domain/types";
import { buildTimesheet, timesheetToCsv } from "../../logic/timesheet";
import { downloadCsv } from "../download";
import { Panel, btnGhostSm } from "./ui";

const filterCtl =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

/** "2026-06-18" -> "Thu 18 Jun" for display (CSV keeps the ISO date). */
function formatShiftDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

export function TimesheetExport({
  shifts,
  placements,
  className,
  onEdit,
  onDelete,
  onMarkWorked,
}: {
  shifts: Shift[];
  placements: Placement[];
  className?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onMarkWorked?: (id: string) => void;
}) {
  const [placementFilter, setPlacementFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = shifts.filter((s) => {
    if (placementFilter === "none" && s.placementId) return false;
    if (placementFilter && placementFilter !== "none" && s.placementId !== placementFilter)
      return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (fromDate && s.date < fromDate) return false;
    if (toDate && s.date > toDate) return false;
    return true;
  });

  const rows = buildTimesheet(filtered, placements);
  const showActions = !!(onEdit || onDelete || onMarkWorked);
  const isFiltered = !!(placementFilter || statusFilter || fromDate || toDate);
  const clearFilters = () => {
    setPlacementFilter("");
    setStatusFilter("");
    setFromDate("");
    setToDate("");
  };

  return (
    <Panel
      title="Your shifts"
      hint="Everything you've logged"
      className={className}
      action={
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={() => downloadCsv("placement-timesheet.csv", timesheetToCsv(rows))}
            className={btnGhostSm}
          >
            Export CSV
          </button>
          <button type="button" onClick={() => window.print()} className={btnGhostSm}>
            Print / PDF
          </button>
        </div>
      }
    >
      {shifts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <select
            value={placementFilter}
            onChange={(e) => setPlacementFilter(e.target.value)}
            className={filterCtl}
            aria-label="Filter by placement"
          >
            <option value="">All placements</option>
            {placements.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value="none">No placement</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={filterCtl}
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            <option value="COMPLETED">Counted</option>
            <option value="PLANNED">Planned</option>
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={filterCtl}
            aria-label="From date"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={filterCtl}
            aria-label="To date"
          />
          {isFiltered && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-emerald-600"
            >
              Clear ({rows.length} of {shifts.length})
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 py-12 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-slate-300"
            aria-hidden="true"
          >
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
          </svg>
          {shifts.length > 0 ? (
            <>
              <p className="text-sm font-medium text-slate-500">No shifts match these filters</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-emerald-600"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-500">No shifts logged yet</p>
              <p className="text-xs text-slate-400">They'll appear here once you log one.</p>
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200/70">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-medium">Date</th>
                <th className="px-4 py-2.5 font-medium">Placement</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 text-right font-medium">Counted</th>
                <th className="px-4 py-2.5 font-medium">Sim.</th>
                <th className="px-4 py-2.5 font-medium">Reg. nurse</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                {showActions && (
                  <th className="px-4 py-2.5 text-right font-medium print:hidden">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="text-slate-700 transition-colors hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2.5">{formatShiftDate(r.date)}</td>
                  <td className="px-4 py-2.5">{r.placement}</td>
                  <td className="px-4 py-2.5">{r.shiftType}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.netHours}</td>
                  <td className="px-4 py-2.5">
                    {r.simulated === "Yes" ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-sky-100">
                        Sim
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{r.supervisingRn || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-medium " +
                        (r.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200/60")
                      }
                    >
                      {r.status === "COMPLETED" ? "Counted" : "Planned"}
                    </span>
                  </td>
                  {showActions && (
                    <td className="px-4 py-2.5 print:hidden">
                      <div className="flex justify-end gap-1">
                        <Link
                          to={`/planner?date=${r.date}`}
                          aria-label={`View ${r.date} in the planner`}
                          title="View in planner"
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path d="M8 3v4m8-4v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
                          </svg>
                        </Link>
                        {onMarkWorked && r.status === "PLANNED" && (
                          <button
                            type="button"
                            onClick={() => onMarkWorked(r.id)}
                            aria-label={`Mark ${r.date} shift as worked`}
                            title="Mark as worked"
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-700"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.8}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path d="m5 13 4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        {onEdit && (
                          <button
                            type="button"
                            onClick={() => onEdit(r.id)}
                            aria-label={`Edit ${r.date} shift`}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                        )}
                        {onDelete && (
                          <button
                            type="button"
                            onClick={() => onDelete(r.id)}
                            aria-label={`Delete ${r.date} shift`}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-4 w-4"
                              aria-hidden="true"
                            >
                              <path d="M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
