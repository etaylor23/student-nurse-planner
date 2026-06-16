import type { Placement, Shift } from "../../domain/types";
import { buildTimesheet, timesheetToCsv } from "../../logic/timesheet";
import { Panel, btnGhostSm } from "./ui";

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function TimesheetExport({
  shifts,
  placements,
  className,
  onEdit,
  onDelete,
}: {
  shifts: Shift[];
  placements: Placement[];
  className?: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const rows = buildTimesheet(shifts, placements);
  const showActions = !!(onEdit || onDelete);

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
          <p className="text-sm font-medium text-slate-500">No shifts logged yet</p>
          <p className="text-xs text-slate-400">They'll appear here once you log one.</p>
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
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums">{r.date}</td>
                  <td className="px-4 py-2.5">{r.placement}</td>
                  <td className="px-4 py-2.5">{r.shiftType}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{r.netHours}</td>
                  <td className="px-4 py-2.5">{r.simulated}</td>
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
