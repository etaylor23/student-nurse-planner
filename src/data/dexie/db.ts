import Dexie, { type Table } from "dexie";
import type { BreakRule, Placement, Shift, User } from "../../domain/types";

/**
 * IndexedDB schema for the PoC. Indexes are chosen for the queries the
 * hours log actually runs (by user, and shifts by user+date).
 */
export class PlannerDb extends Dexie {
  users!: Table<User, string>;
  breakRules!: Table<BreakRule, string>;
  placements!: Table<Placement, string>;
  shifts!: Table<Shift, string>;

  constructor(name = "nurse-planner") {
    super(name);
    this.version(1).stores({
      users: "id",
      // userId index is nullable; we query defaults with a separate filter.
      breakRules: "id, userId, orderIndex",
      placements: "id, userId, createdAt",
      shifts: "id, userId, [userId+date], status",
    });
  }
}
