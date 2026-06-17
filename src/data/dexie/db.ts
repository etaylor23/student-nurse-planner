import Dexie, { type Table } from "dexie";
import type {
  BreakRule,
  CalcDrill,
  LogItem,
  Medication,
  MedicationCondition,
  MedicationLog,
  Placement,
  Shift,
  User,
} from "../../domain/types";
import { isoAddDays, localIsoToUtc } from "../../logic/calendar";

/**
 * IndexedDB schema for the PoC. Indexes are chosen for the queries the
 * hours log actually runs (by user, and shifts by user+date).
 */
export class PlannerDb extends Dexie {
  users!: Table<User, string>;
  breakRules!: Table<BreakRule, string>;
  placements!: Table<Placement, string>;
  shifts!: Table<Shift, string>;
  logItems!: Table<LogItem, string>;
  medications!: Table<Medication, string>;
  medicationConditions!: Table<MedicationCondition, string>;
  medicationLogs!: Table<MedicationLog, string>;
  calcDrills!: Table<CalcDrill, string>;

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
  }
}
