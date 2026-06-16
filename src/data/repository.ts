import type { BreakRule, Placement, Shift, User } from "../domain/types";

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
}
