import { describe, expect, it } from "vitest";
import { distinctOptions, filterMedications, medsByPlacement } from "../src/logic/medications";
import type { Medication, MedicationCondition, MedicationLog, Shift } from "../src/domain/types";

function med(p: Partial<Medication>): Medication {
  return {
    id: "m",
    userId: "u",
    name: "Drug",
    createdAt: "",
    updatedAt: "",
    ...p,
  };
}

const meds: Medication[] = [
  med({
    id: "a",
    name: "Amoxicillin",
    brandNames: "Amoxil",
    drugClass: "Antibiotic",
    bodySystem: "Infection",
  }),
  med({ id: "b", name: "Bisoprolol", drugClass: "Antihypertensive", bodySystem: "Cardiovascular" }),
  med({ id: "c", name: "Paracetamol", drugClass: "Analgesic" }),
];
const conds: MedicationCondition[] = [
  { id: "c1", medicationId: "a", condition: "Chest infection", addedAt: "" },
  { id: "c2", medicationId: "b", condition: "Hypertension", addedAt: "" },
];
const byMed = new Map([
  ["a", ["Chest infection"]],
  ["b", ["Hypertension"]],
]);

describe("filterMedications", () => {
  it("matches name or brand (case-insensitive)", () => {
    expect(filterMedications(meds, byMed, { q: "amox" }).map((m) => m.id)).toEqual(["a"]);
    expect(filterMedications(meds, byMed, { q: "AMOXIL" }).map((m) => m.id)).toEqual(["a"]);
  });
  it("filters by class / system / condition", () => {
    expect(filterMedications(meds, byMed, { drugClass: "Analgesic" }).map((m) => m.id)).toEqual([
      "c",
    ]);
    expect(
      filterMedications(meds, byMed, { bodySystem: "Cardiovascular" }).map((m) => m.id),
    ).toEqual(["b"]);
    expect(filterMedications(meds, byMed, { condition: "Hypertension" }).map((m) => m.id)).toEqual([
      "b",
    ]);
  });
  it("combines filters (AND)", () => {
    expect(filterMedications(meds, byMed, { q: "drug", drugClass: "Analgesic" })).toHaveLength(0);
  });
});

describe("medsByPlacement", () => {
  const shift = (id: string, placementId?: string): Shift => ({ id, placementId }) as Shift;
  const log = (id: string, type: "OBSERVED" | "ADMINISTERED", shiftId?: string): MedicationLog =>
    ({ id, type, shiftId }) as MedicationLog;

  const shifts = [shift("s1", "ward-a"), shift("s2", "ward-a"), shift("s3")]; // s3: no placement

  it("tallies observed/administered per placement via the linked shift", () => {
    const m = medsByPlacement(
      [
        log("l1", "OBSERVED", "s1"),
        log("l2", "ADMINISTERED", "s1"),
        log("l3", "ADMINISTERED", "s2"),
      ],
      shifts,
    );
    expect(m.get("ward-a")).toEqual({ observed: 1, administered: 2, total: 3 });
  });

  it("buckets no-placement shifts under null", () => {
    const m = medsByPlacement([log("l1", "OBSERVED", "s3")], shifts);
    expect(m.get(null)).toEqual({ observed: 1, administered: 0, total: 1 });
  });

  it("skips logs with no resolvable shift", () => {
    const m = medsByPlacement([log("l1", "OBSERVED"), log("l2", "OBSERVED", "missing")], shifts);
    expect(m.size).toBe(0);
  });
});

describe("distinctOptions", () => {
  it("returns sorted distinct classes, systems, conditions", () => {
    const o = distinctOptions(meds, conds);
    expect(o.classes).toEqual(["Analgesic", "Antibiotic", "Antihypertensive"]);
    expect(o.systems).toEqual(["Cardiovascular", "Infection"]);
    expect(o.conditions).toEqual(["Chest infection", "Hypertension"]);
  });
});
