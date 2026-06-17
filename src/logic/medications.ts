import type { Medication, MedicationCondition } from "../domain/types";

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
