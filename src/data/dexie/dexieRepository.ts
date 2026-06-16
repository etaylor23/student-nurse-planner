import type { Repository } from "../repository";
import type { BreakRule, Placement, Shift, User } from "../../domain/types";
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
}
