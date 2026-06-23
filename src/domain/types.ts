// Domain model — shared by all three screens (planner, hours log, medication notes).
// These mirror the canonical Prisma schema; the PoC stores them in IndexedDB.
//
// One model, reused everywhere. Every persisted entity is a FLAT record of
// primitives so the same shape maps cleanly onto both a SQL row (primary key +
// columns + foreign-key ids) and a NoSQL document, letting `Repository` be rebound
// to either backend without touching features:
//   - a stable string `id` primary key (SQL PK / NoSQL `_id`);
//   - relationships are string foreign keys (`*Id`), never nested objects;
//   - dates/timestamps are ISO-8601 strings; enums are string unions;
//   - no nested documents, arrays-of-entities, or DB-specific column types.
// Compose the shared bases below rather than re-declaring id/userId/timestamps.
// The store↔type↔index mapping lives in `data/schema.ts`.

/** A persisted record with a stable string primary key (SQL PK / NoSQL `_id`). */
export interface Entity {
  id: string;
}
/** A record owned by a user — the multi-user foreign key. */
export interface UserOwned {
  userId: string;
}
/** Store-stamped creation timestamp (ISO-8601 string). */
export interface Created {
  createdAt: string;
}
/** Store-stamped last-update timestamp (ISO-8601 string). */
export interface Updated {
  updatedAt: string;
}

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

export interface User extends Entity, Created, Updated {
  displayName: string;
  field: NursingField;
  programmeType: ProgrammeType;
  currentPart: number; // student's current stage (1..totalParts)
  totalParts: number; // varies by programme (BSc 3yr -> 3)
  startDate?: string; // ISO date
  targetRegistrationDate?: string; // ISO date
}

export interface Placement extends Entity, UserOwned, Created {
  name: string;
  settingType?: string;
  startDate?: string;
  endDate?: string;
}

export interface Shift extends Entity, UserOwned, Created, Updated {
  placementId?: string; // FK → Placement
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
}

/** A shift to create/update — the user-editable fields (server stamps the rest). */
export type ShiftDraft = Omit<Shift, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * A generic, entity-agnostic audit-trail entry — a history of what the user did,
 * in the style of Jira's issue history. v1 logs shift lifecycle actions; the same
 * shape extends to other entities later. See spec-activity-log.md.
 */
export interface LogItem extends Entity, UserOwned, Created {
  entityType: string; // "SHIFT" today; generic for future entities
  entityId: string; // kept even if the underlying entity is later deleted
  entityLabel?: string; // human descriptor at action time, e.g. "Ward 7 · Thu 18 Jun"
  action: string; // e.g. "SHIFT_COMPLETED", "SHIFT_REACTIVATED"
  summary: string; // human-readable line shown in the history
  batchId?: string; // groups entries written in one save event
}

/** A log entry to append — the store stamps id + createdAt. */
export type LogInput = Omit<LogItem, "id" | "createdAt">;

// ---------- NMC Competency tracker ----------

/** Which annexe a proficiency belongs to (NONE = one of the 7 platforms). */
export type Annexe = "NONE" | "A" | "B";

/** PAD-style progress against a proficiency statement. */
export type ProficiencyStatus = "NOT_YET_ACHIEVED" | "DEVELOPING" | "ACHIEVED";
export const PROFICIENCY_STATUS_LABEL: Record<ProficiencyStatus, string> = {
  NOT_YET_ACHIEVED: "Not yet achieved",
  DEVELOPING: "Developing",
  ACHIEVED: "Achieved",
};

/**
 * The kind of record attached to a proficiency as evidence (the polymorphic
 * `EvidenceLink` discriminator). SHIFT and MED_LOG are wired now; REFLECTION and
 * SKILL are defined ahead of those features being built (stub pickers today).
 */
export type EvidenceType = "REFLECTION" | "SKILL" | "SHIFT" | "MED_LOG";
export const EVIDENCE_TYPE_LABEL: Record<EvidenceType, string> = {
  REFLECTION: "Reflection",
  SKILL: "Clinical skill",
  SHIFT: "Placement shift",
  MED_LOG: "Medication log",
};

/**
 * A single national NMC proficiency statement — global reference/seed data
 * (not user-owned), shared by every user. Platform items carry `platform` 1..7
 * with `annexe: "NONE"`; annexe items carry `platform: 0` and `annexe: "A" | "B"`.
 */
export interface Proficiency extends Entity {
  platform: number; // 1..7 for platform items, 0 for annexe items
  platformTitle: string; // platform title, or annexe (+ part) title
  annexe: Annexe;
  code: string; // unique, e.g. "1.1", "A4.1", "B11.7"
  statement: string;
  orderIndex: number;
}

/** A user's current progress against one proficiency (one row per user+proficiency). */
export interface ProficiencyProgress extends Entity, UserOwned, Updated {
  proficiencyId: string; // FK → Proficiency
  status: ProficiencyStatus;
  targetPart?: number; // optional: sharpens gap warnings
}

/** A dated status change — the history that preserves reassessment across parts. */
export interface ProficiencyStatusEvent extends Entity, Created {
  progressId: string; // FK → ProficiencyProgress (owns it; no own userId)
  status: ProficiencyStatus;
  partIndex: number; // the programme part the assessment was made in
  assessorName?: string;
  note?: string;
  occurredAt: string; // ISO date the assessment happened
}

/** Polymorphic evidence join: proficiency ← reflection | skill | shift | med log. */
export interface EvidenceLink extends Entity, UserOwned, Created {
  proficiencyId: string; // FK → Proficiency
  evidenceType: EvidenceType;
  evidenceId: string; // Reflection.id | SkillProgress.id | Shift.id | MedicationLog.id
}

/** An evidence link to create — the store stamps id + createdAt. */
export type EvidenceLinkDraft = Omit<EvidenceLink, "id" | "userId" | "createdAt">;

/** The fields captured when recording a status change (drives the history event). */
export interface ProficiencyStatusChange {
  status: ProficiencyStatus;
  partIndex: number;
  occurredAt: string;
  assessorName?: string;
  note?: string;
}

// ---------- Medication notes (study aid — never patient data) ----------

export type MedLogType = "OBSERVED" | "ADMINISTERED";
export type CalcType =
  | "TABLET_DOSE"
  | "LIQUID_DOSE"
  | "IV_RATE"
  | "WEIGHT_BASED"
  | "INFUSION_DROPS"
  | "UNIT_CONVERSION";

export const MED_LOG_TYPE_LABEL: Record<MedLogType, string> = {
  OBSERVED: "Observed",
  ADMINISTERED: "Administered",
};

export const CALC_TYPE_LABEL: Record<CalcType, string> = {
  TABLET_DOSE: "Tablet dose",
  LIQUID_DOSE: "Liquid dose",
  IV_RATE: "IV rate",
  WEIGHT_BASED: "Weight-based",
  INFUSION_DROPS: "Drops/min",
  UNIT_CONVERSION: "Unit conversion",
};

// Starter option lists for the optional, prompted fields (generic name, drug class,
// body system, routes, side effects, monitoring) live in `src/data/bnf.ts` — a local
// stubbed-BNF value set powering type-ahead suggestions. Every field still accepts
// free text.

/** A medication reference card (generic/BNF name + optional study metadata). */
export interface Medication extends Entity, UserOwned, Created, Updated {
  name: string; // generic / BNF name
  brandNames?: string;
  drugClass?: string;
  bodySystem?: string;
  routes?: string; // comma-separated administration routes
  mechanismOfAction?: string; // free-text — how it works
  sideEffects?: string; // comma-separated common side effects
  monitoring?: string; // comma-separated monitoring parameters
  keyNotes?: string;
  highAlert?: boolean; // study-safety awareness flag (e.g. insulin, anticoagulants, opioids)
}

/** A condition the med is used for — appendable over time (builds the link).
 * Owned via `medicationId` (→ Medication.userId), so it carries no own `userId`. */
export interface MedicationCondition extends Entity {
  medicationId: string; // FK → Medication
  condition: string;
  addedAt: string; // ISO timestamp (kept distinct from createdAt — "appended" semantics)
}

/** A personal log of a med observed/administered. Never patient-identifiable. */
export interface MedicationLog extends Entity, UserOwned, Created {
  medicationId?: string; // FK → Medication (optional — may be an unlinked log)
  shiftId?: string; // FK → Shift it was logged during (auto-linked or chosen)
  type: MedLogType;
  date: string; // ISO date
  route?: string;
  notes?: string; // no patient-identifiable info
}

/** A numeracy practice card — illustrative numbers only, never real drug doses. */
export interface CalcDrill extends Entity, UserOwned, Created {
  medicationId?: string; // FK → Medication (association only; numbers are generic)
  calcType: CalcType;
  prompt: string;
  answer: string;
  lastAttempted?: string;
  lastCorrect?: boolean;
}

/**
 * Running numeracy accuracy per calc type (bounded — one row per user+type, not a
 * row per attempt). Drives the "your numeracy" panel + weakest-type prompt.
 */
export interface CalcStat extends Entity, UserOwned {
  // id is `${userId}:${calcType}`
  calcType: CalcType;
  attempts: number;
  correct: number;
  lastAttempted: string; // ISO
}

export type MedicationDraft = Omit<Medication, "id" | "userId" | "createdAt" | "updatedAt">;
export type MedicationLogDraft = Omit<MedicationLog, "id" | "userId" | "createdAt">;
export type CalcDrillDraft = Omit<CalcDrill, "id" | "userId" | "createdAt">;

/**
 * Configurable break-deduction band. A raw shift duration that falls in
 * [minShiftMins, maxShiftMins] has `breakMins` deducted before counting.
 * `userId === null` denotes the built-in default table.
 */
export interface BreakRule extends Entity {
  userId: string | null; // null = built-in default table (so not `UserOwned`, which is non-null)
  minShiftMins: number;
  maxShiftMins: number;
  breakMins: number;
  orderIndex: number;
}
