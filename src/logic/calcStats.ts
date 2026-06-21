import type { CalcType } from "../domain/types";

/**
 * Summarise numeracy accuracy for the practice screen. Pure (counts in →
 * per-type accuracy + overall + weakest type out) so it's unit-testable.
 */

export interface CalcTypeAccuracy {
  calcType: CalcType;
  attempts: number;
  correct: number;
  accuracy: number; // 0..1; 0 when never attempted
}

export interface CalcStatsSummary {
  perType: CalcTypeAccuracy[];
  total: { attempts: number; correct: number; accuracy: number };
  /** Lowest-accuracy type with enough attempts to be meaningful, else null. */
  weakest: CalcType | null;
}

/** Minimum attempts before a type can be flagged as the weakest. */
export const WEAKEST_MIN_ATTEMPTS = 3;

type Counts = { calcType: CalcType; attempts: number; correct: number };

const accuracyOf = (correct: number, attempts: number) => (attempts > 0 ? correct / attempts : 0);

export function summariseCalcStats(stats: Counts[]): CalcStatsSummary {
  const perType: CalcTypeAccuracy[] = stats.map((s) => ({
    calcType: s.calcType,
    attempts: s.attempts,
    correct: s.correct,
    accuracy: accuracyOf(s.correct, s.attempts),
  }));

  const attempts = perType.reduce((sum, s) => sum + s.attempts, 0);
  const correct = perType.reduce((sum, s) => sum + s.correct, 0);

  let weakest: CalcType | null = null;
  let weakestAcc = Infinity;
  for (const s of perType) {
    if (s.attempts < WEAKEST_MIN_ATTEMPTS) continue;
    if (s.accuracy < weakestAcc) {
      weakestAcc = s.accuracy;
      weakest = s.calcType;
    }
  }

  return {
    perType,
    total: { attempts, correct, accuracy: accuracyOf(correct, attempts) },
    weakest,
  };
}
