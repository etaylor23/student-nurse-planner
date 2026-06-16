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

/** A shift with no start datetime is treated as an all-day event. */
export function isAllDay(shift: Pick<Shift, "startAt">): boolean {
  return !shift.startAt;
}

/**
 * Whole minutes between a shift's start and end datetimes (0 if either is unset).
 * `startAt`/`endAt` are local datetimes (no zone), so `new Date()` parses them in
 * local time and the difference is the true worked span — including overnight,
 * with no 24h cap.
 */
export function shiftMinutes(shift: Pick<Shift, "startAt" | "endAt">): number {
  if (!shift.startAt || !shift.endAt) return 0;
  return Math.round((new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()) / 60000);
}

/** Build a full UTC ISO timestamp (e.g. "2026-06-16T18:00:00.000Z") from a local
 * date + "HH:MM" clock time. Constructed via local parts, so the instant matches
 * the wall-clock the user entered. */
export function localDateTimeToIso(dateIso: string, time: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

/** Convert a legacy local "YYYY-MM-DDTHH:MM" datetime (no zone) to a full UTC ISO
 * string. Used by the v3→v4 migration. */
export function localIsoToUtc(localIso: string): string {
  const [d, t = "00:00"] = localIso.split("T");
  return localDateTimeToIso(d, t);
}

/**
 * Compose `startAt`/`endAt` as full UTC ISO timestamps from a start date + optional
 * clock times. For entry convenience the end rolls onto the next day when
 * `endTime <= startTime` (a night shift), so the stored end carries the real date.
 * Shared by the shift form (storage) and the planner draft highlight.
 */
export function composeShiftTimes(
  date: string,
  startTime?: string,
  endTime?: string,
): { startAt?: string; endAt?: string } {
  if (!startTime) return {};
  const startAt = localDateTimeToIso(date, startTime);
  if (!endTime) return { startAt };
  const endDate = endTime <= startTime ? isoAddDays(date, 1) : date;
  return { startAt, endAt: localDateTimeToIso(endDate, endTime) };
}

/** "2026-06-18" → "Thu 18 Jun" for display (e.g. timesheet rows, audit summaries). */
export function formatHumanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .replace(",", "");
}

/**
 * Clamp a resized span to at most `maxMins` (default 24h) by moving whichever edge
 * was dragged. Within the limit it's returned unchanged; otherwise the start edge
 * (if it's the one that moved) is pulled to `end − max`, else the end edge is pushed
 * to `start + max`. Pure (epoch millis) so it's unit-testable.
 */
export function clampResizeSpan(
  origStartMs: number,
  newStartMs: number,
  newEndMs: number,
  maxMins = 24 * 60,
): { startMs: number; endMs: number } {
  const maxMs = maxMins * 60000;
  if (newEndMs - newStartMs <= maxMs) return { startMs: newStartMs, endMs: newEndMs };
  if (newStartMs !== origStartMs) return { startMs: newEndMs - maxMs, endMs: newEndMs };
  return { startMs: newStartMs, endMs: newStartMs + maxMs };
}

/** FullCalendar/ICS start: timed → the full ISO `startAt` instant (FullCalendar
 * renders it in local time); all-day → the "YYYY-MM-DD" date. */
export function shiftStart(shift: Pick<Shift, "date" | "startAt">): string {
  return shift.startAt ?? shift.date;
}

/**
 * End boundary:
 * - all-day → exclusive next day "YYYY-MM-DD",
 * - timed with endAt → the full ISO `endAt` instant (carries its own date, so
 *   overnight spans are exact — no inference, no 24h cap),
 * - timed without endAt → undefined (open-ended).
 */
export function shiftEnd(shift: Pick<Shift, "date" | "startAt" | "endAt">): string | undefined {
  if (!shift.startAt) return isoAddDays(shift.date, 1);
  return shift.endAt ?? undefined;
}
