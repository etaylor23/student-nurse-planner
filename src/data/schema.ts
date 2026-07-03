import type {
  BreakRule,
  CalcDrill,
  CalcStat,
  EvidenceLink,
  LogItem,
  Medication,
  MedicationCondition,
  MedicationLog,
  Placement,
  Proficiency,
  ProficiencyProgress,
  ProficiencyStatusEvent,
  Reflection,
  ReflectionSection,
  ReflectionTag,
  Shift,
  Skill,
  SkillProgress,
  Tag,
  User,
} from "../domain/types";

/**
 * The single registry that links every persisted entity to its store, so the DB
 * and the TS model can't drift. One place maps a store name to:
 *   - its TS type (`EntityMap`), and
 *   - its index spec (`STORE_INDEXES`).
 * Both are keyed by `EntityMap`, so TypeScript forces every store to have exactly
 * one type and one index spec — add or rename a store and the compiler points at
 * every place that must change. `db.ts` derives both its typed table accessors and
 * its current schema from here.
 *
 * Indexes are query hints only — Dexie secondary indexes, the equivalent of SQL
 * indexes or a Mongo index. They are NOT part of the stored data shape, so a
 * different backend (SQL or NoSQL) can pick its own without touching the model.
 */
export interface EntityMap {
  users: User;
  breakRules: BreakRule;
  placements: Placement;
  shifts: Shift;
  logItems: LogItem;
  medications: Medication;
  medicationConditions: MedicationCondition;
  medicationLogs: MedicationLog;
  calcDrills: CalcDrill;
  calcStats: CalcStat;
  proficiencies: Proficiency;
  proficiencyProgress: ProficiencyProgress;
  proficiencyStatusEvents: ProficiencyStatusEvent;
  evidenceLinks: EvidenceLink;
  skills: Skill;
  skillProgress: SkillProgress;
  reflections: Reflection;
  reflectionSections: ReflectionSection;
  tags: Tag;
  reflectionTags: ReflectionTag;
}

/** The set of persisted store names (single source of truth). */
export type StoreName = keyof EntityMap;

/**
 * Dexie index spec per store — primary key first, then secondary indexes. This is
 * the **current** schema; `db.ts` applies it at the latest version. The historical
 * `version()` chain in `db.ts` exists only to migrate older databases up to this.
 *
 * Every entity uses a string `id` primary key and string foreign keys, so the same
 * shape indexes naturally on SQL (PK + indexed columns) and NoSQL (`_id` + indexes).
 */
export const STORE_INDEXES: Record<StoreName, string> = {
  users: "id",
  breakRules: "id, userId, orderIndex",
  placements: "id, userId, createdAt",
  shifts: "id, userId, [userId+date], status",
  logItems: "id, userId, [entityType+entityId], createdAt",
  medications: "id, userId, createdAt",
  medicationConditions: "id, medicationId, [medicationId+condition]",
  medicationLogs: "id, userId, medicationId, shiftId, date",
  calcDrills: "id, userId, medicationId, calcType",
  calcStats: "id, userId, calcType",
  // Reference/seed data (global, not user-owned). `&code` = unique index.
  proficiencies: "id, platform, annexe, &code, orderIndex",
  proficiencyProgress: "id, userId, proficiencyId, [userId+proficiencyId], status",
  proficiencyStatusEvents: "id, progressId, occurredAt",
  evidenceLinks: "id, userId, proficiencyId, [evidenceType+evidenceId]",
  // Clinical skills. `userId` null = built-in Annexe B baseline (queried by filter,
  // since IndexedDB doesn't index null keys). `signedOff` is intentionally NOT
  // indexed — a boolean isn't a valid IndexedDB key; it's filtered in memory.
  skills: "id, userId, source, category, orderIndex",
  skillProgress: "id, userId, skillId, [userId+skillId]",
  // Reflection on practice. `shiftId` (the universal capture join) is intentionally
  // NOT indexed — filtered in memory, like `skillProgress.shiftId`. A reflection's
  // links to proficiencies live in `evidenceLinks` (type REFLECTION), not here.
  reflections: "id, userId, createdAt",
  reflectionSections: "id, reflectionId, &[reflectionId+stage]",
  tags: "id, userId, &[userId+label]",
  reflectionTags: "id, reflectionId, tagId",
};
