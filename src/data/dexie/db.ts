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
 * Stores added at version(3) — the Reflection-on-practice feature. Introduced the
 * same additive way as `V2_ADDED_STORES`: Dexie creates only these object stores on
 * an existing v1/v2 database and leaves all other data intact. Each shipped feature
 * gets its OWN incrementing version (rather than piling onto an existing one) because
 * the app deploys per-feature — a browser already upgraded to a reflection-only v3
 * would never gain stores bolted onto the same version later. No `.upgrade()`.
 */
const V3_ADDED_STORES: StoreName[] = [
  "reflections",
  "reflectionSections",
  "tags",
  "reflectionTags",
];

/** Stores added at version(4) — the Revision-timetable feature. Same additive
 * pattern as V2/V3 (its own version because the app deploys per-feature). */
const V4_ADDED_STORES: StoreName[] = [
  "subjects",
  "revisionTargets",
  "revisionTopics",
  "revisionSessions",
];

/**
 * IndexedDB binding for the PoC. The current schema and the table types both come
 * from the single registry in `../schema.ts` (one source for store↔type↔index), so
 * they can't drift: each table accessor is typed `Table<EntityMap[name]>` and the
 * `version()` chain applies `STORE_INDEXES`.
 *
 * Migration policy: this is a local-only PoC, so we **rebuild rather than migrate**.
 * version(1) declares the original schema; version(2) **additively** introduces the
 * clinical-skills stores (see `V2_ADDED_STORES`); version(3) the reflection stores
 * (`V3_ADDED_STORES`); version(4) the revision stores (`V4_ADDED_STORES`) — all without
 * `.upgrade()` transforms, so deployed databases gain the new stores with zero data
 * loss. The database name is suffixed (`-v2`); bump that suffix only when a change must
 * force a clean rebuild (dropping/reshaping existing data) rather than an additive store.
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
  reflections!: Table<EntityMap["reflections"], string>;
  reflectionSections!: Table<EntityMap["reflectionSections"], string>;
  tags!: Table<EntityMap["tags"], string>;
  reflectionTags!: Table<EntityMap["reflectionTags"], string>;
  subjects!: Table<EntityMap["subjects"], string>;
  revisionTargets!: Table<EntityMap["revisionTargets"], string>;
  revisionTopics!: Table<EntityMap["revisionTopics"], string>;
  revisionSessions!: Table<EntityMap["revisionSessions"], string>;

  constructor(name = "nurse-planner-v2") {
    super(name);
    // v1 = the registry minus the stores added later; each later version = only that
    // release's additions (Dexie inherits the rest). Splitting the chain — rather than
    // listing everything at v1 — is what makes Dexie create the new stores on an
    // already-migrated database without a transform.
    const addedLater = new Set<string>([
      ...V2_ADDED_STORES,
      ...V3_ADDED_STORES,
      ...V4_ADDED_STORES,
    ]);
    const v1Stores = Object.fromEntries(
      Object.entries(STORE_INDEXES).filter(([k]) => !addedLater.has(k)),
    );
    const later = (stores: StoreName[]) =>
      Object.fromEntries(stores.map((k) => [k, STORE_INDEXES[k]]));
    this.version(1).stores(v1Stores);
    this.version(2).stores(later(V2_ADDED_STORES));
    this.version(3).stores(later(V3_ADDED_STORES));
    this.version(4).stores(later(V4_ADDED_STORES));
  }
}
