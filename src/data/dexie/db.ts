import Dexie, { type Table } from "dexie";
import { isoAddDays, localIsoToUtc } from "../../logic/calendar";
import { STORE_INDEXES, type EntityMap } from "../schema";

/**
 * IndexedDB binding for the PoC. The current schema and the table types both come
 * from the single registry in `../schema.ts` (one source for store↔type↔index), so
 * they can't drift: each table accessor is typed `Table<EntityMap[name]>` and the
 * latest version applies `STORE_INDEXES`. The `version()` chain below is historical
 * — each step migrates an older database forward to the current schema.
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

  constructor(name = "nurse-planner") {
    super(name);
    this.version(1).stores({
      users: "id",
      // userId index is nullable; we query defaults with a separate filter.
      breakRules: "id, userId, orderIndex",
      placements: "id, userId, createdAt",
      shifts: "id, userId, [userId+date], status",
    });
    // v2 adds the generic activity log; existing v1 databases upgrade in place.
    this.version(2).stores({
      logItems: "id, userId, [entityType+entityId], createdAt",
    });
    // v3 moves shifts to absolute start/end datetimes (startAt/endAt), so the
    // worked span is end − start instead of an overnight inference that capped
    // shifts at 24h. Indexes are unchanged; existing rows migrate in place.
    this.version(3)
      .stores({ shifts: "id, userId, [userId+date], status" })
      .upgrade(async (tx) => {
        await tx
          .table("shifts")
          .toCollection()
          .modify((shift) => {
            const s = shift as {
              date: string;
              startTime?: string;
              endTime?: string;
              startAt?: string;
              endAt?: string;
            };
            if (s.startTime) {
              s.startAt = `${s.date}T${s.startTime}`;
              if (s.endTime) {
                const endDate = s.endTime <= s.startTime ? isoAddDays(s.date, 1) : s.date;
                s.endAt = `${endDate}T${s.endTime}`;
              }
            }
            delete s.startTime;
            delete s.endTime;
          });
      });
    // v4 normalises startAt/endAt to full UTC ISO timestamps (toISOString form),
    // converting the v3 local "YYYY-MM-DDTHH:MM" datetimes in place.
    this.version(4)
      .stores({ shifts: "id, userId, [userId+date], status" })
      .upgrade(async (tx) => {
        await tx
          .table("shifts")
          .toCollection()
          .modify((shift) => {
            const s = shift as { startAt?: string; endAt?: string };
            if (s.startAt) s.startAt = localIsoToUtc(s.startAt);
            if (s.endAt) s.endAt = localIsoToUtc(s.endAt);
          });
      });
    // v5 adds the Medication Notes stores (study aid). Additive — existing
    // databases upgrade in place with no data migration.
    this.version(5).stores({
      medications: "id, userId, createdAt",
      medicationConditions: "id, medicationId, [medicationId+condition]",
      medicationLogs: "id, userId, medicationId, date",
      calcDrills: "id, userId, medicationId, calcType",
    });
    // v6 links a med log to the shift it happened in (additive index, no migration).
    this.version(6).stores({
      medicationLogs: "id, userId, medicationId, shiftId, date",
    });
    // v7 adds a bounded numeracy-accuracy aggregate (one row per user+calc type).
    // It also restates the complete current schema from the registry, which is the
    // single source of truth from here on — new stores/indexes land in schema.ts
    // plus a new version() bump.
    this.version(7).stores(STORE_INDEXES);
  }
}
