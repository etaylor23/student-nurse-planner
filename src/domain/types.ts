// Domain model for the Core + Placement hours log slice.
// These mirror the canonical Prisma schema; the PoC stores them in IndexedDB.

export type NursingField = "ADULT"; // extend later
export type ProgrammeType = "BSC_3YR" | "MSC_2YR" | "APPRENTICE" | "OTHER";
export type ShiftType = "EARLY" | "LATE" | "NIGHT" | "LONG_DAY" | "OTHER";
export type HoursEntryMode = "NET" | "RAW";
export type ShiftStatus = "PLANNED" | "COMPLETED";

/** NMC pre-registration practice-hours target. */
export const PRACTICE_HOURS_TARGET = 2300;
/** Max of the target that may be met through simulated practice learning. */
export const SIMULATED_HOURS_CAP = 600;

export interface User {
  id: string;
  displayName: string;
  field: NursingField;
  programmeType: ProgrammeType;
  currentPart: number; // student's current stage (1..totalParts)
  totalParts: number; // varies by programme (BSc 3yr -> 3)
  startDate?: string; // ISO date
  targetRegistrationDate?: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

export interface Placement {
  id: string;
  userId: string;
  name: string;
  settingType?: string;
  startDate?: string;
  endDate?: string;
  createdAt: string;
}

export interface Shift {
  id: string;
  userId: string;
  placementId?: string;
  date: string; // ISO date of the shift
  startTime?: string; // "HH:MM" clock-in (optional); may roll past midnight
  endTime?: string; // "HH:MM" clock-out (optional)
  shiftType: ShiftType;
  entryMode: HoursEntryMode;
  rawDurationMins?: number; // present when entryMode === "RAW"
  breakMins?: number; // resolved from break rules, override allowed
  netHours: number; // stored countable hours (always derived on write)
  isSimulated: boolean; // counts toward SIMULATED_HOURS_CAP (subset of target)
  status: ShiftStatus;
  supervisingRnName?: string; // required to move PLANNED -> COMPLETED
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Configurable break-deduction band. A raw shift duration that falls in
 * [minShiftMins, maxShiftMins] has `breakMins` deducted before counting.
 * `userId === null` denotes the built-in default table.
 */
export interface BreakRule {
  id: string;
  userId: string | null;
  minShiftMins: number;
  maxShiftMins: number;
  breakMins: number;
  orderIndex: number;
}
