import type { Repository } from "../repository";
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
} from "../../domain/types";
import { newId, nowIso } from "../../domain/ids";
import { defaultBreakRules } from "../../logic/breakRules";
import { PlannerDb } from "./db";

/** Stable id for the PoC's single local user. */
export const LOCAL_USER_ID = "local-user";

function defaultUser(): User {
  const ts = nowIso();
  return {
    id: LOCAL_USER_ID,
    displayName: "Me",
    field: "ADULT",
    programmeType: "BSC_3YR",
    currentPart: 1,
    totalParts: 3,
    createdAt: ts,
    updatedAt: ts,
  };
}

export class DexieRepository implements Repository {
  private db: PlannerDb;
  private seeded = false;

  constructor(db: PlannerDb = new PlannerDb()) {
    this.db = db;
  }

  /** Idempotent: create the local user and default break rules if missing. */
  async ensureSeed(): Promise<void> {
    if (this.seeded) return;
    const existing = await this.db.users.get(LOCAL_USER_ID);
    if (!existing) await this.db.users.put(defaultUser());
    const ruleCount = await this.db.breakRules.count();
    if (ruleCount === 0) await this.db.breakRules.bulkPut(defaultBreakRules());
    this.seeded = true;
  }

  async getCurrentUser(): Promise<User> {
    await this.ensureSeed();
    // Non-null after seeding.
    return (await this.db.users.get(LOCAL_USER_ID))!;
  }

  async updateUser(patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const current = await this.getCurrentUser();
    const updated: User = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.users.put(updated);
    return updated;
  }

  async getBreakRules(userId: string): Promise<BreakRule[]> {
    await this.ensureSeed();
    const own = await this.db.breakRules.where("userId").equals(userId).toArray();
    if (own.length > 0) return own.sort((a, b) => a.orderIndex - b.orderIndex);
    const defaults = await this.db.breakRules.filter((r) => r.userId === null).toArray();
    return defaults.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async saveBreakRules(
    userId: string,
    rules: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">>,
  ): Promise<BreakRule[]> {
    await this.ensureSeed();
    await this.clearUserBreakRules(userId);
    const created: BreakRule[] = rules.map((r, i) => ({
      id: newId(),
      userId,
      minShiftMins: r.minShiftMins,
      maxShiftMins: r.maxShiftMins,
      breakMins: r.breakMins,
      orderIndex: i,
    }));
    await this.db.breakRules.bulkPut(created);
    return created;
  }

  async resetBreakRules(userId: string): Promise<void> {
    await this.clearUserBreakRules(userId);
  }

  /** Delete the user's own break rules (leaves the global defaults untouched). */
  private async clearUserBreakRules(userId: string): Promise<void> {
    const own = await this.db.breakRules.where("userId").equals(userId).toArray();
    if (own.length > 0) await this.db.breakRules.bulkDelete(own.map((r) => r.id));
  }

  async listPlacements(userId: string): Promise<Placement[]> {
    return this.db.placements.where("userId").equals(userId).reverse().sortBy("createdAt");
  }

  async createPlacement(input: Omit<Placement, "id" | "createdAt">): Promise<Placement> {
    const placement: Placement = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.placements.put(placement);
    return placement;
  }

  async updatePlacement(
    id: string,
    patch: Partial<Omit<Placement, "id" | "userId">>,
  ): Promise<Placement> {
    const current = await this.db.placements.get(id);
    if (!current) throw new Error(`Placement ${id} not found`);
    const updated: Placement = { ...current, ...patch };
    await this.db.placements.put(updated);
    return updated;
  }

  async deletePlacement(id: string): Promise<void> {
    await this.db.placements.delete(id);
  }

  async listShifts(userId: string): Promise<Shift[]> {
    const rows = await this.db.shifts.where("userId").equals(userId).toArray();
    // Newest shift date first.
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async getShift(id: string): Promise<Shift | undefined> {
    return this.db.shifts.get(id);
  }

  async createShift(input: Omit<Shift, "id" | "createdAt" | "updatedAt">): Promise<Shift> {
    const ts = nowIso();
    const shift: Shift = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await this.db.shifts.put(shift);
    return shift;
  }

  async updateShift(
    id: string,
    patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>,
  ): Promise<Shift> {
    const current = await this.db.shifts.get(id);
    if (!current) throw new Error(`Shift ${id} not found`);
    const updated: Shift = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.shifts.put(updated);
    return updated;
  }

  async deleteShift(id: string): Promise<void> {
    await this.db.shifts.delete(id);
  }

  async createLogItem(input: LogInput): Promise<LogItem> {
    const item: LogItem = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.logItems.put(item);
    return item;
  }

  async listLogItems(
    userId: string,
    filter?: { entityType?: string; entityId?: string },
  ): Promise<LogItem[]> {
    let rows = await this.db.logItems.where("userId").equals(userId).toArray();
    if (filter?.entityType) rows = rows.filter((r) => r.entityType === filter.entityType);
    if (filter?.entityId) rows = rows.filter((r) => r.entityId === filter.entityId);
    // Newest first.
    return rows.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  // ---- Medications ----
  async listMedications(userId: string): Promise<Medication[]> {
    const rows = await this.db.medications.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getMedication(id: string): Promise<Medication | undefined> {
    return this.db.medications.get(id);
  }

  async createMedication(input: MedicationDraft & { userId: string }): Promise<Medication> {
    const ts = nowIso();
    const med: Medication = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await this.db.medications.put(med);
    return med;
  }

  async updateMedication(id: string, patch: Partial<MedicationDraft>): Promise<Medication> {
    const current = await this.db.medications.get(id);
    if (!current) throw new Error(`Medication ${id} not found`);
    const updated: Medication = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.medications.put(updated);
    return updated;
  }

  async deleteMedication(id: string): Promise<void> {
    await this.db.medications.delete(id);
    const conds = await this.db.medicationConditions.where("medicationId").equals(id).toArray();
    if (conds.length > 0) await this.db.medicationConditions.bulkDelete(conds.map((c) => c.id));
  }

  // ---- Medication conditions ----
  async listMedicationConditions(medicationId: string): Promise<MedicationCondition[]> {
    const rows = await this.db.medicationConditions
      .where("medicationId")
      .equals(medicationId)
      .toArray();
    return rows.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0));
  }

  async listConditionsForUser(userId: string): Promise<MedicationCondition[]> {
    const medIds = new Set(
      (await this.db.medications.where("userId").equals(userId).primaryKeys()) as string[],
    );
    const all = await this.db.medicationConditions.toArray();
    return all.filter((c) => medIds.has(c.medicationId));
  }

  async addMedicationCondition(
    medicationId: string,
    condition: string,
  ): Promise<MedicationCondition> {
    const row: MedicationCondition = {
      id: newId(),
      medicationId,
      condition: condition.trim(),
      addedAt: nowIso(),
    };
    await this.db.medicationConditions.put(row);
    return row;
  }

  async removeMedicationCondition(id: string): Promise<void> {
    await this.db.medicationConditions.delete(id);
  }

  // ---- Medication log ----
  async listMedicationLogs(userId: string): Promise<MedicationLog[]> {
    const rows = await this.db.medicationLogs.where("userId").equals(userId).toArray();
    // Newest date first, then newest created.
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async listMedicationLogsForShift(shiftId: string): Promise<MedicationLog[]> {
    const rows = await this.db.medicationLogs.where("shiftId").equals(shiftId).toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createMedicationLog(
    input: MedicationLogDraft & { userId: string },
  ): Promise<MedicationLog> {
    const log: MedicationLog = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.medicationLogs.put(log);
    return log;
  }

  async deleteMedicationLog(id: string): Promise<void> {
    await this.db.medicationLogs.delete(id);
  }

  // ---- Calc drills ----
  async listCalcDrills(userId: string, filter?: { medicationId?: string }): Promise<CalcDrill[]> {
    let rows = await this.db.calcDrills.where("userId").equals(userId).toArray();
    if (filter?.medicationId) rows = rows.filter((r) => r.medicationId === filter.medicationId);
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createCalcDrill(input: CalcDrillDraft & { userId: string }): Promise<CalcDrill> {
    const drill: CalcDrill = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.calcDrills.put(drill);
    return drill;
  }

  async updateCalcDrill(id: string, patch: Partial<CalcDrillDraft>): Promise<CalcDrill> {
    const current = await this.db.calcDrills.get(id);
    if (!current) throw new Error(`CalcDrill ${id} not found`);
    const updated: CalcDrill = { ...current, ...patch };
    await this.db.calcDrills.put(updated);
    return updated;
  }

  async deleteCalcDrill(id: string): Promise<void> {
    await this.db.calcDrills.delete(id);
  }
}
