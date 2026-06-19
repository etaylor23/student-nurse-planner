import { describe, expect, it } from "vitest";
import { buildMedFilterPath, isFiltered, parseMedFilters } from "../src/logic/medicationFilters";

describe("medicationFilters path", () => {
  it("empty splat → empty filters; empty filters → /medications", () => {
    expect(parseMedFilters(undefined)).toEqual({
      q: "",
      drugClass: "",
      bodySystem: "",
      condition: "",
    });
    expect(buildMedFilterPath({ q: "", drugClass: "", bodySystem: "", condition: "" })).toBe(
      "/medications",
    );
  });

  it("round-trips a single filter", () => {
    const f = { q: "", drugClass: "Antibiotic", bodySystem: "", condition: "" };
    const path = buildMedFilterPath(f);
    expect(path).toBe("/medications/filter/class/Antibiotic");
    expect(parseMedFilters("class/Antibiotic")).toEqual(f);
  });

  it("round-trips multiple filters in a stable order", () => {
    const f = { q: "amox", drugClass: "Antibiotic", bodySystem: "Infection", condition: "Sepsis" };
    const path = buildMedFilterPath(f);
    expect(path).toBe(
      "/medications/filter/q/amox/class/Antibiotic/system/Infection/condition/Sepsis",
    );
    expect(parseMedFilters(path.replace("/medications/filter/", ""))).toEqual(f);
  });

  it("URL-encodes values with spaces/slashes", () => {
    const f = { q: "co-amoxiclav 500/125", drugClass: "", bodySystem: "", condition: "" };
    const path = buildMedFilterPath(f);
    expect(path).not.toContain(" ");
    expect(path).toContain("q/");
    // and decodes back exactly
    expect(parseMedFilters(path.replace("/medications/filter/", "")).q).toBe(
      "co-amoxiclav 500/125",
    );
  });

  it("isFiltered reflects any set value", () => {
    expect(isFiltered({ q: "", drugClass: "", bodySystem: "", condition: "" })).toBe(false);
    expect(isFiltered({ q: "", drugClass: "Analgesic", bodySystem: "", condition: "" })).toBe(true);
  });
});
