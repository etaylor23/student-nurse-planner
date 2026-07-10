import {
  DeleteCommand,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Repository } from "../repository";
import { newId, nowIso } from "../../domain/ids";
import {
  breakRuleSchema,
  logItemSchema,
  placementSchema,
  shiftSchema,
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
  };

  // ---- low-level helpers ----
  private async getRaw(sk: string): Promise<RawItem | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { PK: this.pk(), SK: sk } }),
    );
    return res.Item as RawItem | undefined;
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

  private async delete(sk: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({ TableName: this.tableName, Key: { PK: this.pk(), SK: sk } }),
    );
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
      for (const it of res.Items ?? []) items.push(it as RawItem);
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

  private async queryAll(): Promise<RawItem[]> {
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
      for (const it of res.Items ?? []) items.push(it as RawItem);
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
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
  // Phase 2: the remaining ~25 entities. Stubbed so the class satisfies the
  // Repository interface; the router only dispatches the Phase 1 slice above.
  // ---------------------------------------------------------------------------
  listMedications(): Promise<Medication[]> {
    return notImpl("listMedications");
  }
  getMedication(): Promise<Medication | undefined> {
    return notImpl("getMedication");
  }
  createMedication(_input: MedicationDraft & { userId: string }): Promise<Medication> {
    return notImpl("createMedication");
  }
  updateMedication(): Promise<Medication> {
    return notImpl("updateMedication");
  }
  deleteMedication(): Promise<void> {
    return notImpl("deleteMedication");
  }
  listMedicationConditions(): Promise<MedicationCondition[]> {
    return notImpl("listMedicationConditions");
  }
  listConditionsForUser(): Promise<MedicationCondition[]> {
    return notImpl("listConditionsForUser");
  }
  addMedicationCondition(): Promise<MedicationCondition> {
    return notImpl("addMedicationCondition");
  }
  removeMedicationCondition(): Promise<void> {
    return notImpl("removeMedicationCondition");
  }
  listMedicationLogs(): Promise<MedicationLog[]> {
    return notImpl("listMedicationLogs");
  }
  listMedicationLogsForShift(): Promise<MedicationLog[]> {
    return notImpl("listMedicationLogsForShift");
  }
  listMedicationLogsForMedication(): Promise<MedicationLog[]> {
    return notImpl("listMedicationLogsForMedication");
  }
  createMedicationLog(_input: MedicationLogDraft & { userId: string }): Promise<MedicationLog> {
    return notImpl("createMedicationLog");
  }
  deleteMedicationLog(): Promise<void> {
    return notImpl("deleteMedicationLog");
  }
  listCalcDrills(): Promise<CalcDrill[]> {
    return notImpl("listCalcDrills");
  }
  createCalcDrill(_input: CalcDrillDraft & { userId: string }): Promise<CalcDrill> {
    return notImpl("createCalcDrill");
  }
  updateCalcDrill(): Promise<CalcDrill> {
    return notImpl("updateCalcDrill");
  }
  deleteCalcDrill(): Promise<void> {
    return notImpl("deleteCalcDrill");
  }
  listCalcStats(): Promise<CalcStat[]> {
    return notImpl("listCalcStats");
  }
  recordCalcAttempt(_userId: string, _calcType: CalcType, _correct: boolean): Promise<CalcStat> {
    return notImpl("recordCalcAttempt");
  }
  listProficiencies(): Promise<Proficiency[]> {
    return notImpl("listProficiencies");
  }
  getProficiency(): Promise<Proficiency | undefined> {
    return notImpl("getProficiency");
  }
  listProficiencyProgress(): Promise<ProficiencyProgress[]> {
    return notImpl("listProficiencyProgress");
  }
  getProficiencyProgress(): Promise<ProficiencyProgress | undefined> {
    return notImpl("getProficiencyProgress");
  }
  setProficiencyStatus(
    _userId: string,
    _proficiencyId: string,
    _change: ProficiencyStatusChange,
  ): Promise<ProficiencyProgress> {
    return notImpl("setProficiencyStatus");
  }
  setProficiencyTargetPart(): Promise<ProficiencyProgress> {
    return notImpl("setProficiencyTargetPart");
  }
  listProficiencyStatusEvents(): Promise<ProficiencyStatusEvent[]> {
    return notImpl("listProficiencyStatusEvents");
  }
  listEvidenceLinks(): Promise<EvidenceLink[]> {
    return notImpl("listEvidenceLinks");
  }
  listEvidenceLinksForUser(): Promise<EvidenceLink[]> {
    return notImpl("listEvidenceLinksForUser");
  }
  createEvidenceLink(_input: EvidenceLinkDraft & { userId: string }): Promise<EvidenceLink> {
    return notImpl("createEvidenceLink");
  }
  deleteEvidenceLink(): Promise<void> {
    return notImpl("deleteEvidenceLink");
  }
  listSkills(): Promise<Skill[]> {
    return notImpl("listSkills");
  }
  getSkill(): Promise<Skill | undefined> {
    return notImpl("getSkill");
  }
  addCustomSkill(): Promise<Skill> {
    return notImpl("addCustomSkill");
  }
  deleteCustomSkill(): Promise<void> {
    return notImpl("deleteCustomSkill");
  }
  listSkillProgress(): Promise<SkillProgress[]> {
    return notImpl("listSkillProgress");
  }
  getSkillProgress(): Promise<SkillProgress | undefined> {
    return notImpl("getSkillProgress");
  }
  setSkillStage(_userId: string, _skillId: string, _stage: SkillStage): Promise<SkillProgress> {
    return notImpl("setSkillStage");
  }
  signOffSkill(_userId: string, _skillId: string, _signOff: SkillSignOff): Promise<SkillProgress> {
    return notImpl("signOffSkill");
  }
  listReflections(): Promise<Reflection[]> {
    return notImpl("listReflections");
  }
  getReflection(): Promise<Reflection | undefined> {
    return notImpl("getReflection");
  }
  listReflectionSections(): Promise<ReflectionSection[]> {
    return notImpl("listReflectionSections");
  }
  listReflectionSectionsForUser(): Promise<ReflectionSection[]> {
    return notImpl("listReflectionSectionsForUser");
  }
  createReflection(
    _input: ReflectionDraft & { userId: string },
    _sections: ReflectionSectionInput[],
  ): Promise<Reflection> {
    return notImpl("createReflection");
  }
  updateReflection(): Promise<Reflection> {
    return notImpl("updateReflection");
  }
  deleteReflection(): Promise<void> {
    return notImpl("deleteReflection");
  }
  listTags(): Promise<Tag[]> {
    return notImpl("listTags");
  }
  listReflectionTags(): Promise<ReflectionTag[]> {
    return notImpl("listReflectionTags");
  }
  setReflectionTags(_userId: string, _reflectionId: string, _labels: string[]): Promise<Tag[]> {
    return notImpl("setReflectionTags");
  }
  listSubjects(): Promise<Subject[]> {
    return notImpl("listSubjects");
  }
  addSubject(): Promise<Subject> {
    return notImpl("addSubject");
  }
  listRevisionTargets(): Promise<RevisionTarget[]> {
    return notImpl("listRevisionTargets");
  }
  createRevisionTarget(_input: RevisionTargetDraft & { userId: string }): Promise<RevisionTarget> {
    return notImpl("createRevisionTarget");
  }
  deleteRevisionTarget(): Promise<void> {
    return notImpl("deleteRevisionTarget");
  }
  listRevisionTopics(): Promise<RevisionTopic[]> {
    return notImpl("listRevisionTopics");
  }
  createRevisionTopic(_input: RevisionTopicDraft & { userId: string }): Promise<RevisionTopic> {
    return notImpl("createRevisionTopic");
  }
  updateRevisionTopic(): Promise<RevisionTopic> {
    return notImpl("updateRevisionTopic");
  }
  deleteRevisionTopic(): Promise<void> {
    return notImpl("deleteRevisionTopic");
  }
  listRevisionSessions(): Promise<RevisionSession[]> {
    return notImpl("listRevisionSessions");
  }
  createRevisionSession(
    _input: RevisionSessionDraft & { userId: string },
  ): Promise<RevisionSession> {
    return notImpl("createRevisionSession");
  }
  updateRevisionSession(): Promise<RevisionSession> {
    return notImpl("updateRevisionSession");
  }
  deleteRevisionSession(): Promise<void> {
    return notImpl("deleteRevisionSession");
  }
  listSelfCareCheckins(): Promise<SelfCareCheckin[]> {
    return notImpl("listSelfCareCheckins");
  }
  createSelfCareCheckin(
    _input: SelfCareCheckinDraft & { userId: string },
  ): Promise<SelfCareCheckin> {
    return notImpl("createSelfCareCheckin");
  }
  deleteSelfCareCheckin(): Promise<void> {
    return notImpl("deleteSelfCareCheckin");
  }
}
