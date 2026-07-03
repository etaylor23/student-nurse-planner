import type { Repository } from "../repository";
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
  Shift,
  Skill,
  SkillProgress,
  SkillSignOff,
  SkillStage,
  Tag,
  User,
} from "../../domain/types";
import { newId, nowIso } from "../../domain/ids";
import { defaultBreakRules } from "../../logic/breakRules";
import { seedProficiencies } from "../seed/proficiencies";
import { seedSkills } from "../seed/skills";
import { PlannerDb } from "./db";

/** Stable id for the PoC's single local user. */
export const LOCAL_USER_ID = "local-user";

function defaultUser(): User {
  const ts = nowIso();
  return {
    id: LOCAL_USER_ID,
    displayName: "Me",
    field: "ADULT",
    programmeType: "BSC_3YR",
    currentPart: 1,
    totalParts: 3,
    createdAt: ts,
    updatedAt: ts,
  };
}

export class DexieRepository implements Repository {
  private db: PlannerDb;
  private seeded = false;

  constructor(db: PlannerDb = new PlannerDb()) {
    this.db = db;
  }

  /** Idempotent: create the local user, default break rules + proficiency list. */
  async ensureSeed(): Promise<void> {
    if (this.seeded) return;
    const existing = await this.db.users.get(LOCAL_USER_ID);
    if (!existing) await this.db.users.put(defaultUser());
    const ruleCount = await this.db.breakRules.count();
    if (ruleCount === 0) await this.db.breakRules.bulkPut(defaultBreakRules());
    // National NMC proficiency master list (global reference data).
    const profCount = await this.db.proficiencies.count();
    if (profCount === 0) await this.db.proficiencies.bulkPut(seedProficiencies);
    // Annexe B baseline clinical skills (derived from the proficiencies; global).
    const skillCount = await this.db.skills.count();
    if (skillCount === 0) await this.db.skills.bulkPut(seedSkills);
    this.seeded = true;
  }

  async getCurrentUser(): Promise<User> {
    await this.ensureSeed();
    // Non-null after seeding.
    return (await this.db.users.get(LOCAL_USER_ID))!;
  }

  async updateUser(patch: Partial<Omit<User, "id" | "createdAt">>): Promise<User> {
    const current = await this.getCurrentUser();
    const updated: User = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.users.put(updated);
    return updated;
  }

  /** Delete the whole IndexedDB database; the caller reloads so `ensureSeed` re-runs. */
  async resetDatabase(): Promise<void> {
    await this.db.delete();
    this.seeded = false;
  }

  async getBreakRules(userId: string): Promise<BreakRule[]> {
    await this.ensureSeed();
    const own = await this.db.breakRules.where("userId").equals(userId).toArray();
    if (own.length > 0) return own.sort((a, b) => a.orderIndex - b.orderIndex);
    const defaults = await this.db.breakRules.filter((r) => r.userId === null).toArray();
    return defaults.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async saveBreakRules(
    userId: string,
    rules: Array<Pick<BreakRule, "minShiftMins" | "maxShiftMins" | "breakMins">>,
  ): Promise<BreakRule[]> {
    await this.ensureSeed();
    await this.clearUserBreakRules(userId);
    const created: BreakRule[] = rules.map((r, i) => ({
      id: newId(),
      userId,
      minShiftMins: r.minShiftMins,
      maxShiftMins: r.maxShiftMins,
      breakMins: r.breakMins,
      orderIndex: i,
    }));
    await this.db.breakRules.bulkPut(created);
    return created;
  }

  async resetBreakRules(userId: string): Promise<void> {
    await this.clearUserBreakRules(userId);
  }

  /** Delete the user's own break rules (leaves the global defaults untouched). */
  private async clearUserBreakRules(userId: string): Promise<void> {
    const own = await this.db.breakRules.where("userId").equals(userId).toArray();
    if (own.length > 0) await this.db.breakRules.bulkDelete(own.map((r) => r.id));
  }

  async listPlacements(userId: string): Promise<Placement[]> {
    return this.db.placements.where("userId").equals(userId).reverse().sortBy("createdAt");
  }

  async createPlacement(input: Omit<Placement, "id" | "createdAt">): Promise<Placement> {
    const placement: Placement = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.placements.put(placement);
    return placement;
  }

  async updatePlacement(
    id: string,
    patch: Partial<Omit<Placement, "id" | "userId">>,
  ): Promise<Placement> {
    const current = await this.db.placements.get(id);
    if (!current) throw new Error(`Placement ${id} not found`);
    const updated: Placement = { ...current, ...patch };
    await this.db.placements.put(updated);
    return updated;
  }

  async deletePlacement(id: string): Promise<void> {
    await this.db.placements.delete(id);
  }

  async listShifts(userId: string): Promise<Shift[]> {
    const rows = await this.db.shifts.where("userId").equals(userId).toArray();
    // Newest shift date first.
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  async getShift(id: string): Promise<Shift | undefined> {
    return this.db.shifts.get(id);
  }

  async createShift(input: Omit<Shift, "id" | "createdAt" | "updatedAt">): Promise<Shift> {
    const ts = nowIso();
    const shift: Shift = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await this.db.shifts.put(shift);
    return shift;
  }

  async updateShift(
    id: string,
    patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>,
  ): Promise<Shift> {
    const current = await this.db.shifts.get(id);
    if (!current) throw new Error(`Shift ${id} not found`);
    const updated: Shift = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.shifts.put(updated);
    return updated;
  }

  async deleteShift(id: string): Promise<void> {
    await this.db.shifts.delete(id);
  }

  async createLogItem(input: LogInput): Promise<LogItem> {
    const item: LogItem = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.logItems.put(item);
    return item;
  }

  async listLogItems(
    userId: string,
    filter?: { entityType?: string; entityId?: string },
  ): Promise<LogItem[]> {
    let rows = await this.db.logItems.where("userId").equals(userId).toArray();
    if (filter?.entityType) rows = rows.filter((r) => r.entityType === filter.entityType);
    if (filter?.entityId) rows = rows.filter((r) => r.entityId === filter.entityId);
    // Newest first.
    return rows.sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
  }

  // ---- Medications ----
  async listMedications(userId: string): Promise<Medication[]> {
    const rows = await this.db.medications.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async getMedication(id: string): Promise<Medication | undefined> {
    return this.db.medications.get(id);
  }

  async createMedication(input: MedicationDraft & { userId: string }): Promise<Medication> {
    const ts = nowIso();
    const med: Medication = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await this.db.medications.put(med);
    return med;
  }

  async updateMedication(id: string, patch: Partial<MedicationDraft>): Promise<Medication> {
    const current = await this.db.medications.get(id);
    if (!current) throw new Error(`Medication ${id} not found`);
    const updated: Medication = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.medications.put(updated);
    return updated;
  }

  async deleteMedication(id: string): Promise<void> {
    await this.db.medications.delete(id);
    const conds = await this.db.medicationConditions.where("medicationId").equals(id).toArray();
    if (conds.length > 0) await this.db.medicationConditions.bulkDelete(conds.map((c) => c.id));
  }

  // ---- Medication conditions ----
  async listMedicationConditions(medicationId: string): Promise<MedicationCondition[]> {
    const rows = await this.db.medicationConditions
      .where("medicationId")
      .equals(medicationId)
      .toArray();
    return rows.sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0));
  }

  async listConditionsForUser(userId: string): Promise<MedicationCondition[]> {
    const medIds = new Set(
      (await this.db.medications.where("userId").equals(userId).primaryKeys()) as string[],
    );
    const all = await this.db.medicationConditions.toArray();
    return all.filter((c) => medIds.has(c.medicationId));
  }

  async addMedicationCondition(
    medicationId: string,
    condition: string,
  ): Promise<MedicationCondition> {
    const row: MedicationCondition = {
      id: newId(),
      medicationId,
      condition: condition.trim(),
      addedAt: nowIso(),
    };
    await this.db.medicationConditions.put(row);
    return row;
  }

  async removeMedicationCondition(id: string): Promise<void> {
    await this.db.medicationConditions.delete(id);
  }

  // ---- Medication log ----
  async listMedicationLogs(userId: string): Promise<MedicationLog[]> {
    const rows = await this.db.medicationLogs.where("userId").equals(userId).toArray();
    // Newest date first, then newest created.
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async listMedicationLogsForShift(shiftId: string): Promise<MedicationLog[]> {
    const rows = await this.db.medicationLogs.where("shiftId").equals(shiftId).toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listMedicationLogsForMedication(medicationId: string): Promise<MedicationLog[]> {
    const rows = await this.db.medicationLogs.where("medicationId").equals(medicationId).toArray();
    // Newest date first, then newest created.
    return rows.sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  async createMedicationLog(
    input: MedicationLogDraft & { userId: string },
  ): Promise<MedicationLog> {
    const log: MedicationLog = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.medicationLogs.put(log);
    return log;
  }

  async deleteMedicationLog(id: string): Promise<void> {
    await this.db.medicationLogs.delete(id);
  }

  // ---- Calc drills ----
  async listCalcDrills(userId: string, filter?: { medicationId?: string }): Promise<CalcDrill[]> {
    let rows = await this.db.calcDrills.where("userId").equals(userId).toArray();
    if (filter?.medicationId) rows = rows.filter((r) => r.medicationId === filter.medicationId);
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async createCalcDrill(input: CalcDrillDraft & { userId: string }): Promise<CalcDrill> {
    const drill: CalcDrill = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.calcDrills.put(drill);
    return drill;
  }

  async updateCalcDrill(id: string, patch: Partial<CalcDrillDraft>): Promise<CalcDrill> {
    const current = await this.db.calcDrills.get(id);
    if (!current) throw new Error(`CalcDrill ${id} not found`);
    const updated: CalcDrill = { ...current, ...patch };
    await this.db.calcDrills.put(updated);
    return updated;
  }

  async deleteCalcDrill(id: string): Promise<void> {
    await this.db.calcDrills.delete(id);
  }

  // ---- Calc stats (bounded per-type aggregate) ----
  async listCalcStats(userId: string): Promise<CalcStat[]> {
    return this.db.calcStats.where("userId").equals(userId).toArray();
  }

  async recordCalcAttempt(userId: string, calcType: CalcType, correct: boolean): Promise<CalcStat> {
    const id = `${userId}:${calcType}`;
    const current = await this.db.calcStats.get(id);
    const next: CalcStat = {
      id,
      userId,
      calcType,
      attempts: (current?.attempts ?? 0) + 1,
      correct: (current?.correct ?? 0) + (correct ? 1 : 0),
      lastAttempted: nowIso(),
    };
    await this.db.calcStats.put(next);
    return next;
  }

  // ---- NMC proficiencies (global seed reference data) ----
  async listProficiencies(): Promise<Proficiency[]> {
    await this.ensureSeed();
    const rows = await this.db.proficiencies.toArray();
    return rows.sort((a, b) => a.orderIndex - b.orderIndex);
  }

  async getProficiency(id: string): Promise<Proficiency | undefined> {
    await this.ensureSeed();
    return this.db.proficiencies.get(id);
  }

  // ---- Proficiency progress + status history ----
  async listProficiencyProgress(userId: string): Promise<ProficiencyProgress[]> {
    return this.db.proficiencyProgress.where("userId").equals(userId).toArray();
  }

  private async findProgress(
    userId: string,
    proficiencyId: string,
  ): Promise<ProficiencyProgress | undefined> {
    return this.db.proficiencyProgress
      .where("[userId+proficiencyId]")
      .equals([userId, proficiencyId])
      .first();
  }

  async getProficiencyProgress(
    userId: string,
    proficiencyId: string,
  ): Promise<ProficiencyProgress | undefined> {
    return this.findProgress(userId, proficiencyId);
  }

  async setProficiencyStatus(
    userId: string,
    proficiencyId: string,
    change: ProficiencyStatusChange,
  ): Promise<ProficiencyProgress> {
    const existing = await this.findProgress(userId, proficiencyId);
    const progress: ProficiencyProgress = {
      id: existing?.id ?? newId(),
      userId,
      proficiencyId,
      status: change.status,
      targetPart: existing?.targetPart,
      updatedAt: nowIso(),
    };
    await this.db.proficiencyProgress.put(progress);
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
    await this.db.proficiencyStatusEvents.put(event);
    return progress;
  }

  async setProficiencyTargetPart(
    userId: string,
    proficiencyId: string,
    targetPart: number | undefined,
  ): Promise<ProficiencyProgress> {
    const existing = await this.findProgress(userId, proficiencyId);
    const progress: ProficiencyProgress = {
      id: existing?.id ?? newId(),
      userId,
      proficiencyId,
      status: existing?.status ?? "NOT_YET_ACHIEVED",
      targetPart,
      updatedAt: nowIso(),
    };
    await this.db.proficiencyProgress.put(progress);
    return progress;
  }

  async listProficiencyStatusEvents(progressId: string): Promise<ProficiencyStatusEvent[]> {
    const rows = await this.db.proficiencyStatusEvents
      .where("progressId")
      .equals(progressId)
      .toArray();
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
    const rows = await this.db.evidenceLinks.where("proficiencyId").equals(proficiencyId).toArray();
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async listEvidenceLinksForUser(userId: string): Promise<EvidenceLink[]> {
    return this.db.evidenceLinks.where("userId").equals(userId).toArray();
  }

  async createEvidenceLink(input: EvidenceLinkDraft & { userId: string }): Promise<EvidenceLink> {
    const link: EvidenceLink = { ...input, id: newId(), createdAt: nowIso() };
    await this.db.evidenceLinks.put(link);
    return link;
  }

  async deleteEvidenceLink(id: string): Promise<void> {
    await this.db.evidenceLinks.delete(id);
  }

  // ---- Clinical skills ----
  async listSkills(userId: string): Promise<Skill[]> {
    await this.ensureSeed();
    // Built-ins (userId null, not indexable) via filter; the user's own via index.
    const builtins = await this.db.skills.filter((s) => s.userId === null).toArray();
    const own = await this.db.skills.where("userId").equals(userId).toArray();
    return [...builtins, ...own].sort(
      (a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name),
    );
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    await this.ensureSeed();
    return this.db.skills.get(id);
  }

  async addCustomSkill(userId: string, input: { name: string; category: string }): Promise<Skill> {
    await this.ensureSeed();
    // Order custom skills after every built-in (which top out well below 1000).
    const ownCount = await this.db.skills.where("userId").equals(userId).count();
    const skill: Skill = {
      id: newId(),
      userId,
      name: input.name.trim(),
      category: input.category.trim() || "Custom skills",
      source: "CUSTOM",
      orderIndex: 1000 + ownCount,
    };
    await this.db.skills.put(skill);
    return skill;
  }

  async deleteCustomSkill(id: string): Promise<void> {
    const skill = await this.db.skills.get(id);
    if (!skill) return;
    if (skill.source !== "CUSTOM") throw new Error("Cannot delete a built-in baseline skill");
    await this.db.skills.delete(id);
    // Drop any progress rows for it (across users in the PoC's single-user world).
    const progress = await this.db.skillProgress.where("skillId").equals(id).toArray();
    if (progress.length > 0) await this.db.skillProgress.bulkDelete(progress.map((p) => p.id));
  }

  async listSkillProgress(userId: string): Promise<SkillProgress[]> {
    return this.db.skillProgress.where("userId").equals(userId).toArray();
  }

  private async findSkillProgress(
    userId: string,
    skillId: string,
  ): Promise<SkillProgress | undefined> {
    return this.db.skillProgress.where("[userId+skillId]").equals([userId, skillId]).first();
  }

  async getSkillProgress(userId: string, skillId: string): Promise<SkillProgress | undefined> {
    return this.findSkillProgress(userId, skillId);
  }

  async setSkillStage(userId: string, skillId: string, stage: SkillStage): Promise<SkillProgress> {
    const existing = await this.findSkillProgress(userId, skillId);
    // Preserve any existing sign-off — changing stage never un-signs-off a skill.
    const next: SkillProgress = {
      id: existing?.id ?? newId(),
      userId,
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
    await this.db.skillProgress.put(next);
    return next;
  }

  async signOffSkill(
    userId: string,
    skillId: string,
    signOff: SkillSignOff,
  ): Promise<SkillProgress> {
    const existing = await this.findSkillProgress(userId, skillId);
    // signedOff only ever goes true here — there is no un-sign-off path (no refresh).
    const next: SkillProgress = {
      id: existing?.id ?? newId(),
      userId,
      skillId,
      stage: existing?.stage ?? "OBSERVED",
      signedOff: true,
      signOffByName: signOff.signOffByName?.trim() || undefined,
      signOffLocation: signOff.signOffLocation?.trim() || undefined,
      signOffDate: signOff.signOffDate || undefined,
      evidenceNote: signOff.evidenceNote?.trim() || undefined,
      shiftId: signOff.shiftId || existing?.shiftId || undefined, // the shift this was signed off in
      updatedAt: nowIso(),
    };
    await this.db.skillProgress.put(next);
    return next;
  }

  // ---- Reflection on practice ----
  async listReflections(userId: string): Promise<Reflection[]> {
    const rows = await this.db.reflections.where("userId").equals(userId).toArray();
    // Newest first by the reflected-on date when set, else creation time.
    const key = (r: Reflection) => r.occurredOn ?? r.createdAt;
    return rows.sort((a, b) => (key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : 0));
  }

  async getReflection(id: string): Promise<Reflection | undefined> {
    return this.db.reflections.get(id);
  }

  async listReflectionSections(reflectionId: string): Promise<ReflectionSection[]> {
    return this.db.reflectionSections.where("reflectionId").equals(reflectionId).toArray();
  }

  async listReflectionSectionsForUser(userId: string): Promise<ReflectionSection[]> {
    const ids = new Set(
      (await this.db.reflections.where("userId").equals(userId).primaryKeys()) as string[],
    );
    const all = await this.db.reflectionSections.toArray();
    return all.filter((s) => ids.has(s.reflectionId));
  }

  async createReflection(
    input: ReflectionDraft & { userId: string },
    sections: ReflectionSectionInput[],
  ): Promise<Reflection> {
    const ts = nowIso();
    const reflection: Reflection = { ...input, id: newId(), createdAt: ts, updatedAt: ts };
    await this.db.reflections.put(reflection);
    await this.writeReflectionSections(reflection.id, sections);
    return reflection;
  }

  async updateReflection(
    id: string,
    patch: Partial<ReflectionDraft>,
    sections?: ReflectionSectionInput[],
  ): Promise<Reflection> {
    const current = await this.db.reflections.get(id);
    if (!current) throw new Error(`Reflection ${id} not found`);
    const updated: Reflection = { ...current, ...patch, updatedAt: nowIso() };
    await this.db.reflections.put(updated);
    if (sections) {
      const existing = await this.db.reflectionSections.where("reflectionId").equals(id).toArray();
      if (existing.length > 0)
        await this.db.reflectionSections.bulkDelete(existing.map((s) => s.id));
      await this.writeReflectionSections(id, sections);
    }
    return updated;
  }

  /** Write a reflection's non-empty stage sections (deterministic ids per stage). */
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
    if (rows.length > 0) await this.db.reflectionSections.bulkPut(rows);
  }

  async deleteReflection(id: string): Promise<void> {
    await this.db.reflections.delete(id);
    const sections = await this.db.reflectionSections.where("reflectionId").equals(id).toArray();
    if (sections.length > 0) await this.db.reflectionSections.bulkDelete(sections.map((s) => s.id));
    const tagLinks = await this.db.reflectionTags.where("reflectionId").equals(id).toArray();
    if (tagLinks.length > 0) await this.db.reflectionTags.bulkDelete(tagLinks.map((t) => t.id));
    // A reflection may be attached to proficiencies as REFLECTION evidence — drop those.
    const evLinks = await this.db.evidenceLinks
      .where("[evidenceType+evidenceId]")
      .equals(["REFLECTION", id])
      .toArray();
    if (evLinks.length > 0) await this.db.evidenceLinks.bulkDelete(evLinks.map((l) => l.id));
  }

  // ---- Tags (reflection labels) ----
  async listTags(userId: string): Promise<Tag[]> {
    const rows = await this.db.tags.where("userId").equals(userId).toArray();
    return rows.sort((a, b) => a.label.localeCompare(b.label));
  }

  async listReflectionTags(userId: string): Promise<ReflectionTag[]> {
    const ids = new Set(
      (await this.db.reflections.where("userId").equals(userId).primaryKeys()) as string[],
    );
    const all = await this.db.reflectionTags.toArray();
    return all.filter((t) => ids.has(t.reflectionId));
  }

  async setReflectionTags(userId: string, reflectionId: string, labels: string[]): Promise<Tag[]> {
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
    // Upsert each tag by (userId,label), reusing an existing row where present.
    const existingTags = await this.db.tags.where("userId").equals(userId).toArray();
    const byLabel = new Map(existingTags.map((t) => [t.label.toLowerCase(), t]));
    const resolved: Tag[] = [];
    for (const label of clean) {
      const found = byLabel.get(label.toLowerCase());
      if (found) {
        resolved.push(found);
      } else {
        const tag: Tag = { id: newId(), userId, label };
        await this.db.tags.put(tag);
        byLabel.set(label.toLowerCase(), tag);
        resolved.push(tag);
      }
    }
    // Rewrite this reflection's join rows.
    const old = await this.db.reflectionTags.where("reflectionId").equals(reflectionId).toArray();
    if (old.length > 0) await this.db.reflectionTags.bulkDelete(old.map((r) => r.id));
    const links: ReflectionTag[] = resolved.map((t) => ({
      id: `${reflectionId}:${t.id}`,
      reflectionId,
      tagId: t.id,
    }));
    if (links.length > 0) await this.db.reflectionTags.bulkPut(links);
    return resolved;
  }
}
