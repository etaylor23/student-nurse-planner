import type { BreakRule, ShiftDraft } from "../domain/types";
import { computeNetHours } from "./hours";
import { isoDate } from "./calendar";

/**
 * Build a planned shift draft from dropping a placement on the calendar: a timed
 * RAW shift of `durationMins` starting at `start`. The break + counted hours are
 * derived from the band rules so it's consistent with a typed shift. The student
 * tweaks the details afterwards.
 */
export function droppedShiftDraft(
  start: Date,
  durationMins: number,
  placementId: string | undefined,
  rules: BreakRule[],
): ShiftDraft {
  const end = new Date(start.getTime() + durationMins * 60000);
  const { netHours, breakMins } = computeNetHours(
    { entryMode: "RAW", rawDurationMins: durationMins },
    rules,
  );
  return {
    date: isoDate(start),
    placementId: placementId || undefined,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    shiftType: "LONG_DAY",
    entryMode: "RAW",
    rawDurationMins: durationMins,
    breakMins,
    netHours,
    isSimulated: false,
    status: "PLANNED",
    notes: undefined,
  };
}
