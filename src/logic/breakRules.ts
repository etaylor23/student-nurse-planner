import type { BreakRule } from "../domain/types";
import { newId } from "../domain/ids";

/**
 * Default break bands (minutes). Tuned so a 12.5h (750 min) shift deducts
 * 60 min -> 11.5h countable, matching NHS-style long-day breaks.
 *   0:00-6:00  -> 0 min
 *   6:01-9:00  -> 30 min
 *   9:00+      -> 60 min
 * Students can override these per-account later; this is the built-in table.
 */
export function defaultBreakRules(): BreakRule[] {
  return [
    { id: newId(), userId: null, minShiftMins: 0, maxShiftMins: 360, breakMins: 0, orderIndex: 0 },
    {
      id: newId(),
      userId: null,
      minShiftMins: 361,
      maxShiftMins: 540,
      breakMins: 30,
      orderIndex: 1,
    },
    {
      id: newId(),
      userId: null,
      minShiftMins: 541,
      maxShiftMins: Number.MAX_SAFE_INTEGER,
      breakMins: 60,
      orderIndex: 2,
    },
  ];
}

/**
 * Resolve the break (minutes) for a raw shift duration from the band table.
 * Bands are checked in `orderIndex` order; the first whose range contains the
 * duration wins. Returns 0 if no band matches.
 */
export function resolveBreakMins(rawDurationMins: number, rules: BreakRule[]): number {
  const ordered = [...rules].sort((a, b) => a.orderIndex - b.orderIndex);
  for (const rule of ordered) {
    if (rawDurationMins >= rule.minShiftMins && rawDurationMins <= rule.maxShiftMins) {
      return rule.breakMins;
    }
  }
  return 0;
}
