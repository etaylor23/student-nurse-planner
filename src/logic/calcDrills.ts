import type { CalcType } from "../domain/types";

/**
 * Numeracy practice drills — a study aid for the common calculation types a
 * student nurse meets (tablet/liquid dose, IV rate, weight-based dose, infusion
 * drops/min, and mg↔microgram unit conversions).
 *
 * SAFETY: numbers are illustrative only, never a named drug's real prescribing
 * doses. `buildCalcDrill` is pure (numbers in → prompt/answer/working out) so it's
 * fully testable; `randomCalcDrill` just supplies sensible illustrative numbers.
 * Every drill carries a `working` string — the step-by-step the student can reveal
 * to check method, not just the final answer.
 */

export interface CalcNumbers {
  stockMg?: number;
  prescribedMg?: number;
  volMl?: number;
  hours?: number;
  mgPerKg?: number;
  weightKg?: number;
  dropFactor?: number; // gtt/ml for drops-per-minute drills
  value?: number; // amount to convert (unit-conversion drills)
  fromUnit?: "mg" | "mcg"; // direction of a unit conversion
}

export interface CalcDrillContent {
  prompt: string;
  answer: string;
  working: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: build a prompt, answer and worked steps for a calc type from numbers. */
export function buildCalcDrill(calcType: CalcType, n: CalcNumbers): CalcDrillContent {
  switch (calcType) {
    case "TABLET_DOSE": {
      const tablets = round2((n.prescribedMg ?? 0) / (n.stockMg ?? 1));
      return {
        prompt: `Stock ${n.stockMg} mg tablets. Prescribed ${n.prescribedMg} mg. How many tablets?`,
        answer: `${tablets} tablet${tablets === 1 ? "" : "s"}`,
        working: `prescribed ÷ stock = ${n.prescribedMg} ÷ ${n.stockMg} = ${tablets}`,
      };
    }
    case "LIQUID_DOSE": {
      const ml = round2(((n.prescribedMg ?? 0) / (n.stockMg ?? 1)) * (n.volMl ?? 0));
      return {
        prompt: `Stock ${n.stockMg} mg in ${n.volMl} ml. Prescribed ${n.prescribedMg} mg. What volume?`,
        answer: `${ml} ml`,
        working: `(prescribed ÷ stock) × volume = (${n.prescribedMg} ÷ ${n.stockMg}) × ${n.volMl} = ${ml} ml`,
      };
    }
    case "IV_RATE": {
      const rate = round2((n.volMl ?? 0) / (n.hours ?? 1));
      return {
        prompt: `Infuse ${n.volMl} ml over ${n.hours} hours. What is the rate?`,
        answer: `${rate} ml/hr`,
        working: `volume ÷ hours = ${n.volMl} ÷ ${n.hours} = ${rate} ml/hr`,
      };
    }
    case "WEIGHT_BASED": {
      const dose = round2((n.mgPerKg ?? 0) * (n.weightKg ?? 0));
      return {
        prompt: `Prescribed ${n.mgPerKg} mg/kg for a ${n.weightKg} kg patient. What is the dose?`,
        answer: `${dose} mg`,
        working: `dose/kg × weight = ${n.mgPerKg} × ${n.weightKg} = ${dose} mg`,
      };
    }
    case "INFUSION_DROPS": {
      // Drops/min is rounded to a whole drop — you can't run a part-drop.
      const exact = ((n.volMl ?? 0) * (n.dropFactor ?? 0)) / ((n.hours ?? 1) * 60);
      const drops = Math.round(exact);
      return {
        prompt: `Infuse ${n.volMl} ml over ${n.hours} hours with a ${n.dropFactor} gtt/ml giving set. What rate in drops per minute?`,
        answer: `${drops} drops/min`,
        working: `(volume × drop factor) ÷ (hours × 60) = (${n.volMl} × ${n.dropFactor}) ÷ (${n.hours} × 60) = ${drops} drops/min`,
      };
    }
    case "UNIT_CONVERSION": {
      const value = n.value ?? 0;
      if (n.fromUnit === "mcg") {
        const mg = round2(value / 1000);
        return {
          prompt: `Convert ${value} micrograms to milligrams.`,
          answer: `${mg} mg`,
          working: `÷ 1000 (mcg → mg): ${value} ÷ 1000 = ${mg} mg`,
        };
      }
      const mcg = round2(value * 1000);
      return {
        prompt: `Convert ${value} mg to micrograms.`,
        answer: `${mcg} micrograms`,
        working: `× 1000 (mg → mcg): ${value} × 1000 = ${mcg} micrograms`,
      };
    }
  }
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Random illustrative numbers, then `buildCalcDrill`. */
export function randomCalcDrill(calcType: CalcType): CalcDrillContent {
  switch (calcType) {
    case "TABLET_DOSE": {
      const stockMg = pick([125, 250, 500]);
      const tablets = pick([2, 3, 4]);
      return buildCalcDrill(calcType, { stockMg, prescribedMg: stockMg * tablets });
    }
    case "LIQUID_DOSE": {
      const stockMg = pick([125, 250, 500]);
      const volMl = pick([5, 10]);
      // Half-step factors give the occasional decimal volume — realistic practice.
      const factor = pick([1.5, 2, 2.5, 3, 4]);
      return buildCalcDrill(calcType, { stockMg, volMl, prescribedMg: stockMg * factor });
    }
    case "IV_RATE": {
      const volMl = pick([500, 1000]);
      const hours = pick(volMl === 1000 ? [4, 5, 8, 10] : [4, 5]);
      return buildCalcDrill(calcType, { volMl, hours });
    }
    case "WEIGHT_BASED": {
      const mgPerKg = pick([1.5, 3, 5, 10]);
      const weightKg = pick([60, 70, 72, 80]);
      return buildCalcDrill(calcType, { mgPerKg, weightKg });
    }
    case "INFUSION_DROPS": {
      const volMl = pick([500, 1000]);
      const hours = pick([2, 4, 6, 8]);
      const dropFactor = pick([15, 20, 60]);
      return buildCalcDrill(calcType, { volMl, hours, dropFactor });
    }
    case "UNIT_CONVERSION": {
      const fromUnit = pick(["mg", "mcg"] as const);
      const value = fromUnit === "mg" ? pick([0.25, 0.5, 1, 2.5]) : pick([250, 500, 1500, 2000]);
      return buildCalcDrill(calcType, { value, fromUnit });
    }
  }
}
