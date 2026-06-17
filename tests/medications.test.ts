import { describe, expect, it } from "vitest";
import { distinctOptions, filterMedications } from "../src/logic/medications";
import type { Medication, MedicationCondition } from "../src/domain/types";

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

describe("distinctOptions", () => {
  it("returns sorted distinct classes, systems, conditions", () => {
    const o = distinctOptions(meds, conds);
    expect(o.classes).toEqual(["Analgesic", "Antibiotic", "Antihypertensive"]);
    expect(o.systems).toEqual(["Cardiovascular", "Infection"]);
    expect(o.conditions).toEqual(["Chest infection", "Hypertension"]);
  });
});
