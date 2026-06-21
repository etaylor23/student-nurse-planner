import { describe, expect, it } from "vitest";
import { buildCalcDrill, randomCalcDrill } from "../src/logic/calcDrills";
import { CALC_TYPE_LABEL, type CalcType } from "../src/domain/types";

describe("buildCalcDrill", () => {
  it("tablet dose = prescribed / stock", () => {
    const d = buildCalcDrill("TABLET_DOSE", { stockMg: 250, prescribedMg: 500 });
    expect(d.answer).toBe("2 tablets");
  });

  it("singular tablet label", () => {
    const d = buildCalcDrill("TABLET_DOSE", { stockMg: 250, prescribedMg: 250 });
    expect(d.answer).toBe("1 tablet");
  });

  it("liquid dose = prescribed / stock * volume", () => {
    const d = buildCalcDrill("LIQUID_DOSE", { stockMg: 250, volMl: 5, prescribedMg: 400 });
    expect(d.answer).toBe("8 ml");
  });

  it("IV rate = volume / hours", () => {
    const d = buildCalcDrill("IV_RATE", { volMl: 1000, hours: 8 });
    expect(d.answer).toBe("125 ml/hr");
  });

  it("weight-based = mg/kg * kg", () => {
    const d = buildCalcDrill("WEIGHT_BASED", { mgPerKg: 5, weightKg: 70 });
    expect(d.answer).toBe("350 mg");
  });

  it("infusion drops/min = (volume × drop factor) / (hours × 60), rounded", () => {
    const d = buildCalcDrill("INFUSION_DROPS", { volMl: 1000, hours: 8, dropFactor: 20 });
    // (1000 * 20) / (8 * 60) = 41.67 → 42
    expect(d.answer).toBe("42 drops/min");
  });

  it("unit conversion mg → micrograms (× 1000)", () => {
    const d = buildCalcDrill("UNIT_CONVERSION", { value: 0.5, fromUnit: "mg" });
    expect(d.answer).toBe("500 micrograms");
  });

  it("unit conversion micrograms → mg (÷ 1000)", () => {
    const d = buildCalcDrill("UNIT_CONVERSION", { value: 1500, fromUnit: "mcg" });
    expect(d.answer).toBe("1.5 mg");
  });

  it("every drill carries worked steps", () => {
    const d = buildCalcDrill("IV_RATE", { volMl: 1000, hours: 8 });
    expect(d.working).toContain("1000 ÷ 8");
  });
});

describe("randomCalcDrill", () => {
  const types = Object.keys(CALC_TYPE_LABEL) as CalcType[];
  it("produces a non-empty prompt, answer + working for every type", () => {
    for (const t of types) {
      const d = randomCalcDrill(t);
      expect(d.prompt.length).toBeGreaterThan(0);
      expect(d.answer.length).toBeGreaterThan(0);
      expect(d.working.length).toBeGreaterThan(0);
    }
  });
});
