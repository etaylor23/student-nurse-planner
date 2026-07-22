import type { Repository } from "../repository";
import { defaultBreakRules } from "../../logic/breakRules";
import { seedProficiencies } from "../seed/proficiencies";
import { seedSkills } from "../seed/skills";
import { seedSubjects } from "../seed/subjects";
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

export interface ApiRepositoryOptions {
  /** API base, e.g. "/api" (same-origin via CloudFront) or a full origin. */
  apiBase: string;
  /** Returns a fresh Cognito ID token for the Authorization header. */
  getIdToken: () => Promise<string>;
}

/**
 * Client Repository that talks to the RPC API (spec-backend-dynamodb.md §3). Each method
 * POSTs `{ method, args }` + the ID token to `${apiBase}/rpc`; the server derives the
 * userId from the token. Reference reads (proficiencies, baseline skills/subjects,
 * default break-rules) are served from the bundled seed with NO network call (§2.4).
 *
 * PHASE 1: the server implements the Placements + Shifts slice (+ user/breakrules/log);
 * other writes RPC to the server and currently return `unknown_method` until Phase 2.
 */
export class ApiRepository implements Repository {
  private readonly apiBase: string;
  private readonly getIdToken: () => Promise<string>;

  constructor(opts: ApiRepositoryOptions) {
    this.apiBase = opts.apiBase.replace(/\/$/, "");
    this.getIdToken = opts.getIdToken;
  }

  private async rpc<T>(method: string, args: unknown[]): Promise<T> {
    const token = await this.getIdToken();
    const res = await fetch(`${this.apiBase}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ method, args }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      result?: T;
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      throw new Error(data.detail || data.error || `RPC ${method} failed (${res.status})`);
    }
    return data.result as T;
  }

  // ---- User ----
  getCurrentUser() {
    return this.rpc<User>("getCurrentUser", []);
  }
  updateUser(patch: Partial<Omit<User, "id" | "createdAt">>) {
    return this.rpc<User>("updateUser", [patch]);
  }
  resetDatabase() {
    return this.rpc<void>("resetDatabase", []);
  }

  // ---- Break rules (reference merge: remote custom, else the bundled defaults) ----
  async getBreakRules(userId: string): Promise<BreakRule[]> {
    const own = await this.rpc<BreakRule[]>("getBreakRules", [userId]);
    if (own.length > 0) return own;
    return defaultBreakRules();
  }
  saveBreakRules(
    userId: string,
    rules: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">>,
  ) {
    return this.rpc<BreakRule[]>("saveBreakRules", [userId, rules]);
  }
  resetBreakRules(userId: string) {
    return this.rpc<void>("resetBreakRules", [userId]);
  }

  // ---- Placements ----
  listPlacements(userId: string) {
    return this.rpc<Placement[]>("listPlacements", [userId]);
  }
  createPlacement(input: Omit<Placement, "id" | "createdAt">) {
    return this.rpc<Placement>("createPlacement", [input]);
  }
  updatePlacement(id: string, patch: Partial<Omit<Placement, "id" | "userId">>) {
    return this.rpc<Placement>("updatePlacement", [id, patch]);
  }
  deletePlacement(id: string) {
    return this.rpc<void>("deletePlacement", [id]);
  }

  // ---- Shifts ----
  listShifts(userId: string) {
    return this.rpc<Shift[]>("listShifts", [userId]);
  }
  getShift(id: string) {
    return this.rpc<Shift | undefined>("getShift", [id]);
  }
  createShift(input: Omit<Shift, "id" | "createdAt" | "updatedAt">) {
    return this.rpc<Shift>("createShift", [input]);
  }
  updateShift(id: string, patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>) {
    return this.rpc<Shift>("updateShift", [id, patch]);
  }
  deleteShift(id: string) {
    return this.rpc<void>("deleteShift", [id]);
  }

  // ---- Activity log ----
  createLogItem(input: LogInput) {
    return this.rpc<LogItem>("createLogItem", [input]);
  }
  listLogItems(userId: string, filter?: { entityType?: string; entityId?: string }) {
    return this.rpc<LogItem[]>("listLogItems", [userId, filter]);
  }

  // ---- Reference data — bundled baseline merged with the user's remote custom rows (§2.4).
  // Proficiencies are bundle-only (no custom tier); skills/subjects merge the seed baseline
  // with the server's custom-only rows, mirroring today's DexieRepository merge.
  async listProficiencies(): Promise<Proficiency[]> {
    return seedProficiencies;
  }
  async getProficiency(id: string): Promise<Proficiency | undefined> {
    return seedProficiencies.find((p) => p.id === id);
  }
  async listSkills(userId: string): Promise<Skill[]> {
    // Baseline (bundled) + the user's custom skills (server returns custom-only).
    return [...seedSkills, ...(await this.rpc<Skill[]>("listSkills", [userId]))];
  }
  async getSkill(id: string): Promise<Skill | undefined> {
    // Baseline is bundled; only a custom id needs the server.
    const bundled = seedSkills.find((s) => s.id === id);
    if (bundled) return bundled;
    return this.rpc<Skill | undefined>("getSkill", [id]);
  }
  async listSubjects(userId: string): Promise<Subject[]> {
    // Baseline (bundled) + the user's custom subjects (server returns custom-only).
    return [...seedSubjects, ...(await this.rpc<Subject[]>("listSubjects", [userId]))];
  }

  // ---------------------------------------------------------------------------
  // Phase 2 — remaining entities RPC to the server (currently `unknown_method`).
  // ---------------------------------------------------------------------------
  listMedications(userId: string) {
    return this.rpc<Medication[]>("listMedications", [userId]);
  }
  getMedication(id: string) {
    return this.rpc<Medication | undefined>("getMedication", [id]);
  }
  createMedication(input: MedicationDraft & { userId: string }) {
    return this.rpc<Medication>("createMedication", [input]);
  }
  updateMedication(id: string, patch: Partial<MedicationDraft>) {
    return this.rpc<Medication>("updateMedication", [id, patch]);
  }
  deleteMedication(id: string) {
    return this.rpc<void>("deleteMedication", [id]);
  }
  listMedicationConditions(medicationId: string) {
    return this.rpc<MedicationCondition[]>("listMedicationConditions", [medicationId]);
  }
  listConditionsForUser(userId: string) {
    return this.rpc<MedicationCondition[]>("listConditionsForUser", [userId]);
  }
  addMedicationCondition(medicationId: string, condition: string) {
    return this.rpc<MedicationCondition>("addMedicationCondition", [medicationId, condition]);
  }
  removeMedicationCondition(id: string) {
    return this.rpc<void>("removeMedicationCondition", [id]);
  }
  listMedicationLogs(userId: string) {
    return this.rpc<MedicationLog[]>("listMedicationLogs", [userId]);
  }
  listMedicationLogsForShift(shiftId: string) {
    return this.rpc<MedicationLog[]>("listMedicationLogsForShift", [shiftId]);
  }
  listMedicationLogsForMedication(medicationId: string) {
    return this.rpc<MedicationLog[]>("listMedicationLogsForMedication", [medicationId]);
  }
  createMedicationLog(input: MedicationLogDraft & { userId: string }) {
    return this.rpc<MedicationLog>("createMedicationLog", [input]);
  }
  deleteMedicationLog(id: string) {
    return this.rpc<void>("deleteMedicationLog", [id]);
  }
  listCalcDrills(userId: string, filter?: { medicationId?: string }) {
    return this.rpc<CalcDrill[]>("listCalcDrills", [userId, filter]);
  }
  createCalcDrill(input: CalcDrillDraft & { userId: string }) {
    return this.rpc<CalcDrill>("createCalcDrill", [input]);
  }
  updateCalcDrill(id: string, patch: Partial<CalcDrillDraft>) {
    return this.rpc<CalcDrill>("updateCalcDrill", [id, patch]);
  }
  deleteCalcDrill(id: string) {
    return this.rpc<void>("deleteCalcDrill", [id]);
  }
  listCalcStats(userId: string) {
    return this.rpc<CalcStat[]>("listCalcStats", [userId]);
  }
  recordCalcAttempt(userId: string, calcType: CalcType, correct: boolean) {
    return this.rpc<CalcStat>("recordCalcAttempt", [userId, calcType, correct]);
  }
  listProficiencyProgress(userId: string) {
    return this.rpc<ProficiencyProgress[]>("listProficiencyProgress", [userId]);
  }
  getProficiencyProgress(userId: string, proficiencyId: string) {
    return this.rpc<ProficiencyProgress | undefined>("getProficiencyProgress", [
      userId,
      proficiencyId,
    ]);
  }
  setProficiencyStatus(userId: string, proficiencyId: string, change: ProficiencyStatusChange) {
    return this.rpc<ProficiencyProgress>("setProficiencyStatus", [userId, proficiencyId, change]);
  }
  setProficiencyTargetPart(userId: string, proficiencyId: string, targetPart: number | undefined) {
    return this.rpc<ProficiencyProgress>("setProficiencyTargetPart", [
      userId,
      proficiencyId,
      targetPart,
    ]);
  }
  setProficiencyPadSignOff(
    userId: string,
    proficiencyId: string,
    signOff: ProficiencyPadSignOff | null,
  ) {
    return this.rpc<ProficiencyProgress>("setProficiencyPadSignOff", [
      userId,
      proficiencyId,
      signOff,
    ]);
  }
  listProficiencyStatusEvents(progressId: string) {
    return this.rpc<ProficiencyStatusEvent[]>("listProficiencyStatusEvents", [progressId]);
  }
  listEvidenceLinks(proficiencyId: string) {
    return this.rpc<EvidenceLink[]>("listEvidenceLinks", [proficiencyId]);
  }
  listEvidenceLinksForUser(userId: string) {
    return this.rpc<EvidenceLink[]>("listEvidenceLinksForUser", [userId]);
  }
  createEvidenceLink(input: EvidenceLinkDraft & { userId: string }) {
    return this.rpc<EvidenceLink>("createEvidenceLink", [input]);
  }
  deleteEvidenceLink(id: string) {
    return this.rpc<void>("deleteEvidenceLink", [id]);
  }
  addCustomSkill(userId: string, input: { name: string; category: string }) {
    return this.rpc<Skill>("addCustomSkill", [userId, input]);
  }
  deleteCustomSkill(id: string) {
    return this.rpc<void>("deleteCustomSkill", [id]);
  }
  listSkillProgress(userId: string) {
    return this.rpc<SkillProgress[]>("listSkillProgress", [userId]);
  }
  getSkillProgress(userId: string, skillId: string) {
    return this.rpc<SkillProgress | undefined>("getSkillProgress", [userId, skillId]);
  }
  setSkillStage(userId: string, skillId: string, stage: SkillStage) {
    return this.rpc<SkillProgress>("setSkillStage", [userId, skillId, stage]);
  }
  signOffSkill(userId: string, skillId: string, signOff: SkillSignOff) {
    return this.rpc<SkillProgress>("signOffSkill", [userId, skillId, signOff]);
  }
  listReflections(userId: string) {
    return this.rpc<Reflection[]>("listReflections", [userId]);
  }
  getReflection(id: string) {
    return this.rpc<Reflection | undefined>("getReflection", [id]);
  }
  listReflectionSections(reflectionId: string) {
    return this.rpc<ReflectionSection[]>("listReflectionSections", [reflectionId]);
  }
  listReflectionSectionsForUser(userId: string) {
    return this.rpc<ReflectionSection[]>("listReflectionSectionsForUser", [userId]);
  }
  createReflection(
    input: ReflectionDraft & { userId: string },
    sections: ReflectionSectionInput[],
  ) {
    return this.rpc<Reflection>("createReflection", [input, sections]);
  }
  updateReflection(
    id: string,
    patch: Partial<ReflectionDraft>,
    sections?: ReflectionSectionInput[],
  ) {
    return this.rpc<Reflection>("updateReflection", [id, patch, sections]);
  }
  deleteReflection(id: string) {
    return this.rpc<void>("deleteReflection", [id]);
  }
  listTags(userId: string) {
    return this.rpc<Tag[]>("listTags", [userId]);
  }
  listReflectionTags(userId: string) {
    return this.rpc<ReflectionTag[]>("listReflectionTags", [userId]);
  }
  setReflectionTags(userId: string, reflectionId: string, labels: string[]) {
    return this.rpc<Tag[]>("setReflectionTags", [userId, reflectionId, labels]);
  }
  addSubject(userId: string, name: string) {
    return this.rpc<Subject>("addSubject", [userId, name]);
  }
  listRevisionTargets(userId: string) {
    return this.rpc<RevisionTarget[]>("listRevisionTargets", [userId]);
  }
  createRevisionTarget(input: RevisionTargetDraft & { userId: string }) {
    return this.rpc<RevisionTarget>("createRevisionTarget", [input]);
  }
  deleteRevisionTarget(id: string) {
    return this.rpc<void>("deleteRevisionTarget", [id]);
  }
  listRevisionTopics(userId: string) {
    return this.rpc<RevisionTopic[]>("listRevisionTopics", [userId]);
  }
  createRevisionTopic(input: RevisionTopicDraft & { userId: string }) {
    return this.rpc<RevisionTopic>("createRevisionTopic", [input]);
  }
  updateRevisionTopic(id: string, patch: Partial<RevisionTopicDraft>) {
    return this.rpc<RevisionTopic>("updateRevisionTopic", [id, patch]);
  }
  deleteRevisionTopic(id: string) {
    return this.rpc<void>("deleteRevisionTopic", [id]);
  }
  listRevisionSessions(userId: string) {
    return this.rpc<RevisionSession[]>("listRevisionSessions", [userId]);
  }
  createRevisionSession(input: RevisionSessionDraft & { userId: string }) {
    return this.rpc<RevisionSession>("createRevisionSession", [input]);
  }
  updateRevisionSession(id: string, patch: Partial<RevisionSessionDraft>) {
    return this.rpc<RevisionSession>("updateRevisionSession", [id, patch]);
  }
  deleteRevisionSession(id: string) {
    return this.rpc<void>("deleteRevisionSession", [id]);
  }
  listSelfCareCheckins(userId: string) {
    return this.rpc<SelfCareCheckin[]>("listSelfCareCheckins", [userId]);
  }
  createSelfCareCheckin(input: SelfCareCheckinDraft & { userId: string }) {
    return this.rpc<SelfCareCheckin>("createSelfCareCheckin", [input]);
  }
  deleteSelfCareCheckin(id: string) {
    return this.rpc<void>("deleteSelfCareCheckin", [id]);
  }
}
