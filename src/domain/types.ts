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
  date: string; // local ISO date the shift starts on (what it's counted/grouped against)
  startAt?: string; // full UTC ISO timestamp clock-in (optional), e.g. "2026-06-16T18:00:00.000Z"
  endAt?: string; // full UTC ISO timestamp clock-out; may fall on the next day (nights)
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
  entityLabel?: string; // human descriptor at action time, e.g. "Ward 7 · Thu 18 Jun"
  action: string; // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary: string; // human-readable line shown in the history
  batchId?: string; // groups entries written in one save event
  createdAt: string; // ISO timestamp
}

/** A log entry to append — the store stamps id + createdAt. */
export type LogInput = Omit<LogItem, "id" | "createdAt">;

// ---------- Medication notes (study aid — never patient data) ----------

export type MedLogType = "OBSERVED" | "ADMINISTERED";
export type CalcType = "TABLET_DOSE" | "LIQUID_DOSE" | "IV_RATE" | "WEIGHT_BASED";

export const MED_LOG_TYPE_LABEL: Record<MedLogType, string> = {
  OBSERVED: "Observed",
  ADMINISTERED: "Administered",
};

export const CALC_TYPE_LABEL: Record<CalcType, string> = {
  TABLET_DOSE: "Tablet dose",
  LIQUID_DOSE: "Liquid dose",
  IV_RATE: "IV rate",
  WEIGHT_BASED: "Weight-based",
};

/** Starter option lists for the optional, prompted selects (each allows "Other"). */
export const DRUG_CLASSES = [
  "Antibiotic",
  "Analgesic",
  "Anticoagulant",
  "Antihypertensive",
  "Antiemetic",
  "Bronchodilator",
  "Corticosteroid",
  "Diuretic",
  "Proton-pump inhibitor",
  "Antidiabetic",
  "Anticonvulsant",
  "Antidepressant",
] as const;

export const BODY_SYSTEMS = [
  "Cardiovascular",
  "Respiratory",
  "Gastrointestinal",
  "Central nervous system",
  "Renal / urinary",
  "Endocrine",
  "Musculoskeletal",
  "Infection",
  "Skin",
] as const;

export const ADMIN_ROUTES = [
  "Oral",
  "IV",
  "IM",
  "Subcutaneous",
  "Topical",
  "Inhaled",
  "Rectal",
  "Sublingual",
] as const;

/** A medication reference card (generic/BNF name + optional study metadata). */
export interface Medication {
  id: string;
  userId: string;
  name: string; // generic / BNF name
  brandNames?: string;
  drugClass?: string;
  bodySystem?: string;
  routes?: string; // comma-separated administration routes
  keyNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/** A condition the med is used for — appendable over time (builds the link). */
export interface MedicationCondition {
  id: string;
  medicationId: string;
  condition: string;
  addedAt: string;
}

/** A personal log of a med observed/administered. Never patient-identifiable. */
export interface MedicationLog {
  id: string;
  userId: string;
  medicationId?: string;
  type: MedLogType;
  date: string; // ISO date
  route?: string;
  notes?: string; // no patient-identifiable info
  createdAt: string;
}

/** A numeracy practice card — illustrative numbers only, never real drug doses. */
export interface CalcDrill {
  id: string;
  userId: string;
  medicationId?: string; // association only; numbers are generic
  calcType: CalcType;
  prompt: string;
  answer: string;
  lastAttempted?: string;
  lastCorrect?: boolean;
  createdAt: string;
}

export type MedicationDraft = Omit<Medication, "id" | "userId" | "createdAt" | "updatedAt">;
export type MedicationLogDraft = Omit<MedicationLog, "id" | "userId" | "createdAt">;
export type CalcDrillDraft = Omit<CalcDrill, "id" | "userId" | "createdAt">;

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
