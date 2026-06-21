import type { Medication, MedicationCondition, MedicationLog, Shift } from "../domain/types";

export interface MedicationFilter {
  q?: string;
  drugClass?: string;
  bodySystem?: string;
  condition?: string;
}

/**
 * Filter medications by free-text (name/brand) and the optional selects. Pure —
 * `conditionsByMed` maps a medication id to its appended condition strings.
 */
export function filterMedications(
  meds: Medication[],
  conditionsByMed: Map<string, string[]>,
  filter: MedicationFilter,
): Medication[] {
  const q = filter.q?.trim().toLowerCase();
  return meds.filter((m) => {
    if (filter.drugClass && m.drugClass !== filter.drugClass) return false;
    if (filter.bodySystem && m.bodySystem !== filter.bodySystem) return false;
    if (filter.condition && !(conditionsByMed.get(m.id) ?? []).includes(filter.condition))
      return false;
    if (q) {
      const hay = `${m.name} ${m.brandNames ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export interface PlacementMedCount {
  observed: number;
  administered: number;
  total: number;
}

/**
 * Tally med logs per placement, resolved through each log's linked shift — so each
 * ward gets a profile of how many meds were observed/administered there. Keyed by
 * placementId (`null` = the shift had no placement). Pure. Logs with no resolvable
 * shift are skipped (no placement context to attribute them to).
 */
export function medsByPlacement(
  logs: MedicationLog[],
  shifts: Shift[],
): Map<string | null, PlacementMedCount> {
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const out = new Map<string | null, PlacementMedCount>();
  for (const log of logs) {
    if (!log.shiftId) continue;
    const shift = shiftById.get(log.shiftId);
    if (!shift) continue;
    const key = shift.placementId ?? null;
    const cur = out.get(key) ?? { observed: 0, administered: 0, total: 0 };
    if (log.type === "ADMINISTERED") cur.administered += 1;
    else cur.observed += 1;
    cur.total += 1;
    out.set(key, cur);
  }
  return out;
}

/** Distinct filter options present in the data (sorted), for the filter selects. */
export function distinctOptions(meds: Medication[], conditions: MedicationCondition[]) {
  const uniqSorted = (xs: (string | undefined)[]) =>
    [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
  return {
    classes: uniqSorted(meds.map((m) => m.drugClass)),
    systems: uniqSorted(meds.map((m) => m.bodySystem)),
    conditions: uniqSorted(conditions.map((c) => c.condition)),
  };
}
