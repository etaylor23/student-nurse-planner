import type { Shift } from "../domain/types";

/**
 * TZ-safe date helpers for the calendar + .ics export.
 *
 * IMPORTANT: format from LOCAL date parts, never `toISOString()` (which is UTC
 * and shifts the day for anyone west of GMT). Parsing uses the local-midnight
 * pattern `new Date(`${iso}T00:00:00`)`.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date → local "YYYY-MM-DD". */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A Date → local "HH:MM". */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Add `n` days to a "YYYY-MM-DD" string, returning a "YYYY-MM-DD" string. */
export function isoAddDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** A shift with no start time is treated as an all-day event. */
export function isAllDay(shift: Pick<Shift, "startTime">): boolean {
  return !shift.startTime;
}

/** "2026-06-18" → "Thu 18 Jun" for display (e.g. timesheet rows, audit summaries). */
export function formatHumanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

/** FullCalendar/ICS start: timed → "YYYY-MM-DDTHH:MM:00"; all-day → "YYYY-MM-DD". */
export function shiftStart(shift: Pick<Shift, "date" | "startTime">): string {
  return shift.startTime ? `${shift.date}T${shift.startTime}:00` : shift.date;
}

/**
 * End boundary:
 * - all-day → exclusive next day "YYYY-MM-DD",
 * - timed with endTime → "YYYY-MM-DDTHH:MM:00", rolling to the next day when the
 *   end is at/before the start (overnight shift),
 * - timed without endTime → undefined (open-ended).
 */
export function shiftEnd(shift: Pick<Shift, "date" | "startTime" | "endTime">): string | undefined {
  if (!shift.startTime) return isoAddDays(shift.date, 1);
  if (!shift.endTime) return undefined;
  const endDate = shift.endTime <= shift.startTime ? isoAddDays(shift.date, 1) : shift.date;
  return `${endDate}T${shift.endTime}:00`;
}
