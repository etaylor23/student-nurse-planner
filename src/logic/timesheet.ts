import type { Placement, Shift } from "../domain/types";

export interface TimesheetRow {
  /** Shift id, for row-level actions (not exported to CSV). */
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  placement: string;
  setting: string;
  shiftType: string;
  rawHours: string; // gross hours, blank for NET entry
  breakMins: string;
  netHours: number;
  simulated: string; // "Yes" / "No"
  supervisingRn: string;
  status: string;
}

function minsToHours(mins?: number): string {
  if (mins === undefined) return "";
  return (mins / 60).toFixed(2);
}

/** Build printable timesheet rows, newest-first, with placement names resolved. */
export function buildTimesheet(shifts: Shift[], placements: Placement[]): TimesheetRow[] {
  const byId = new Map(placements.map((p) => [p.id, p]));
  return [...shifts]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((s) => {
      const p = s.placementId ? byId.get(s.placementId) : undefined;
      return {
        id: s.id,
        date: s.date,
        startTime: s.startTime ?? "",
        endTime: s.endTime ?? "",
        placement: p?.name ?? "—",
        setting: p?.settingType ?? "",
        shiftType: s.shiftType,
        rawHours: minsToHours(s.rawDurationMins),
        breakMins: s.breakMins !== undefined ? String(s.breakMins) : "",
        netHours: s.netHours,
        simulated: s.isSimulated ? "Yes" : "No",
        supervisingRn: s.supervisingRnName ?? "",
        status: s.status,
      };
    });
}

const HEADERS: Array<[keyof TimesheetRow, string]> = [
  ["date", "Date"],
  ["startTime", "Start"],
  ["endTime", "End"],
  ["placement", "Placement"],
  ["setting", "Setting"],
  ["shiftType", "Shift type"],
  ["rawHours", "Gross hours"],
  ["breakMins", "Break (min)"],
  ["netHours", "Counted hours"],
  ["simulated", "Simulated"],
  ["supervisingRn", "Registered nurse"],
  ["status", "Status"],
];

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
  return value;
}

/** Render timesheet rows as a CSV string (header + data). */
export function timesheetToCsv(rows: TimesheetRow[]): string {
  const head = HEADERS.map(([, label]) => escapeCsv(label)).join(",");
  const body = rows.map((r) => HEADERS.map(([key]) => escapeCsv(String(r[key]))).join(","));
  return [head, ...body].join("\n");
}
