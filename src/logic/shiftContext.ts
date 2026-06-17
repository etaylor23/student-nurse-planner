import type { Shift } from "../domain/types";
import { isoAddDays } from "./calendar";

/**
 * The shift you're "currently in": a timed shift whose start–end window contains
 * `nowMs`. Used to auto-link an action (e.g. a med log) to the shift it happens in.
 * Pure — pass the current epoch ms. All-day shifts (no times) have no window and
 * are never "current".
 */
export function findCurrentShift(shifts: Shift[], nowMs: number): Shift | undefined {
  return shifts.find(
    (s) =>
      !!s.startAt &&
      !!s.endAt &&
      new Date(s.startAt).getTime() <= nowMs &&
      nowMs <= new Date(s.endAt).getTime(),
  );
}

/**
 * Shifts whose date falls within the last `days` (default 7) up to and including
 * `todayIso` — the override list offered when logging an action. Newest first.
 */
export function recentShifts(shifts: Shift[], todayIso: string, days = 7): Shift[] {
  const from = isoAddDays(todayIso, -days);
  return shifts
    .filter((s) => s.date >= from && s.date <= todayIso)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (a.startAt ?? "") < (b.startAt ?? "") ? 1 : -1;
    });
}
