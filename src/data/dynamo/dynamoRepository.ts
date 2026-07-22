import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Repository } from "../repository";
import type { SyncRow } from "../sync/protocol";
import { newId, nowIso } from "../../domain/ids";
import {
  breakRuleSchema,
  calcDrillSchema,
  calcStatSchema,
  evidenceLinkSchema,
  logItemSchema,
  medicationConditionSchema,
  medicationLogSchema,
  medicationSchema,
  placementSchema,
  proficiencyProgressSchema,
  proficiencyStatusEventSchema,
  reflectionSchema,
  reflectionSectionSchema,
  reflectionTagSchema,
  revisionSessionSchema,
  revisionTargetSchema,
  revisionTopicSchema,
  selfCareCheckinSchema,
  shiftSchema,
  skillProgressSchema,
  skillSchema,
  subjectSchema,
  tagSchema,
  userSchema,
} from "../../domain/schemas.generated";
import type {
  BreakRule,
  CalcDrill,
  CalcDrillDraft,
  CalcStat,
  CalcType,
  EvidenceLink,
  EvidenceLinkDraft,
  LogInput,
  LogItem,
  Medication,
  MedicationCondition,
  MedicationDraft,
  MedicationLog,
  MedicationLogDraft,
  Placement,
  Proficiency,
  ProficiencyPadSignOff,
  ProficiencyProgress,
  ProficiencyStatusChange,
  ProficiencyStatusEvent,
  Reflection,
  ReflectionDraft,
  ReflectionSection,
  ReflectionSectionInput,
  ReflectionTag,
  RevisionSession,
  RevisionSessionDraft,
  RevisionTarget,
  RevisionTargetDraft,
  RevisionTopic,
  RevisionTopicDraft,
  SelfCareCheckin,
  SelfCareCheckinDraft,
  Shift,
  Skill,
  SkillProgress,
  SkillSignOff,
  SkillStage,
  Subject,
  Tag,
  User,
} from "../../domain/types";

/** The verified principal the server derives from the JWT — never from the client. */
export interface DynamoPrincipal {
  sub: string;
  email?: string;
}

export interface DynamoRepositoryOptions {
  doc: DynamoDBDocumentClient;
  tableName: string;
  principal: DynamoPrincipal;
}

/** Raw stored item = keys + infra fields + top-level domain fields. */
type RawItem = Record<string, unknown> & { version?: number };

function notImpl(method: string): never {
  throw new Error(`DynamoRepository.${method} not implemented until Phase 2`);
}

/**
 * Server-side Repository bound to a single verified principal (Cognito `sub`).
 *
 * Storage model — spec-backend-dynamodb.md §2: one owner-partitioned table,
 * `PK = USER#<sub>`, `SK = <TYPE>#<id>`, an `owner` attribute, and infra/sync fields
 * (`updatedAt` LWW clock, informational `version`, `deleted`). Every operation is scoped
 * to `this.principal.sub` — the passed `userId` args are IGNORED (the server owns the
 * identity; the client value is never trusted). Authorisation (AVP owner-all) is the
 * router's gate around dispatch; this class is storage only.
 *
 * On read, items are unmarshalled through the generated zod schemas, which both validate
 * and strip the key/infra attributes back to the exact domain shape.
 *
 * PHASE 1 implements the Placements + Shifts slice (+ User, break rules, log items).
 * Everything else throws until Phase 2.
 */
export class DynamoRepository implements Repository {
  private readonly doc: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly sub: string;
  private readonly email?: string;

  constructor(opts: DynamoRepositoryOptions) {
    this.doc = opts.doc;
    this.tableName = opts.tableName;
    this.sub = opts.principal.sub;
    this.email = opts.principal.email;
  }

  // ---- keying ----
  private pk(): string {
    return `USER#${this.sub}`;
  }
  private static sk = {
    profile: () => "PROFILE",
    placement: (id: string) => `PLACEMENT#${id}`,
    shift: (id: string) => `SHIFT#${id}`,
    breakRule: (id: string) => `BREAKRULE#${id}`,
    log: (createdAt: string, id: string) => `LOG#${createdAt}#${id}`,
    // ---- Phase 2 ----
    medication: (id: string) => `MED#${id}`,
    medicationCondition: (medicationId: string, condition: string) =>
      `MEDCOND#${medicationId}#${condition}`,
    medicationLog: (id: string) => `MEDLOG#${id}`,
    calcDrill: (id: string) => `CALCDRILL#${id}`,
    calcStat: (calcType: string) => `CALCSTAT#${calcType}`,
    profProgress: (proficiencyId: string) => `PROFPROG#${proficiencyId}`,
    // A timestamp keeps events chronological within a progress row; the id disambiguates
    // two events written in the same millisecond (mirrors the LOG# key).
    profEvent: (progressId: string, createdAt: string, id: string) =>
      `PROFEVENT#${progressId}#${createdAt}#${id}`,
    evidenceLink: (proficiencyId: string, id: string) => `EVLINK#${proficiencyId}#${id}`,
    skill: (id: string) => `SKILL#${id}`,
    skillProgress: (skillId: string) => `SKILLPROG#${skillId}`,
    reflection: (id: string) => `REFLECTION#${id}`,
    reflectionSection: (reflectionId: string, stage: string) =>
      `REFSECTION#${reflectionId}#${stage}`,
    tag: (labelLower: string) => `TAG#${labelLower}`,
    reflectionTag: (reflectionId: string, tagId: string) => `REFTAG#${reflectionId}#${tagId}`,
    subject: (id: string) => `SUBJECT#${id}`,
    revisionTarget: (id: string) => `REVTARGET#${id}`,
    revisionTopic: (id: string) => `REVTOPIC#${id}`,
    revisionSession: (id: string) => `REVSESSION#${id}`,
    selfCareCheckin: (id: string) => `SELFCARE#${id}`,
  };

  /** Tombstone reap horizon (spec §5: DynamoDB TTL reaps soft-deletes after ~90 days). */
  private static readonly TOMBSTONE_TTL_DAYS = 90;
  private static tombstoneTtl(): number {
    return Math.floor(Date.now() / 1000) + DynamoRepository.TOMBSTONE_TTL_DAYS * 24 * 60 * 60;
  }

  // ---- low-level helpers ----
  /** The stored item exactly as-is — INCLUDING tombstones (for sync + delete/merge). */
  private async getRawUnfiltered(sk: string): Promise<RawItem | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(), SK: sk } }),
    );
    return res.Item as RawItem | undefined;
  }

  /** A live item — tombstones read as absent, so the app never sees soft-deleted rows. */
  private async getRaw(sk: string): Promise<RawItem | undefined> {
    const raw = await this.getRawUnfiltered(sk);
    return raw && raw.deleted === true ? undefined : raw;
  }

  private async put(
    entityType: string,
    sk: string,
    domain: object,
    version: number,
  ): Promise<void> {
    const item = {
      PK: this.pk(),
      SK: sk,
      owner: this.sub,
      entityType,
      ...domain,
      updatedAt: (domain as { updatedAt?: string }).updatedAt ?? nowIso(),
      version,
      deleted: false,
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: item }));
  }

  /**
   * Soft-delete (spec §5): never a `DeleteCommand`. The row is rewritten with
   * `deleted: true`, a bumped `updatedAt` LWW clock, a bumped `version`, and a ~90-day
   * `ttl`. Idempotent — an already-tombstoned (or absent) key is a no-op, so double
   * deletes and cascades over stale rows don't error. The tombstone syncs like any row
   * and is reaped by DynamoDB TTL.
   */
  private async delete(sk: string): Promise<void> {
    const raw = await this.getRawUnfiltered(sk);
    if (!raw || raw.deleted === true) return;
    const tombstone = {
      ...raw,
      updatedAt: nowIso(),
      version: (raw.version ?? 1) + 1,
      deleted: true,
      ttl: DynamoRepository.tombstoneTtl(),
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: tombstone }));
  }

  private async queryPrefix(prefix: string): Promise<RawItem[]> {
    const items: RawItem[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: { ":pk": this.pk(), ":sk": prefix },
          ExclusiveStartKey,
        }),
      );
      // Filter tombstones — all normal reads/lists must not see soft-deleted rows.
      for (const it of res.Items ?? []) {
        if ((it as RawItem).deleted !== true) items.push(it as RawItem);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  // ---- User (lazy-created on first getCurrentUser — spec-auth §1.4) ----
  async getCurrentUser(): Promise<User> {
    const raw = await this.getRaw(DynamoRepository.sk.profile());
    if (raw) return userSchema.parse(raw) as User;
    const ts = nowIso();
    const localPart = this.email?.split("@")[0];
    const user: User = {
      id: this.sub,
      displayName: localPart && localPart.length > 0 ? localPart : "Me",
      email: this.email,
      field: "ADULT",
      programmeType: "BSC_3YR",
      currentPart: 1,
      totalParts: 3,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.put("users", DynamoRepository.sk.profile(), user, 1);
    return user;
  }

  async updateUser(patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const raw = await this.getRaw(DynamoRepository.sk.profile());
    const current = raw ? (userSchema.parse(raw) as User) : await this.getCurrentUser();
    const version = (raw?.version ?? 1) + 1;
    const updated: User = { ...current, ...patch, id: this.sub, updatedAt: nowIso() };
    await this.put("users", DynamoRepository.sk.profile(), updated, version);
    return updated;
  }

  /** Per-user scoped wipe: delete every item in this principal's partition (never global
   *  seed — there is none server-side). getCurrentUser lazily recreates the profile. */
  async resetDatabase(): Promise<void> {
    const all = await this.queryAll();
    for (const it of all) await this.delete(it.SK as string);
  }

  /** Whole-partition scan, looping `LastEvaluatedKey` (correct past 1 MB — spec §2.3). */
  private async scanPartition(includeDeleted: boolean): Promise<RawItem[]> {
    const items: RawItem[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": this.pk() },
          ExclusiveStartKey,
        }),
      );
      for (const it of res.Items ?? []) {
        if (includeDeleted || (it as RawItem).deleted !== true) items.push(it as RawItem);
      }
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  private async queryAll(): Promise<RawItem[]> {
    return this.scanPartition(false);
  }

  // ---- Break rules (only the user's OWN custom rules; defaults live in the client
  //      bundle and are merged by ApiRepository — spec §2.4) ----
  async getBreakRules(_userId: string): Promise<BreakRule[]> {
    const rows = await this.queryPrefix("BREAKRULE#");
    return rows
      .map((r) => breakRuleSchema.parse(r) as BreakRule)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async saveBreakRules(
    _userId: string,
    rules: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">>,
  ): Promise<BreakRule[]> {
    await this.clearBreakRules();
    const created: BreakRule[] = rules.map((r, i) => ({
      id: newId(),
      userId: this.sub,
      minShiftMins: r.minShiftMins,
      maxShiftMins: r.maxShiftMins,
      breakMins: r.breakMins,
      orderIndex: i,
    }));
    for (const rule of created) {
      await this.put("breakRules", DynamoRepository.sk.breakRule(rule.id), rule, 1);
    }
    return created;
  }

  async resetBreakRules(_userId: string): Promise<void> {
    await this.clearBreakRules();
  }

  private async clearBreakRules(): Promise<void> {
    const rows = await this.queryPrefix("BREAKRULE#");
    for (const r of rows) await this.delete(r.SK as string);
  }

  // ---- Placements ----
  async listPlacements(_userId: string): Promise<Placement[]> {
    const rows = await this.queryPrefix("PLACEMENT#");
    return rows
      .map((r) => placementSchema.parse(r) as Placement)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  }

  async createPlacement(input: Omit<Placement, "id" | "createdAt">): Promise<Placement> {
    const placement: Placement = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put("placements", DynamoRepository.sk.placement(placement.id), placement, 1);
    return placement;
  }

  async updatePlacement(
    id: string,
    patch: Partial<Omit<Placement, "id" | "userId">>,
  ): Promise<Placement> {
    const raw = await this.getRaw(DynamoRepository.sk.placement(id));
    if (!raw) throw new Error(`Placement ${id} not found`);
    const current = placementSchema.parse(raw) as Placement;
    const updated: Placement = { ...current, ...patch, id, userId: this.sub };
    await this.put(
      "placements",
      DynamoRepository.sk.placement(id),
      updated,
      (raw.version ?? 1) + 1,
    );
    return updated;
  }

  async deletePlacement(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.placement(id));
  }

  // ---- Shifts ----
  async listShifts(_userId: string): Promise<Shift[]> {
    const rows = await this.queryPrefix("SHIFT#");
    return rows
      .map((r) => shiftSchema.parse(r) as Shift)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async getShift(id: string): Promise<Shift | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.shift(id));
    return raw ? (shiftSchema.parse(raw) as Shift) : undefined;
  }

  async createShift(input: Omit<Shift, "id" | "createdAt" | "updatedAt">): Promise<Shift> {
    const ts = nowIso();
    const shift: Shift = { ...input, userId: this.sub, id: newId(), createdAt: ts, updatedAt: ts };
    await this.put("shifts", DynamoRepository.sk.shift(shift.id), shift, 1);
    return shift;
  }

  async updateShift(
    id: string,
    patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>,
  ): Promise<Shift> {
    const raw = await this.getRaw(DynamoRepository.sk.shift(id));
    if (!raw) throw new Error(`Shift ${id} not found`);
    const current = shiftSchema.parse(raw) as Shift;
    const updated: Shift = { ...current, ...patch, id, userId: this.sub, updatedAt: nowIso() };
    await this.put("shifts", DynamoRepository.sk.shift(id), updated, (raw.version ?? 1) + 1);
    return updated;
  }

  async deleteShift(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.shift(id));
  }

  // ---- Activity log ----
  async createLogItem(input: LogInput): Promise<LogItem> {
    const createdAt = nowIso();
    const item: LogItem = { ...input, userId: this.sub, id: newId(), createdAt };
    await this.put("logItems", DynamoRepository.sk.log(createdAt, item.id), item, 1);
    return item;
  }

  async listLogItems(
    _userId: string,
    filter?: { entityType?: string; entityId?: string },
  ): Promise<LogItem[]> {
    let rows = (await this.queryPrefix("LOG#")).map((r) => logItemSchema.parse(r) as LogItem);
    if (filter?.entityType) rows = rows.filter((r) => r.entityType === filter.entityType);
    if (filter?.entityId) rows = rows.filter((r) => r.entityId === filter.entityId);
    return rows.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — the remaining entities. Same storage model as Phase 1: owner-scoped
  // `begins_with` queries, deterministic/child SKs per §2.2, reads unmarshalled through
  // the generated zod schemas (which strip the key/infra attributes), writes stamping
  // `userId = this.sub`. `listProficiencies`/`getProficiency` stay unimplemented — the
  // proficiency master list is bundled in the client and never dispatched here (§2.4).
  // ---------------------------------------------------------------------------

  /** Informational monotonic version — bump on rewrite, start at 1 (§3.1, not an OCC gate). */
  private nextVersion(raw: RawItem | undefined): number {
    return raw ? (raw.version ?? 1) + 1 : 1;
  }

  /**
   * Delete a child/keyed item found by its domain `id` when the SK is not derivable from
   * the id alone (`MEDCOND#<medId>#<condition>`, `EVLINK#<profId>#<id>`). Scans the small
   * per-user prefix and deletes the SK whose stored `id` matches.
   */
  private async deleteByIdInPrefix(prefix: string, id: string): Promise<void> {
    const rows = await this.queryPrefix(prefix);
    for (const r of rows) {
      if (r.id === id) {
        await this.delete(r.SK as string);
        return;
      }
    }
  }

  // ---- Medications ----
  async listMedications(_userId: string): Promise<Medication[]> {
    const rows = await this.queryPrefix("MED#");
    return rows
      .map((r) => medicationSchema.parse(r) as Medication)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getMedication(id: string): Promise<Medication | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.medication(id));
    return raw ? (medicationSchema.parse(raw) as Medication) : undefined;
  }

  async createMedication(input: MedicationDraft & { userId: string }): Promise<Medication> {
    const ts = nowIso();
    const med: Medication = {
      ...input,
      userId: this.sub,
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    };
    await this.put("medications", DynamoRepository.sk.medication(med.id), med, 1);
    return med;
  }

  async updateMedication(id: string, patch: Partial<MedicationDraft>): Promise<Medication> {
    const raw = await this.getRaw(DynamoRepository.sk.medication(id));
    if (!raw) throw new Error(`Medication ${id} not found`);
    const current = medicationSchema.parse(raw) as Medication;
    const updated: Medication = { ...current, ...patch, id, userId: this.sub, updatedAt: nowIso() };
    await this.put(
      "medications",
      DynamoRepository.sk.medication(id),
      updated,
      this.nextVersion(raw),
    );
    return updated;
  }

  async deleteMedication(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.medication(id));
    // Cascade the med's conditions (child items keyed under MEDCOND#<id>#).
    const conds = await this.queryPrefix(`MEDCOND#${id}#`);
    for (const c of conds) await this.delete(c.SK as string);
  }

  // ---- Medication conditions (child; owner from the parent med) ----
  async listMedicationConditions(medicationId: string): Promise<MedicationCondition[]> {
    const rows = await this.queryPrefix(`MEDCOND#${medicationId}#`);
    return rows
      .map((r) => medicationConditionSchema.parse(r) as MedicationCondition)
      .sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0));
  }

  async listConditionsForUser(_userId: string): Promise<MedicationCondition[]> {
    const rows = await this.queryPrefix("MEDCOND#");
    return rows.map((r) => medicationConditionSchema.parse(r) as MedicationCondition);
  }

  async addMedicationCondition(
    medicationId: string,
    condition: string,
  ): Promise<MedicationCondition> {
    const trimmed = condition.trim();
    const row: MedicationCondition = {
      id: newId(),
      medicationId,
      condition: trimmed,
      addedAt: nowIso(),
    };
    await this.put(
      "medicationConditions",
      DynamoRepository.sk.medicationCondition(medicationId, trimmed),
      row,
      1,
    );
    return row;
  }

  async removeMedicationCondition(id: string): Promise<void> {
    await this.deleteByIdInPrefix("MEDCOND#", id);
  }

  // ---- Medication log ----
  async listMedicationLogs(_userId: string): Promise<MedicationLog[]> {
    const rows = (await this.queryPrefix("MEDLOG#")).map(
      (r) => medicationLogSchema.parse(r) as MedicationLog,
    );
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async listMedicationLogsForShift(shiftId: string): Promise<MedicationLog[]> {
    const rows = (await this.queryPrefix("MEDLOG#"))
      .map((r) => medicationLogSchema.parse(r) as MedicationLog)
      .filter((r) => r.shiftId === shiftId);
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listMedicationLogsForMedication(medicationId: string): Promise<MedicationLog[]> {
    const rows = (await this.queryPrefix("MEDLOG#"))
      .map((r) => medicationLogSchema.parse(r) as MedicationLog)
      .filter((r) => r.medicationId === medicationId);
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async createMedicationLog(
    input: MedicationLogDraft & { userId: string },
  ): Promise<MedicationLog> {
    const log: MedicationLog = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put("medicationLogs", DynamoRepository.sk.medicationLog(log.id), log, 1);
    return log;
  }

  async deleteMedicationLog(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.medicationLog(id));
  }

  // ---- Calc drills ----
  async listCalcDrills(_userId: string, filter?: { medicationId?: string }): Promise<CalcDrill[]> {
    let rows = (await this.queryPrefix("CALCDRILL#")).map(
      (r) => calcDrillSchema.parse(r) as CalcDrill,
    );
    if (filter?.medicationId) rows = rows.filter((r) => r.medicationId === filter.medicationId);
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createCalcDrill(input: CalcDrillDraft & { userId: string }): Promise<CalcDrill> {
    const drill: CalcDrill = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put("calcDrills", DynamoRepository.sk.calcDrill(drill.id), drill, 1);
    return drill;
  }

  async updateCalcDrill(id: string, patch: Partial<CalcDrillDraft>): Promise<CalcDrill> {
    const raw = await this.getRaw(DynamoRepository.sk.calcDrill(id));
    if (!raw) throw new Error(`CalcDrill ${id} not found`);
    const current = calcDrillSchema.parse(raw) as CalcDrill;
    const updated: CalcDrill = { ...current, ...patch, id, userId: this.sub };
    await this.put("calcDrills", DynamoRepository.sk.calcDrill(id), updated, this.nextVersion(raw));
    return updated;
  }

  async deleteCalcDrill(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.calcDrill(id));
  }

  // ---- Calc stats (bounded per-type aggregate; deterministic upsert) ----
  async listCalcStats(_userId: string): Promise<CalcStat[]> {
    const rows = await this.queryPrefix("CALCSTAT#");
    return rows.map((r) => calcStatSchema.parse(r) as CalcStat);
  }

  async recordCalcAttempt(
    _userId: string,
    calcType: CalcType,
    correct: boolean,
  ): Promise<CalcStat> {
    const sk = DynamoRepository.sk.calcStat(calcType);
    const raw = await this.getRaw(sk);
    const current = raw ? (calcStatSchema.parse(raw) as CalcStat) : undefined;
    const next: CalcStat = {
      id: `${this.sub}:${calcType}`,
      userId: this.sub,
      calcType,
      attempts: (current?.attempts ?? 0) + 1,
      correct: (current?.correct ?? 0) + (correct ? 1 : 0),
      lastAttempted: nowIso(),
    };
    await this.put("calcStats", sk, next, this.nextVersion(raw));
    return next;
  }

  // ---- NMC proficiencies — bundled in the client, never stored server-side (§2.4) ----
  listProficiencies(): Promise<Proficiency[]> {
    return notImpl("listProficiencies");
  }
  getProficiency(): Promise<Proficiency | undefined> {
    return notImpl("getProficiency");
  }

  // ---- Proficiency progress + status history ----
  async listProficiencyProgress(_userId: string): Promise<ProficiencyProgress[]> {
    const rows = await this.queryPrefix("PROFPROG#");
    return rows.map((r) => proficiencyProgressSchema.parse(r) as ProficiencyProgress);
  }

  async getProficiencyProgress(
    _userId: string,
    proficiencyId: string,
  ): Promise<ProficiencyProgress | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.profProgress(proficiencyId));
    return raw ? (proficiencyProgressSchema.parse(raw) as ProficiencyProgress) : undefined;
  }

  async setProficiencyStatus(
    _userId: string,
    proficiencyId: string,
    change: ProficiencyStatusChange,
  ): Promise<ProficiencyProgress> {
    const sk = DynamoRepository.sk.profProgress(proficiencyId);
    const raw = await this.getRaw(sk);
    const existing = raw
      ? (proficiencyProgressSchema.parse(raw) as ProficiencyProgress)
      : undefined;
    const progress: ProficiencyProgress = {
      id: existing?.id ?? newId(),
      userId: this.sub,
      proficiencyId,
      status: change.status,
      targetPart: existing?.targetPart,
      // Preserve any PAD sign-off — a status change never un-signs it.
      padSignedOff: existing?.padSignedOff,
      padSignOffByName: existing?.padSignOffByName,
      padSignOffLocation: existing?.padSignOffLocation,
      padSignOffDate: existing?.padSignOffDate,
      updatedAt: nowIso(),
    };
    await this.put("proficiencyProgress", sk, progress, this.nextVersion(raw));
    const event: ProficiencyStatusEvent = {
      id: newId(),
      progressId: progress.id,
      status: change.status,
      partIndex: change.partIndex,
      assessorName: change.assessorName,
      note: change.note,
      occurredAt: change.occurredAt,
      createdAt: nowIso(),
    };
    await this.put(
      "proficiencyStatusEvents",
      DynamoRepository.sk.profEvent(progress.id, event.createdAt, event.id),
      event,
      1,
    );
    return progress;
  }

  async setProficiencyTargetPart(
    _userId: string,
    proficiencyId: string,
    targetPart: number | undefined,
  ): Promise<ProficiencyProgress> {
    const sk = DynamoRepository.sk.profProgress(proficiencyId);
    const raw = await this.getRaw(sk);
    const existing = raw
      ? (proficiencyProgressSchema.parse(raw) as ProficiencyProgress)
      : undefined;
    const progress: ProficiencyProgress = {
      id: existing?.id ?? newId(),
      userId: this.sub,
      proficiencyId,
      status: existing?.status ?? "NOT_YET_ACHIEVED",
      targetPart,
      // Preserve any PAD sign-off across a target-part edit.
      padSignedOff: existing?.padSignedOff,
      padSignOffByName: existing?.padSignOffByName,
      padSignOffLocation: existing?.padSignOffLocation,
      padSignOffDate: existing?.padSignOffDate,
      updatedAt: nowIso(),
    };
    await this.put("proficiencyProgress", sk, progress, this.nextVersion(raw));
    return progress;
  }

  async setProficiencyPadSignOff(
    _userId: string,
    proficiencyId: string,
    signOff: ProficiencyPadSignOff | null,
  ): Promise<ProficiencyProgress> {
    const sk = DynamoRepository.sk.profProgress(proficiencyId);
    const raw = await this.getRaw(sk);
    const existing = raw
      ? (proficiencyProgressSchema.parse(raw) as ProficiencyProgress)
      : undefined;
    const progress: ProficiencyProgress = {
      id: existing?.id ?? newId(),
      userId: this.sub,
      proficiencyId,
      status: existing?.status ?? "NOT_YET_ACHIEVED",
      targetPart: existing?.targetPart,
      // null clears the sign-off (mis-mark correction); otherwise mark + trim the meta.
      padSignedOff: signOff !== null,
      padSignOffByName: signOff?.padSignOffByName?.trim() || undefined,
      padSignOffLocation: signOff?.padSignOffLocation?.trim() || undefined,
      padSignOffDate: signOff?.padSignOffDate || undefined,
      updatedAt: nowIso(),
    };
    await this.put("proficiencyProgress", sk, progress, this.nextVersion(raw));
    return progress;
  }

  async listProficiencyStatusEvents(progressId: string): Promise<ProficiencyStatusEvent[]> {
    const rows = (await this.queryPrefix(`PROFEVENT#${progressId}#`)).map(
      (r) => proficiencyStatusEventSchema.parse(r) as ProficiencyStatusEvent,
    );
    // Newest assessment first; tie-break on creation order.
    return rows.sort((a, b) =>
      a.occurredAt !== b.occurredAt
        ? a.occurredAt < b.occurredAt
          ? 1
          : -1
        : a.createdAt < b.createdAt
          ? 1
          : -1,
    );
  }

  // ---- Evidence links (polymorphic) ----
  async listEvidenceLinks(proficiencyId: string): Promise<EvidenceLink[]> {
    const rows = (await this.queryPrefix(`EVLINK#${proficiencyId}#`)).map(
      (r) => evidenceLinkSchema.parse(r) as EvidenceLink,
    );
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listEvidenceLinksForUser(_userId: string): Promise<EvidenceLink[]> {
    const rows = await this.queryPrefix("EVLINK#");
    return rows.map((r) => evidenceLinkSchema.parse(r) as EvidenceLink);
  }

  async createEvidenceLink(input: EvidenceLinkDraft & { userId: string }): Promise<EvidenceLink> {
    const link: EvidenceLink = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put(
      "evidenceLinks",
      DynamoRepository.sk.evidenceLink(link.proficiencyId, link.id),
      link,
      1,
    );
    return link;
  }

  async deleteEvidenceLink(id: string): Promise<void> {
    await this.deleteByIdInPrefix("EVLINK#", id);
  }

  // ---- Clinical skills (CUSTOM only server-side; Annexe B baseline is bundled) ----
  async listSkills(_userId: string): Promise<Skill[]> {
    const rows = await this.queryPrefix("SKILL#");
    return rows
      .map((r) => skillSchema.parse(r) as Skill)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name));
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.skill(id));
    return raw ? (skillSchema.parse(raw) as Skill) : undefined;
  }

  async addCustomSkill(_userId: string, input: { name: string; category: string }): Promise<Skill> {
    // Order custom skills after every built-in (which top out well below 1000).
    const ownCount = (await this.queryPrefix("SKILL#")).length;
    const skill: Skill = {
      id: newId(),
      userId: this.sub,
      name: input.name.trim(),
      category: input.category.trim() || "Custom skills",
      source: "CUSTOM",
      orderIndex: 1000 + ownCount,
    };
    await this.put("skills", DynamoRepository.sk.skill(skill.id), skill, 1);
    return skill;
  }

  async deleteCustomSkill(id: string): Promise<void> {
    const raw = await this.getRaw(DynamoRepository.sk.skill(id));
    // Baseline skills live in the client bundle, not this partition — an unknown id is a
    // no-op here (unlike Dexie, which can see the baseline and throws for it).
    if (!raw) return;
    const skill = skillSchema.parse(raw) as Skill;
    if (skill.source !== "CUSTOM") throw new Error("Cannot delete a built-in baseline skill");
    await this.delete(DynamoRepository.sk.skill(id));
    // Drop the user's progress row for it (deterministic SKILLPROG#<skillId>).
    await this.delete(DynamoRepository.sk.skillProgress(id));
  }

  async listSkillProgress(_userId: string): Promise<SkillProgress[]> {
    const rows = await this.queryPrefix("SKILLPROG#");
    return rows.map((r) => skillProgressSchema.parse(r) as SkillProgress);
  }

  async getSkillProgress(_userId: string, skillId: string): Promise<SkillProgress | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.skillProgress(skillId));
    return raw ? (skillProgressSchema.parse(raw) as SkillProgress) : undefined;
  }

  async setSkillStage(_userId: string, skillId: string, stage: SkillStage): Promise<SkillProgress> {
    const sk = DynamoRepository.sk.skillProgress(skillId);
    const raw = await this.getRaw(sk);
    const existing = raw ? (skillProgressSchema.parse(raw) as SkillProgress) : undefined;
    // Preserve any existing sign-off — changing stage never un-signs-off a skill.
    const next: SkillProgress = {
      id: existing?.id ?? newId(),
      userId: this.sub,
      skillId,
      stage,
      signedOff: existing?.signedOff ?? false,
      signOffByName: existing?.signOffByName,
      signOffLocation: existing?.signOffLocation,
      signOffDate: existing?.signOffDate,
      evidenceNote: existing?.evidenceNote,
      shiftId: existing?.shiftId, // preserve the sign-off's shift across stage changes
      updatedAt: nowIso(),
    };
    await this.put("skillProgress", sk, next, this.nextVersion(raw));
    return next;
  }

  async signOffSkill(
    _userId: string,
    skillId: string,
    signOff: SkillSignOff,
  ): Promise<SkillProgress> {
    const sk = DynamoRepository.sk.skillProgress(skillId);
    const raw = await this.getRaw(sk);
    const existing = raw ? (skillProgressSchema.parse(raw) as SkillProgress) : undefined;
    // signedOff only ever goes true here — there is no un-sign-off path (no refresh).
    const next: SkillProgress = {
      id: existing?.id ?? newId(),
      userId: this.sub,
      skillId,
      stage: existing?.stage ?? "OBSERVED",
      signedOff: true,
      signOffByName: signOff.signOffByName?.trim() || undefined,
      signOffLocation: signOff.signOffLocation?.trim() || undefined,
      signOffDate: signOff.signOffDate || undefined,
      evidenceNote: signOff.evidenceNote?.trim() || undefined,
      shiftId: signOff.shiftId || existing?.shiftId || undefined,
      updatedAt: nowIso(),
    };
    await this.put("skillProgress", sk, next, this.nextVersion(raw));
    return next;
  }

  // ---- Reflection on practice ----
  async listReflections(_userId: string): Promise<Reflection[]> {
    const rows = (await this.queryPrefix("REFLECTION#")).map(
      (r) => reflectionSchema.parse(r) as Reflection,
    );
    // Newest first by the reflected-on date when set, else creation day.
    const key = (r: Reflection) => r.occurredOn ?? r.createdAt.slice(0, 10);
    return rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }

  async getReflection(id: string): Promise<Reflection | undefined> {
    const raw = await this.getRaw(DynamoRepository.sk.reflection(id));
    return raw ? (reflectionSchema.parse(raw) as Reflection) : undefined;
  }

  async listReflectionSections(reflectionId: string): Promise<ReflectionSection[]> {
    const rows = await this.queryPrefix(`REFSECTION#${reflectionId}#`);
    return rows.map((r) => reflectionSectionSchema.parse(r) as ReflectionSection);
  }

  async listReflectionSectionsForUser(_userId: string): Promise<ReflectionSection[]> {
    const rows = await this.queryPrefix("REFSECTION#");
    return rows.map((r) => reflectionSectionSchema.parse(r) as ReflectionSection);
  }

  async createReflection(
    input: ReflectionDraft & { userId: string },
    sections: ReflectionSectionInput[],
  ): Promise<Reflection> {
    const ts = nowIso();
    const reflection: Reflection = {
      ...input,
      userId: this.sub,
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
    };
    await this.put("reflections", DynamoRepository.sk.reflection(reflection.id), reflection, 1);
    await this.writeReflectionSections(reflection.id, sections);
    return reflection;
  }

  async updateReflection(
    id: string,
    patch: Partial<ReflectionDraft>,
    sections?: ReflectionSectionInput[],
  ): Promise<Reflection> {
    const raw = await this.getRaw(DynamoRepository.sk.reflection(id));
    if (!raw) throw new Error(`Reflection ${id} not found`);
    const current = reflectionSchema.parse(raw) as Reflection;
    const updated: Reflection = { ...current, ...patch, id, userId: this.sub, updatedAt: nowIso() };
    await this.put(
      "reflections",
      DynamoRepository.sk.reflection(id),
      updated,
      this.nextVersion(raw),
    );
    if (sections) {
      // Replace the stage set (a stage that goes blank must disappear).
      const existing = await this.queryPrefix(`REFSECTION#${id}#`);
      for (const s of existing) await this.delete(s.SK as string);
      await this.writeReflectionSections(id, sections);
    }
    return updated;
  }

  /** Write a reflection's non-empty stage sections (deterministic ids/keys per stage). */
  private async writeReflectionSections(
    reflectionId: string,
    sections: ReflectionSectionInput[],
  ): Promise<void> {
    const rows: ReflectionSection[] = sections
      .filter((s) => s.content.trim() !== "")
      .map((s) => ({
        id: `${reflectionId}:${s.stage}`,
        reflectionId,
        stage: s.stage,
        content: s.content.trim(),
      }));
    for (const row of rows) {
      await this.put(
        "reflectionSections",
        DynamoRepository.sk.reflectionSection(reflectionId, row.stage),
        row,
        1,
      );
    }
  }

  async deleteReflection(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.reflection(id));
    const sections = await this.queryPrefix(`REFSECTION#${id}#`);
    for (const s of sections) await this.delete(s.SK as string);
    const tagLinks = await this.queryPrefix(`REFTAG#${id}#`);
    for (const t of tagLinks) await this.delete(t.SK as string);
    // A reflection may be attached to proficiencies as REFLECTION evidence — drop those.
    const evLinks = await this.queryPrefix("EVLINK#");
    for (const l of evLinks) {
      if (l.evidenceType === "REFLECTION" && l.evidenceId === id) await this.delete(l.SK as string);
    }
  }

  // ---- Tags (reflection labels; deterministic per label) ----
  async listTags(_userId: string): Promise<Tag[]> {
    const rows = await this.queryPrefix("TAG#");
    return rows
      .map((r) => tagSchema.parse(r) as Tag)
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async listReflectionTags(_userId: string): Promise<ReflectionTag[]> {
    const rows = await this.queryPrefix("REFTAG#");
    return rows.map((r) => reflectionTagSchema.parse(r) as ReflectionTag);
  }

  async setReflectionTags(_userId: string, reflectionId: string, labels: string[]): Promise<Tag[]> {
    // Normalise: trim, drop blanks, dedupe case-insensitively (keeping the first form).
    const seen = new Set<string>();
    const clean: string[] = [];
    for (const raw of labels) {
      const label = raw.trim();
      const key = label.toLowerCase();
      if (label === "" || seen.has(key)) continue;
      seen.add(key);
      clean.push(label);
    }
    // Upsert each tag by label (deterministic TAG#<labelLower>), reusing an existing row.
    const existingTags = (await this.queryPrefix("TAG#")).map((r) => tagSchema.parse(r) as Tag);
    const byLabel = new Map(existingTags.map((t) => [t.label.toLowerCase(), t]));
    const resolved: Tag[] = [];
    for (const label of clean) {
      const found = byLabel.get(label.toLowerCase());
      if (found) {
        resolved.push(found);
      } else {
        const tag: Tag = { id: newId(), userId: this.sub, label };
        await this.put("tags", DynamoRepository.sk.tag(label.toLowerCase()), tag, 1);
        byLabel.set(label.toLowerCase(), tag);
        resolved.push(tag);
      }
    }
    // Rewrite this reflection's join rows.
    const old = await this.queryPrefix(`REFTAG#${reflectionId}#`);
    for (const o of old) await this.delete(o.SK as string);
    for (const t of resolved) {
      const link: ReflectionTag = { id: `${reflectionId}:${t.id}`, reflectionId, tagId: t.id };
      await this.put(
        "reflectionTags",
        DynamoRepository.sk.reflectionTag(reflectionId, t.id),
        link,
        1,
      );
    }
    return resolved;
  }

  // ---- Revision timetable ----
  async listSubjects(_userId: string): Promise<Subject[]> {
    const rows = await this.queryPrefix("SUBJECT#");
    return rows
      .map((r) => subjectSchema.parse(r) as Subject)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async addSubject(_userId: string, name: string): Promise<Subject> {
    const subject: Subject = { id: newId(), userId: this.sub, name: name.trim() };
    await this.put("subjects", DynamoRepository.sk.subject(subject.id), subject, 1);
    return subject;
  }

  async listRevisionTargets(_userId: string): Promise<RevisionTarget[]> {
    const rows = (await this.queryPrefix("REVTARGET#")).map(
      (r) => revisionTargetSchema.parse(r) as RevisionTarget,
    );
    // Soonest date first.
    return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  async createRevisionTarget(
    input: RevisionTargetDraft & { userId: string },
  ): Promise<RevisionTarget> {
    const target: RevisionTarget = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put("revisionTargets", DynamoRepository.sk.revisionTarget(target.id), target, 1);
    return target;
  }

  async deleteRevisionTarget(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.revisionTarget(id));
  }

  async listRevisionTopics(_userId: string): Promise<RevisionTopic[]> {
    const rows = await this.queryPrefix("REVTOPIC#");
    return rows.map((r) => revisionTopicSchema.parse(r) as RevisionTopic);
  }

  async createRevisionTopic(
    input: RevisionTopicDraft & { userId: string },
  ): Promise<RevisionTopic> {
    const topic: RevisionTopic = { ...input, userId: this.sub, id: newId(), createdAt: nowIso() };
    await this.put("revisionTopics", DynamoRepository.sk.revisionTopic(topic.id), topic, 1);
    return topic;
  }

  async updateRevisionTopic(
    id: string,
    patch: Partial<RevisionTopicDraft>,
  ): Promise<RevisionTopic> {
    const raw = await this.getRaw(DynamoRepository.sk.revisionTopic(id));
    if (!raw) throw new Error(`RevisionTopic ${id} not found`);
    const current = revisionTopicSchema.parse(raw) as RevisionTopic;
    const updated: RevisionTopic = { ...current, ...patch, id, userId: this.sub };
    await this.put(
      "revisionTopics",
      DynamoRepository.sk.revisionTopic(id),
      updated,
      this.nextVersion(raw),
    );
    return updated;
  }

  async deleteRevisionTopic(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.revisionTopic(id));
    // Cascade the topic's sessions (a general session with no topicId survives).
    const sessions = await this.queryPrefix("REVSESSION#");
    for (const s of sessions) {
      if (s.topicId === id) await this.delete(s.SK as string);
    }
  }

  async listRevisionSessions(_userId: string): Promise<RevisionSession[]> {
    const rows = (await this.queryPrefix("REVSESSION#")).map(
      (r) => revisionSessionSchema.parse(r) as RevisionSession,
    );
    // Soonest scheduled first.
    return rows.sort((a, b) =>
      a.scheduledStart < b.scheduledStart ? -1 : a.scheduledStart > b.scheduledStart ? 1 : 0,
    );
  }

  async createRevisionSession(
    input: RevisionSessionDraft & { userId: string },
  ): Promise<RevisionSession> {
    const session: RevisionSession = {
      ...input,
      userId: this.sub,
      id: newId(),
      createdAt: nowIso(),
    };
    await this.put("revisionSessions", DynamoRepository.sk.revisionSession(session.id), session, 1);
    return session;
  }

  async updateRevisionSession(
    id: string,
    patch: Partial<RevisionSessionDraft>,
  ): Promise<RevisionSession> {
    const raw = await this.getRaw(DynamoRepository.sk.revisionSession(id));
    if (!raw) throw new Error(`RevisionSession ${id} not found`);
    const current = revisionSessionSchema.parse(raw) as RevisionSession;
    const updated: RevisionSession = { ...current, ...patch, id, userId: this.sub };
    await this.put(
      "revisionSessions",
      DynamoRepository.sk.revisionSession(id),
      updated,
      this.nextVersion(raw),
    );
    return updated;
  }

  async deleteRevisionSession(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.revisionSession(id));
  }

  // ---- Self-care check-ins ----
  async listSelfCareCheckins(_userId: string): Promise<SelfCareCheckin[]> {
    const rows = (await this.queryPrefix("SELFCARE#")).map(
      (r) => selfCareCheckinSchema.parse(r) as SelfCareCheckin,
    );
    // Newest first: check-in date, then creation order.
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async createSelfCareCheckin(
    input: SelfCareCheckinDraft & { userId: string },
  ): Promise<SelfCareCheckin> {
    const checkin: SelfCareCheckin = {
      ...input,
      userId: this.sub,
      id: newId(),
      createdAt: nowIso(),
    };
    await this.put("selfCareCheckins", DynamoRepository.sk.selfCareCheckin(checkin.id), checkin, 1);
    return checkin;
  }

  async deleteSelfCareCheckin(id: string): Promise<void> {
    await this.delete(DynamoRepository.sk.selfCareCheckin(id));
  }

  // ---------------------------------------------------------------------------
  // Sync transport (spec-backend-dynamodb.md §5). NOT part of the Repository interface —
  // dispatched by the router as extra allow-listed methods. Server still owns the
  // partition (PK = USER#<sub>), so every row read/written is the caller's own.
  // ---------------------------------------------------------------------------

  /** The domain-object shape the client stores + the LWW envelope, minus key/infra attrs. */
  private static toSyncRow(raw: RawItem): SyncRow {
    const item = { ...raw };
    // Strip key + infra attributes; the domain fields (incl. `id`/`updatedAt`) remain.
    for (const k of ["PK", "SK", "owner", "version", "ttl", "entityType", "deleted"]) {
      delete (item as Record<string, unknown>)[k];
    }
    return {
      entityType: String(raw.entityType),
      id: String(raw.id),
      updatedAt: String(raw.updatedAt),
      deleted: raw.deleted === true,
      item,
    };
  }

  /**
   * Full-partition pull (spec §5). Every row in the caller's partition — INCLUDING
   * tombstones — changed since `since` (or all when absent), so the client can LWW-merge.
   */
  async syncPull(since?: string): Promise<SyncRow[]> {
    const all = await this.scanPartition(true);
    const changed = since ? all.filter((r) => String(r.updatedAt) > since) : all;
    return changed.map((r) => DynamoRepository.toSyncRow(r));
  }

  /**
   * State-based batch upsert (spec §5). Each row is LWW-merged: apply only if its
   * `updatedAt` is >= the stored row's (server-authoritative, ties → apply). Idempotent by
   * id. Returns the resolved row per input (the applied write, or the server's winner).
   * The server stamps `owner`/`userId` from the JWT `sub`, never the client's value.
   */
  async syncPush(rows: SyncRow[]): Promise<SyncRow[]> {
    const resolved: SyncRow[] = [];
    for (const row of rows) resolved.push(await this.mergeRow(row));
    return resolved;
  }

  private async mergeRow(row: SyncRow): Promise<SyncRow> {
    const sk = DynamoRepository.skFor(row.entityType, row.item);
    if (!sk) return row; // unknown/reference entity — not stored server-side; echo back
    const existing = await this.getRawUnfiltered(sk);
    const applies = !existing || row.updatedAt >= String(existing.updatedAt);
    if (!applies) return DynamoRepository.toSyncRow(existing!);

    const item: Record<string, unknown> = { ...row.item, id: row.id };
    // Ownership is the server's to stamp (spec F1/§7) — never trust the client's userId.
    if ("userId" in item && item.userId !== null && item.userId !== undefined) {
      item.userId = this.sub;
    }
    const stored: RawItem = {
      ...item,
      PK: this.pk(),
      SK: sk,
      owner: this.sub,
      entityType: row.entityType,
      updatedAt: row.updatedAt,
      version: (existing?.version ?? 0) + 1,
      deleted: row.deleted,
      ...(row.deleted ? { ttl: DynamoRepository.tombstoneTtl() } : {}),
    };
    await this.doc.send(new PutCommand({ TableName: this.tableName, Item: stored }));
    return DynamoRepository.toSyncRow(stored);
  }

  /**
   * The SK a domain item is stored under — derived from the item's fields, mirroring the
   * `sk` map. Reference entities (`proficiencies`) return `undefined`: they're bundled in
   * the client (§2.4) and never persisted server-side, so pushes for them are dropped.
   */
  private static skFor(entityType: string, item: Record<string, unknown>): string | undefined {
    const s = (v: unknown) => String(v);
    switch (entityType) {
      case "users":
        return "PROFILE";
      case "breakRules":
        return `BREAKRULE#${s(item.id)}`;
      case "placements":
        return `PLACEMENT#${s(item.id)}`;
      case "shifts":
        return `SHIFT#${s(item.id)}`;
      case "logItems":
        return `LOG#${s(item.createdAt)}#${s(item.id)}`;
      case "medications":
        return `MED#${s(item.id)}`;
      case "medicationConditions":
        return `MEDCOND#${s(item.medicationId)}#${s(item.condition)}`;
      case "medicationLogs":
        return `MEDLOG#${s(item.id)}`;
      case "calcDrills":
        return `CALCDRILL#${s(item.id)}`;
      case "calcStats":
        return `CALCSTAT#${s(item.calcType)}`;
      case "proficiencyProgress":
        return `PROFPROG#${s(item.proficiencyId)}`;
      case "proficiencyStatusEvents":
        return `PROFEVENT#${s(item.progressId)}#${s(item.createdAt)}#${s(item.id)}`;
      case "evidenceLinks":
        return `EVLINK#${s(item.proficiencyId)}#${s(item.id)}`;
      case "skills":
        return `SKILL#${s(item.id)}`;
      case "skillProgress":
        return `SKILLPROG#${s(item.skillId)}`;
      case "reflections":
        return `REFLECTION#${s(item.id)}`;
      case "reflectionSections":
        return `REFSECTION#${s(item.reflectionId)}#${s(item.stage)}`;
      case "tags":
        return `TAG#${s(item.label).toLowerCase()}`;
      case "reflectionTags":
        return `REFTAG#${s(item.reflectionId)}#${s(item.tagId)}`;
      case "subjects":
        return `SUBJECT#${s(item.id)}`;
      case "revisionTargets":
        return `REVTARGET#${s(item.id)}`;
      case "revisionTopics":
        return `REVTOPIC#${s(item.id)}`;
      case "revisionSessions":
        return `REVSESSION#${s(item.id)}`;
      case "selfCareCheckins":
        return `SELFCARE#${s(item.id)}`;
      default:
        return undefined; // includes "proficiencies" (bundled reference — never synced)
    }
  }
}
