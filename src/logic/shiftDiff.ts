import { SHIFT_TYPE_LABEL, type Shift } from "../domain/types";
import { formatHumanDate, hhmm } from "./calendar";

/** A single field that changed between two versions of a shift. */
export interface FieldChange {
  label: string;
  from: string;
  to: string;
}

const time = (iso?: string) => (iso ? hhmm(new Date(iso)) : "—");
const yesNo = (b: boolean) => (b ? "Yes" : "No");
const orDash = (s?: string) => (s && s.trim() ? s : "—");

/**
 * Compare the user-facing fields of two shift versions and return the changes,
 * each already formatted for a "{label}: {from} → {to}" audit line. Pure — the
 * placement-name map is passed in (empty is fine when the placement didn't change).
 * Derived/internal fields (rawDurationMins, status) are intentionally excluded:
 * status transitions get their own dedicated log entries.
 */
export function diffShift(
  before: Shift,
  after: Shift,
  placeName: Map<string, string>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  const add = (label: string, from: string, to: string) => {
    if (from !== to) changes.push({ label, from, to });
  };
  const place = (id?: string) => (id ? (placeName.get(id) ?? "Unknown placement") : "No placement");

  add("Date", formatHumanDate(before.date), formatHumanDate(after.date));
  add("Start time", time(before.startAt), time(after.startAt));
  add("End time", time(before.endAt), time(after.endAt));
  add("Placement", place(before.placementId), place(after.placementId));
  add("Shift type", SHIFT_TYPE_LABEL[before.shiftType], SHIFT_TYPE_LABEL[after.shiftType]);
  add("Counted hours", `${before.netHours}h`, `${after.netHours}h`);
  add("Simulated", yesNo(before.isSimulated), yesNo(after.isSimulated));
  add("Nurse", orDash(before.supervisingRnName), orDash(after.supervisingRnName));
  add("Notes", orDash(before.notes), orDash(after.notes));
  return changes;
}
