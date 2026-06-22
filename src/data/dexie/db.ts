import Dexie, { type Table } from "dexie";
import { STORE_INDEXES, type EntityMap } from "../schema";

/**
 * IndexedDB binding for the PoC. The current schema and the table types both come
 * from the single registry in `../schema.ts` (one source for store↔type↔index), so
 * they can't drift: each table accessor is typed `Table<EntityMap[name]>` and the
 * single `version()` applies `STORE_INDEXES`.
 *
 * Migration policy: this is a local-only PoC, so we **rebuild rather than migrate**.
 * There is one `version()` declaring the whole current schema; no `.upgrade()`
 * transforms. The database name is suffixed (`-v2`) so an older database from the
 * previous (v1–v7) schema is simply abandoned and a fresh one is built and re-seeded
 * — no manual storage clearing needed. Bump the suffix again if a future change must
 * force another clean rebuild.
 */
export class PlannerDb extends Dexie {
  // Table accessors, typed from the registry. Field names match the STORE_INDEXES
  // keys (StoreName); any use of a missing/renamed store is a compile error.
  users!: Table<EntityMap["users"], string>;
  breakRules!: Table<EntityMap["breakRules"], string>;
  placements!: Table<EntityMap["placements"], string>;
  shifts!: Table<EntityMap["shifts"], string>;
  logItems!: Table<EntityMap["logItems"], string>;
  medications!: Table<EntityMap["medications"], string>;
  medicationConditions!: Table<EntityMap["medicationConditions"], string>;
  medicationLogs!: Table<EntityMap["medicationLogs"], string>;
  calcDrills!: Table<EntityMap["calcDrills"], string>;
  calcStats!: Table<EntityMap["calcStats"], string>;
  proficiencies!: Table<EntityMap["proficiencies"], string>;
  proficiencyProgress!: Table<EntityMap["proficiencyProgress"], string>;
  proficiencyStatusEvents!: Table<EntityMap["proficiencyStatusEvents"], string>;
  evidenceLinks!: Table<EntityMap["evidenceLinks"], string>;

  constructor(name = "nurse-planner-v2") {
    super(name);
    this.version(1).stores(STORE_INDEXES);
  }
}
