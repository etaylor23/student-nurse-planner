import type { Shift } from "../domain/types";
import { isoAddDays } from "./calendar";

/**
 * Shift-aware scheduling — the spec's "revision never clashes with placement". Pure so
 * it's unit-tested: given the student's shifts and a search window, suggest study slots
 * that don't overlap any shift. `Date` parses the local wall clock, matching how shift
 * start/end instants are compared elsewhere.
 */

export interface StudySlot {
  startMs: number;
  endMs: number;
}

/** Busy [startMs, endMs] intervals from timed shifts (all-day shifts have no window). */
export function shiftBusyIntervals(shifts: Shift[]): Array<[number, number]> {
  return shifts
    .filter((s) => s.startAt && s.endAt)
    .map((s) => [new Date(s.startAt!).getTime(), new Date(s.endAt!).getTime()] as [number, number]);
}

/** Does the half-open slot [startMs, endMs) overlap any busy interval? Pure. */
export function overlapsBusy(
  startMs: number,
  endMs: number,
  busy: Array<[number, number]>,
): boolean {
  return busy.some(([bs, be]) => startMs < be && bs < endMs);
}

export interface SlotOptions {
  fromIso: string; // local date to start searching (YYYY-MM-DD)
  days: number; // how many days forward to search
  durationMins: number; // slot length
  dayStartHour: number; // earliest study start hour (local), e.g. 8
  dayEndHour: number; // latest study END hour (local), e.g. 22
  maxSlots: number; // cap on suggestions
  stepMins?: number; // search granularity within a day (default 30)
}

/**
 * Suggest study slots that never clash with a shift. For each day in the window it
 * offers the earliest `durationMins` slot within local study hours that doesn't overlap
 * a shift; days with no free window are skipped. One slot per day, soonest first.
 */
export function suggestStudySlots(shifts: Shift[], opts: SlotOptions): StudySlot[] {
  const busy = shiftBusyIntervals(shifts);
  const step = (opts.stepMins ?? 30) * 60000;
  const durMs = opts.durationMins * 60000;
  const slots: StudySlot[] = [];

  for (let d = 0; d < opts.days && slots.length < opts.maxSlots; d++) {
    const dayIso = isoAddDays(opts.fromIso, d);
    const dayStart = new Date(`${dayIso}T00:00:00`);
    dayStart.setHours(opts.dayStartHour, 0, 0, 0);
    const dayEnd = new Date(`${dayIso}T00:00:00`);
    dayEnd.setHours(opts.dayEndHour, 0, 0, 0);
    const lastStart = dayEnd.getTime() - durMs;

    for (let startMs = dayStart.getTime(); startMs <= lastStart; startMs += step) {
      const endMs = startMs + durMs;
      if (!overlapsBusy(startMs, endMs, busy)) {
        slots.push({ startMs, endMs });
        break; // one slot per day
      }
    }
  }
  return slots;
}
