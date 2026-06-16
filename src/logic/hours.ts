import {
  PRACTICE_HOURS_TARGET,
  SIMULATED_HOURS_CAP,
  type BreakRule,
  type HoursEntryMode,
  type Placement,
  type Shift,
} from "../domain/types";
import { resolveBreakMins } from "./breakRules";

export interface NetHoursInput {
  entryMode: HoursEntryMode;
  /** For NET entry: the countable hours entered directly. */
  netHoursEntered?: number;
  /** For RAW entry: gross shift duration in minutes. */
  rawDurationMins?: number;
  /** For RAW entry: explicit break override; if undefined, resolved from rules. */
  breakMinsOverride?: number;
}

export interface NetHoursResult {
  netHours: number;
  /** Break minutes actually applied (0 for NET entry). */
  breakMins: number;
}

/** Round to 2dp to avoid float noise (e.g. 11.499999). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Compute countable hours for a shift.
 * - NET: use the entered hours as-is.
 * - RAW: deduct the break (override or resolved from the band table) then /60.
 * Never returns a negative value.
 */
export function computeNetHours(input: NetHoursInput, rules: BreakRule[]): NetHoursResult {
  if (input.entryMode === "NET") {
    return { netHours: round2(Math.max(0, input.netHoursEntered ?? 0)), breakMins: 0 };
  }
  const raw = input.rawDurationMins ?? 0;
  const breakMins =
    input.breakMinsOverride !== undefined ? input.breakMinsOverride : resolveBreakMins(raw, rules);
  const net = Math.max(0, (raw - breakMins) / 60);
  return { netHours: round2(net), breakMins };
}

export interface HoursSummary {
  /** Counted hours from COMPLETED shifts (simulated included — it's a subset). */
  practiceHours: number;
  /** Of practiceHours, the portion that is simulated practice learning. */
  simulatedHours: number;
  /** Hours still needed to reach the 2300 target (>= 0). */
  remainingHours: number;
  /** Headroom left under the 600 simulated cap (can be negative if exceeded). */
  simulatedRemaining: number;
  /** True once simulated learning has met or passed the 600 cap. */
  simulatedCapReached: boolean;
  /** Planned (not yet completed) hours — informational, not counted. */
  plannedHours: number;
  /** practiceHours / 2300, clamped 0..1, as a fraction. */
  progressFraction: number;
  targetHours: number;
  simulatedCap: number;
}

/**
 * Summarise hours across a set of shifts. Only COMPLETED shifts count toward
 * the target; simulated hours are a subset of the target, tracked against the
 * 600 cap. (NMC: up to 600 of the 2300 practice hours may be simulated.)
 */
export function summariseHours(shifts: Shift[]): HoursSummary {
  let practiceHours = 0;
  let simulatedHours = 0;
  let plannedHours = 0;

  for (const s of shifts) {
    if (s.status === "COMPLETED") {
      practiceHours += s.netHours;
      if (s.isSimulated) simulatedHours += s.netHours;
    } else {
      plannedHours += s.netHours;
    }
  }

  practiceHours = round2(practiceHours);
  simulatedHours = round2(simulatedHours);
  plannedHours = round2(plannedHours);

  return {
    practiceHours,
    simulatedHours,
    remainingHours: round2(Math.max(0, PRACTICE_HOURS_TARGET - practiceHours)),
    simulatedRemaining: round2(SIMULATED_HOURS_CAP - simulatedHours),
    simulatedCapReached: simulatedHours >= SIMULATED_HOURS_CAP,
    plannedHours,
    progressFraction: Math.min(1, Math.max(0, practiceHours / PRACTICE_HOURS_TARGET)),
    targetHours: PRACTICE_HOURS_TARGET,
    simulatedCap: SIMULATED_HOURS_CAP,
  };
}

export interface PlacementHours {
  placementId: string | null; // null = shifts with no placement set
  name: string;
  counted: number; // hours from COMPLETED shifts
  planned: number; // hours from PLANNED shifts
  shiftCount: number;
}

/**
 * Hours grouped by placement (counted vs planned), resolving names. Shifts with
 * no placement are bucketed under "No placement". Sorted by counted hours desc.
 */
export function hoursByPlacement(shifts: Shift[], placements: Placement[]): PlacementHours[] {
  const nameById = new Map(placements.map((p) => [p.id, p.name]));
  const byKey = new Map<string, PlacementHours>();

  for (const s of shifts) {
    const key = s.placementId ?? "__none__";
    let row = byKey.get(key);
    if (!row) {
      row = {
        placementId: s.placementId ?? null,
        name: s.placementId ? (nameById.get(s.placementId) ?? "Unknown placement") : "No placement",
        counted: 0,
        planned: 0,
        shiftCount: 0,
      };
      byKey.set(key, row);
    }
    row.shiftCount += 1;
    if (s.status === "COMPLETED") row.counted = round2(row.counted + s.netHours);
    else row.planned = round2(row.planned + s.netHours);
  }

  return [...byKey.values()].sort((a, b) => b.counted - a.counted);
}
