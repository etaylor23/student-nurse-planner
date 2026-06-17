import type {
  BreakRule,
  CalcDrill,
  CalcDrillDraft,
  LogInput,
  LogItem,
  Medication,
  MedicationCondition,
  MedicationDraft,
  MedicationLog,
  MedicationLogDraft,
  Placement,
  Shift,
  User,
} from "../domain/types";

/**
 * Storage-agnostic contract for the Core + hours-log slice.
 *
 * The PoC binds this to IndexedDB (DexieRepository). A later phase can bind the
 * same interface to a REST/Prisma backend with no change to features or UI.
 * Every method is async so the remote implementation is a drop-in.
 */
export interface Repository {
  // ---- User (PoC: a single local default user) ----
  getCurrentUser(): Promise<User>;
  updateUser(patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User>;

  // ---- Break rules ----
  /** Returns the user's rules if present, otherwise the built-in defaults. */
  getBreakRules(userId: string): Promise<BreakRule[]>;
  /**
   * Replace the user's custom break-rule band table. The bands are stored in
   * the given order (orderIndex assigned by position). Pass the full table.
   */
  saveBreakRules(
    userId: string,
    rules: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">>,
  ): Promise<BreakRule[]>;
  /** Remove the user's custom band table so the built-in defaults apply again. */
  resetBreakRules(userId: string): Promise<void>;

  // ---- Placements ----
  listPlacements(userId: string): Promise<Placement[]>;
  createPlacement(input: Omit<Placement, "id" | "createdAt">): Promise<Placement>;
  updatePlacement(id: string, patch: Partial<Omit<Placement, "id" | "userId">>): Promise<Placement>;
  deletePlacement(id: string): Promise<void>;

  // ---- Shifts ----
  listShifts(userId: string): Promise<Shift[]>;
  getShift(id: string): Promise<Shift | undefined>;
  createShift(input: Omit<Shift, "id" | "createdAt" | "updatedAt">): Promise<Shift>;
  updateShift(
    id: string,
    patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>,
  ): Promise<Shift>;
  deleteShift(id: string): Promise<void>;

  // ---- Activity log (generic audit trail) ----
  /** Append an audit entry. Log items are never updated or deleted by the app. */
  createLogItem(input: LogInput): Promise<LogItem>;
  /** A user's audit entries, newest first; optionally scoped to one entity. */
  listLogItems(
    userId: string,
    filter?: { entityType?: string; entityId?: string },
  ): Promise<LogItem[]>;

  // ---- Medications (study aid) ----
  listMedications(userId: string): Promise<Medication[]>;
  getMedication(id: string): Promise<Medication | undefined>;
  createMedication(input: MedicationDraft & { userId: string }): Promise<Medication>;
  updateMedication(id: string, patch: Partial<MedicationDraft>): Promise<Medication>;
  deleteMedication(id: string): Promise<void>;

  // ---- Medication conditions (appendable) ----
  listMedicationConditions(medicationId: string): Promise<MedicationCondition[]>;
  /** Every condition across the user's medications (for the list filters). */
  listConditionsForUser(userId: string): Promise<MedicationCondition[]>;
  addMedicationCondition(medicationId: string, condition: string): Promise<MedicationCondition>;
  removeMedicationCondition(id: string): Promise<void>;

  // ---- Medication log (observed/administered; no patient data) ----
  listMedicationLogs(userId: string): Promise<MedicationLog[]>;
  /** Med logs linked to a given shift (shown in the shift's editor). */
  listMedicationLogsForShift(shiftId: string): Promise<MedicationLog[]>;
  createMedicationLog(input: MedicationLogDraft & { userId: string }): Promise<MedicationLog>;
  deleteMedicationLog(id: string): Promise<void>;

  // ---- Numeracy calc drills (illustrative numbers only) ----
  listCalcDrills(userId: string, filter?: { medicationId?: string }): Promise<CalcDrill[]>;
  createCalcDrill(input: CalcDrillDraft & { userId: string }): Promise<CalcDrill>;
  updateCalcDrill(id: string, patch: Partial<CalcDrillDraft>): Promise<CalcDrill>;
  deleteCalcDrill(id: string): Promise<void>;
}
