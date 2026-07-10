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
  /** Sign-in email (from the Cognito token). Absent for the guest/local user. */
  email?: string;
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

// ---------- Clinical skills tracker ----------

/** Where a skill came from: the seeded Annexe B baseline, or one the student added. */
export type SkillSource = "ANNEXE_B" | "CUSTOM";
export const SKILL_SOURCE_LABEL: Record<SkillSource, string> = {
  ANNEXE_B: "Annexe B",
  CUSTOM: "Custom",
};

/** Supervised competence stages, in order. No "independent" stage (students-only). */
export type SkillStage = "OBSERVED" | "ASSISTED" | "PERFORMED_UNDER_SUPERVISION";
export const SKILL_STAGE_LABEL: Record<SkillStage, string> = {
  OBSERVED: "Observed",
  ASSISTED: "Assisted",
  PERFORMED_UNDER_SUPERVISION: "Performed under supervision",
};
/** The stages in progression order (drives the stepper + the "highest stage" logic). */
export const SKILL_STAGES: SkillStage[] = ["OBSERVED", "ASSISTED", "PERFORMED_UNDER_SUPERVISION"];

/**
 * A clinical skill to develop. `userId === null` denotes a built-in baseline skill
 * (the seeded Annexe B procedures, shared by every user — so not `UserOwned`, like
 * `BreakRule`); a set `userId` is a student's own custom skill. Baseline skills map
 * 1:1 to an Annexe B proficiency by code (id `skill_B2.1` ↔ proficiency `prof_B2.1`).
 */
export interface Skill extends Entity {
  userId: string | null; // null = built-in Annexe B baseline (so not `UserOwned`, which is non-null)
  name: string;
  category: string;
  source: SkillSource;
  orderIndex: number;
}

/**
 * A user's progress against one skill (one row per user+skill). `signedOff` is
 * permanent once true — students-only tool, no refresh/expiry path.
 */
export interface SkillProgress extends Entity, UserOwned, Updated {
  skillId: string; // FK → Skill
  stage: SkillStage;
  signedOff: boolean; // permanent once true (no un-sign-off path)
  signOffByName?: string; // who signed it off
  signOffLocation?: string; // where
  signOffDate?: string; // ISO date
  evidenceNote?: string; // what evidence supported it
  shiftId?: string; // FK → Shift the sign-off happened in (the universal capture join; optional, unindexed)
}

/** A skill to create — the store stamps the id. */
export type SkillDraft = Omit<Skill, "id">;
/** The sign-off fields captured on the detail screen. */
export type SkillSignOff = Pick<
  SkillProgress,
  "signOffByName" | "signOffLocation" | "signOffDate" | "evidenceNote" | "shiftId"
>;

// ---------- Reflection on practice (Gibbs reflective cycle) ----------

/** Reflective model. v1 is Gibbs-only; the enum leaves room for Driscoll/Borton/Kolb. */
export type ReflectionModel = "GIBBS";

/** The six stages of the Gibbs reflective cycle, in progression order. */
export type GibbsStage =
  | "DESCRIPTION"
  | "FEELINGS"
  | "EVALUATION"
  | "ANALYSIS"
  | "CONCLUSION"
  | "ACTION_PLAN";
/** The stages in order (drives the editor's section list + completeness). */
export const GIBBS_STAGES: GibbsStage[] = [
  "DESCRIPTION",
  "FEELINGS",
  "EVALUATION",
  "ANALYSIS",
  "CONCLUSION",
  "ACTION_PLAN",
];
export const GIBBS_STAGE_LABEL: Record<GibbsStage, string> = {
  DESCRIPTION: "Description",
  FEELINGS: "Feelings",
  EVALUATION: "Evaluation",
  ANALYSIS: "Analysis",
  CONCLUSION: "Conclusion",
  ACTION_PLAN: "Action plan",
};

/**
 * A structured reflective account (Gibbs). Private, lockable, and never patient-
 * identifiable. `shiftId` is the universal capture join — a shift (or a med log) can
 * seed a reflection. Written content lives in one `ReflectionSection` per stage;
 * links to proficiencies use the polymorphic `EvidenceLink` (type `REFLECTION`).
 */
export interface Reflection extends Entity, UserOwned, Created, Updated {
  title: string;
  model: ReflectionModel;
  occurredOn?: string; // ISO date the reflected-on event happened
  shiftId?: string; // FK → Shift it reflects on (the universal capture join; optional, unindexed)
  isLocked: boolean; // device-level privacy gate in the PoC (see logic/reflectionLock)
  piiAcknowledged: boolean; // the standing "no patient-identifiable information" acknowledgement
}

/** One Gibbs stage's written content (one row per reflection+stage; owned via reflectionId). */
export interface ReflectionSection extends Entity {
  reflectionId: string; // FK → Reflection (owns it; carries no own userId)
  stage: GibbsStage;
  content: string;
}

/** A free-text label a student attaches to reflections, so they can be pulled later
 * (revalidation, essays, interviews). Unique per user+label. */
export interface Tag extends Entity, UserOwned {
  label: string;
}

/** m:n join between a reflection and a tag. `id` is composite `${reflectionId}:${tagId}`. */
export interface ReflectionTag extends Entity {
  // id = `${reflectionId}:${tagId}`
  reflectionId: string; // FK → Reflection
  tagId: string; // FK → Tag
}

/** A reflection's editable fields (the store stamps id + timestamps). Sections and
 * tags are saved alongside via dedicated repository arguments. */
export type ReflectionDraft = Omit<Reflection, "id" | "userId" | "createdAt" | "updatedAt">;
/** One stage's content, as passed to create/update (the store assigns section ids). */
export interface ReflectionSectionInput {
  stage: GibbsStage;
  content: string;
}

// ---------- Revision timetable ----------

export type RevisionTargetType = "EXAM" | "ASSIGNMENT" | "OSCE";
export const REVISION_TARGET_TYPE_LABEL: Record<RevisionTargetType, string> = {
  EXAM: "Exam",
  ASSIGNMENT: "Assignment",
  OSCE: "OSCE",
};

export type RevisionMethod = "SPACED_REPETITION" | "FIXED_BLOCK" | "POMODORO";
export const REVISION_METHOD_LABEL: Record<RevisionMethod, string> = {
  SPACED_REPETITION: "Spaced repetition",
  FIXED_BLOCK: "Weekly block",
  POMODORO: "Pomodoro",
};

/** Confidence scale for a revision topic (drives spaced-repetition + weak-area resurfacing). */
export const REVISION_CONFIDENCE_MIN = 1;
export const REVISION_CONFIDENCE_MAX = 5;

/**
 * A revision subject. `userId === null` denotes a built-in baseline subject (seeded,
 * shared by every user — like `BreakRule` / baseline `Skill`); a set `userId` is a
 * student's own subject.
 */
export interface Subject extends Entity {
  userId: string | null; // null = built-in baseline (so not `UserOwned`, which is non-null)
  name: string;
}

/** An exam / assignment / OSCE the student revises toward (any combination, all optional). */
export interface RevisionTarget extends Entity, UserOwned, Created {
  type: RevisionTargetType;
  title: string;
  date: string; // ISO date
  subjectId?: string; // FK → Subject (optional)
}

/** A topic within a subject, carrying confidence + a spaced-repetition schedule. */
export interface RevisionTopic extends Entity, UserOwned, Created {
  subjectId: string; // FK → Subject
  title: string;
  confidence: number; // 1..5 — drives resurfacing + next-due
  lastReviewed?: string; // ISO date
  nextDue?: string; // ISO date (derived from confidence on review)
}

/** A planned or completed study session, scheduled around shifts. */
export interface RevisionSession extends Entity, UserOwned, Created {
  topicId?: string; // FK → RevisionTopic (optional — a session can be general)
  method: RevisionMethod;
  scheduledStart: string; // full ISO timestamp
  scheduledEnd: string; // full ISO timestamp
  completed: boolean;
  pomodoroCount?: number; // completed pomodoros (POMODORO method)
  confidenceAfter?: number; // 1..5, captured when a session completes
}

export type SubjectDraft = Omit<Subject, "id">;
export type RevisionTargetDraft = Omit<RevisionTarget, "id" | "userId" | "createdAt">;
export type RevisionTopicDraft = Omit<RevisionTopic, "id" | "userId" | "createdAt">;
export type RevisionSessionDraft = Omit<RevisionSession, "id" | "userId" | "createdAt">;

// ---------- Self-care checklist (supportive; never a streak / guilt mechanic) ----------

/**
 * A gentle, optional wellbeing check-in — private and on-device, never scored and with
 * no streaks. `shiftId` is the universal capture join, so a check-in can follow a hard
 * shift. Ticked self-care items are a comma-separated list of keys (like
 * `Medication.routes`) — the catalogue of items/dimensions lives in `logic/selfCare.ts`.
 */
export interface SelfCareCheckin extends Entity, UserOwned, Created {
  date: string; // ISO date
  shiftId?: string; // FK → Shift (optional; a check-in prompted after a hard shift)
  energy?: number; // 1..5 optional private energy/mood rating (low → support signposting)
  note?: string; // optional private free text (kept on-device)
  items: string; // comma-separated self-care item keys the student looked after
}
export type SelfCareCheckinDraft = Omit<SelfCareCheckin, "id" | "userId" | "createdAt">;

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
