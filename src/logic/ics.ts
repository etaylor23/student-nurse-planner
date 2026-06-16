import { SHIFT_TYPE_LABEL, type Placement, type Shift } from "../domain/types";
import { isAllDay, shiftEnd, shiftStart } from "./calendar";

/**
 * Build an iCalendar (.ics) document from shifts — a downloadable snapshot the
 * student imports into their phone calendar.
 *
 * NOTE: this is a one-off file. The spec's *live one-way subscription feed*
 * (a stable URL the calendar polls) needs a backend and is deferred.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** Floating-local stamp: "2026-06-10T07:30:00" -> "20260610T073000". */
const toIcsDateTime = (iso: string) => iso.replace(/[-:]/g, "");
/** Date-only stamp: "2026-06-10" -> "20260610". */
const toIcsDate = (iso: string) => iso.replace(/-/g, "");

/** UTC DTSTAMP "YYYYMMDDTHHMMSSZ". */
function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** RFC 5545 text escaping for SUMMARY/DESCRIPTION. */
function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function eventLines(shift: Shift, placementName: string | undefined, stamp: string): string[] {
  const lines: string[] = [
    "BEGIN:VEVENT",
    `UID:${shift.id}@student-nurse-planner`,
    `DTSTAMP:${stamp}`,
  ];

  const start = shiftStart(shift);
  const end = shiftEnd(shift);
  if (isAllDay(shift)) {
    lines.push(`DTSTART;VALUE=DATE:${toIcsDate(start)}`);
    if (end) lines.push(`DTEND;VALUE=DATE:${toIcsDate(end)}`);
  } else {
    lines.push(`DTSTART:${toIcsDateTime(start)}`);
    if (end) lines.push(`DTEND:${toIcsDateTime(end)}`);
  }

  const typeLabel = SHIFT_TYPE_LABEL[shift.shiftType];
  lines.push(
    `SUMMARY:${esc(placementName ? `${placementName} - ${typeLabel}` : `${typeLabel} shift`)}`,
  );

  const desc = [
    `Status: ${shift.status === "COMPLETED" ? "Counted" : "Planned"}`,
    shift.supervisingRnName ? `Nurse: ${shift.supervisingRnName}` : null,
    shift.notes || null,
  ]
    .filter(Boolean)
    .join("; ");
  lines.push(`DESCRIPTION:${esc(desc)}`);

  lines.push("END:VEVENT");
  return lines;
}

export function buildIcs(shifts: Shift[], placements: Placement[], dtstamp?: string): string {
  const nameById = new Map(placements.map((p) => [p.id, p.name]));
  const stamp = dtstamp ?? utcStamp(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Student Nurse Planner//EN",
    "CALSCALE:GREGORIAN",
    ...shifts.flatMap((s) =>
      eventLines(s, s.placementId ? nameById.get(s.placementId) : undefined, stamp),
    ),
    "END:VCALENDAR",
  ];

  return lines.join("\r\n") + "\r\n";
}
