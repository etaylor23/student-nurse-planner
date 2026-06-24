import Dexie, { type Table } from "dexie";
import { STORE_INDEXES, type EntityMap, type StoreName } from "../schema";

/**
 * Stores added after the v1 schema shipped. The deployed database (`nurse-planner-v2`)
 * is physically at Dexie version 1 with real tester data, so these are introduced as
 * an **additive** version(2) rather than a name-bump/rebuild: Dexie creates only these
 * object stores on an existing v1 database and leaves every other store's data intact.
 * Still no `.upgrade()` transforms — purely additive. Both versions derive their store
 * specs from the single `STORE_INDEXES` registry, so the DB can't drift from the model.
 */
const V2_ADDED_STORES: StoreName[] = ["skills", "skillProgress"];

/**
 * IndexedDB binding for the PoC. The current schema and the table types both come
 * from the single registry in `../schema.ts` (one source for store↔type↔index), so
 * they can't drift: each table accessor is typed `Table<EntityMap[name]>` and the
 * `version()` chain applies `STORE_INDEXES`.
 *
 * Migration policy: this is a local-only PoC, so we **rebuild rather than migrate**.
 * version(1) declares the original schema; version(2) **additively** introduces the
 * clinical-skills stores (see `V2_ADDED_STORES`) without `.upgrade()` transforms, so
 * deployed databases gain the new stores with zero data loss. The database name is
 * suffixed (`-v2`); bump that suffix only when a change must force a clean rebuild
 * (dropping/reshaping existing data) rather than an additive store.
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
  skills!: Table<EntityMap["skills"], string>;
  skillProgress!: Table<EntityMap["skillProgress"], string>;

  constructor(name = "nurse-planner-v2") {
    super(name);
    // v1 = the registry minus the stores added later; v2 = those additions only
    // (Dexie inherits the rest). Splitting the chain — rather than just listing the
    // new stores at v1 — is what makes Dexie create them on an already-v1 database.
    const isV2 = (k: string) => V2_ADDED_STORES.includes(k as StoreName);
    const v1Stores = Object.fromEntries(Object.entries(STORE_INDEXES).filter(([k]) => !isV2(k)));
    const v2Stores = Object.fromEntries(V2_ADDED_STORES.map((k) => [k, STORE_INDEXES[k]]));
    this.version(1).stores(v1Stores);
    this.version(2).stores(v2Stores);
  }
}
