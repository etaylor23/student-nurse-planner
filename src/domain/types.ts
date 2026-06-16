// Domain model for the Core + Placement hours log slice.
// These mirror the canonical Prisma schema; the PoC stores them in IndexedDB.

export type NursingField = "ADULT"; // extend later
export type ProgrammeType = "BSC_3YR" | "MSC_2YR" | "APPRENTICE" | "OTHER";
export type ShiftType = "EARLY" | "LATE" | "NIGHT" | "LONG_DAY" | "OTHER";
/** Human labels for shift types (shared by the form, calendar events and .ics). */
export const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  EARLY: "Early",
  LATE: "Late",
  NIGHT: "Night",
  LONG_DAY: "Long day",
  OTHER: "Other",
};
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
  date: string; // ISO date the shift starts on (what it's counted/grouped against)
  startAt?: string; // local ISO datetime "YYYY-MM-DDTHH:MM" clock-in (optional)
  endAt?: string; // local ISO datetime clock-out; its date may be the next day (nights)
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

/** A shift to create/update — the user-editable fields (server stamps the rest). */
export type ShiftDraft = Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * A generic, entity-agnostic audit-trail entry — a history of what the user did,
 * in the style of Jira's issue history. v1 logs shift lifecycle actions; the same
 * shape extends to other entities later. See spec-activity-log.md.
 */
export interface LogItem {
  id: string;
  userId: string;
  entityType: string; // "SHIFT" today; generic for future entities
  entityId: string; // kept even if the underlying entity is later deleted
  action: string; // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary: string; // human-readable line shown in the history
  createdAt: string; // ISO timestamp
}

/** A log entry to append — the store stamps id + createdAt. */
export type LogInput = Omit<LogItem, "id" | "createdAt">;

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
