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

/** A shift's sortable start instant: its clock-in, else local midnight of its date. */
function startMs(s: Shift): number {
  return s.startAt ? new Date(s.startAt).getTime() : new Date(s.date).getTime();
}

/**
 * The soonest upcoming PLANNED shift — the "next shift" for the Home dashboard.
 * A shift counts as upcoming when its start instant is at/after `nowMs` (timed) or its
 * date is today or later (all-day). Earliest first. Pure — pass the current epoch ms.
 */
export function nextShift(shifts: Shift[], nowMs: number): Shift | undefined {
  return shifts
    .filter((s) => s.status === "PLANNED" && startMs(s) >= nowMs)
    .sort((a, b) => startMs(a) - startMs(b))[0];
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
