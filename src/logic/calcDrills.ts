import type { CalcType } from "../domain/types";

/**
 * Numeracy practice drills — a study aid for the four common calculation types.
 *
 * SAFETY: numbers are illustrative only, never a named drug's real prescribing
 * doses. `buildCalcDrill` is pure (numbers in → prompt/answer out) so it's fully
 * testable; `randomCalcDrill` just supplies cleanly-dividing numbers.
 */

export interface CalcNumbers {
  stockMg?: number;
  prescribedMg?: number;
  volMl?: number;
  hours?: number;
  mgPerKg?: number;
  weightKg?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pure: build a prompt + answer for a calc type from explicit numbers. */
export function buildCalcDrill(
  calcType: CalcType,
  n: CalcNumbers,
): { prompt: string; answer: string } {
  switch (calcType) {
    case "TABLET_DOSE": {
      const tablets = round2((n.prescribedMg ?? 0) / (n.stockMg ?? 1));
      return {
        prompt: `Stock ${n.stockMg} mg tablets. Prescribed ${n.prescribedMg} mg. How many tablets?`,
        answer: `${tablets} tablet${tablets === 1 ? "" : "s"}`,
      };
    }
    case "LIQUID_DOSE": {
      const ml = round2(((n.prescribedMg ?? 0) / (n.stockMg ?? 1)) * (n.volMl ?? 0));
      return {
        prompt: `Stock ${n.stockMg} mg in ${n.volMl} ml. Prescribed ${n.prescribedMg} mg. What volume?`,
        answer: `${ml} ml`,
      };
    }
    case "IV_RATE": {
      const rate = round2((n.volMl ?? 0) / (n.hours ?? 1));
      return {
        prompt: `Infuse ${n.volMl} ml over ${n.hours} hours. What is the rate?`,
        answer: `${rate} ml/hr`,
      };
    }
    case "WEIGHT_BASED": {
      const dose = round2((n.mgPerKg ?? 0) * (n.weightKg ?? 0));
      return {
        prompt: `Prescribed ${n.mgPerKg} mg/kg for a ${n.weightKg} kg patient. What is the dose?`,
        answer: `${dose} mg`,
      };
    }
  }
}

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Random illustrative numbers (chosen to divide cleanly), then `buildCalcDrill`. */
export function randomCalcDrill(calcType: CalcType): { prompt: string; answer: string } {
  switch (calcType) {
    case "TABLET_DOSE": {
      const stockMg = pick([125, 250, 500]);
      const tablets = pick([2, 3, 4]);
      return buildCalcDrill(calcType, { stockMg, prescribedMg: stockMg * tablets });
    }
    case "LIQUID_DOSE": {
      const stockMg = pick([125, 250, 500]);
      const volMl = pick([5, 10]);
      const factor = pick([2, 3, 4]);
      return buildCalcDrill(calcType, { stockMg, volMl, prescribedMg: stockMg * factor });
    }
    case "IV_RATE": {
      const volMl = pick([500, 1000]);
      const hours = pick(volMl === 1000 ? [4, 5, 8, 10] : [4, 5]);
      return buildCalcDrill(calcType, { volMl, hours });
    }
    case "WEIGHT_BASED": {
      return buildCalcDrill(calcType, { mgPerKg: pick([3, 5, 10]), weightKg: pick([60, 70, 80]) });
    }
  }
}
