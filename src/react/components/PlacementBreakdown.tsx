import type { Placement, Shift } from "../../domain/types";
import { hoursByPlacement } from "../../logic/hours";
import type { PlacementMedCount } from "../../logic/medications";
import { buildTimesheet, timesheetToCsv } from "../../logic/timesheet";
import { downloadCsv } from "../download";
import { Panel } from "./ui";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "placement"
  );
}

export function PlacementBreakdown({
  shifts,
  placements,
  medCounts,
  className,
}: {
  shifts: Shift[];
  placements: Placement[];
  medCounts?: Map<string | null, PlacementMedCount>;
  className?: string;
}) {
  const rows = hoursByPlacement(shifts, placements);

  const exportPlacement = (placementId: string, name: string) => {
    const own = shifts.filter((s) => s.placementId === placementId);
    downloadCsv(`timesheet-${slugify(name)}.csv`, timesheetToCsv(buildTimesheet(own, placements)));
  };

  return (
    <Panel
      title="Hours by placement"
      hint="Counted hours at each ward or team"
      className={className}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">Log shifts to see where your hours are going.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li
              key={r.placementId ?? "none"}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-700">{r.name}</div>
                <div className="text-xs text-slate-400">
                  {r.shiftCount} shift{r.shiftCount === 1 ? "" : "s"}
                  {r.planned > 0 && ` · ${r.planned} h planned`}
                  {(() => {
                    const m = medCounts?.get(r.placementId);
                    return m && m.total > 0
                      ? ` · ${m.total} med${m.total === 1 ? "" : "s"} logged`
                      : "";
                  })()}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold tabular-nums text-slate-900">
                  {r.counted} h
                </span>
                {r.placementId && (
                  <button
                    type="button"
                    onClick={() => exportPlacement(r.placementId!, r.name)}
                    aria-label={`Export ${r.name} timesheet`}
                    title="Export this placement's timesheet"
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
                      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
                    </svg>
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
