import { useCallback, useEffect, useState } from "react";
import type {
  BreakRule,
  CalcDrill,
  CalcStat,
  EvidenceLink,
  Medication,
  MedicationCondition,
  MedicationLog,
  Placement,
  Proficiency,
  ProficiencyProgress,
  ProficiencyStatusEvent,
  Reflection,
  ReflectionSection,
  ReflectionTag,
  Skill,
  SkillProgress,
  Tag,
} from "../domain/types";
import { useRepository } from "./RepositoryContext";

// Shifts now live in a shared provider; re-exported here so existing imports keep working.
export { useShifts, ShiftsProvider } from "./ShiftsContext";

export function useBreakRules(): { rules: BreakRule[]; reload: () => Promise<void> } {
  const { repo, user } = useRepository();
  const [rules, setRules] = useState<BreakRule[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setRules(await repo.getBreakRules(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { rules, reload };
}

export function usePlacements() {
  const { repo, user } = useRepository();
  const [placements, setPlacements] = useState<Placement[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setPlacements(await repo.listPlacements(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { placements, reload };
}

/** All medications + every condition across them (for the list + filters). */
export function useMedications() {
  const { repo, user } = useRepository();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [conditions, setConditions] = useState<MedicationCondition[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    const [meds, conds] = await Promise.all([
      repo.listMedications(user.id),
      repo.listConditionsForUser(user.id),
    ]);
    setMedications(meds);
    setConditions(conds);
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { medications, conditions, reload };
}

/** One medication with its conditions, calc drills + its log entries (detail view). */
export function useMedication(id: string | undefined) {
  const { repo, user } = useRepository();
  const [medication, setMedication] = useState<Medication | undefined>();
  const [conditions, setConditions] = useState<MedicationCondition[]>([]);
  const [drills, setDrills] = useState<CalcDrill[]>([]);
  const [logs, setLogs] = useState<MedicationLog[]>([]);

  const reload = useCallback(async () => {
    if (!user || !id) {
      setMedication(undefined);
      setConditions([]);
      setDrills([]);
      setLogs([]);
      return;
    }
    const [med, conds, ds, ls] = await Promise.all([
      repo.getMedication(id),
      repo.listMedicationConditions(id),
      repo.listCalcDrills(user.id, { medicationId: id }),
      repo.listMedicationLogsForMedication(id),
    ]);
    setMedication(med);
    setConditions(conds);
    setDrills(ds);
    setLogs(ls);
  }, [repo, user, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { medication, conditions, drills, logs, reload };
}

/** Bounded per-type numeracy accuracy aggregate (drives the practice stats panel). */
export function useCalcStats() {
  const { repo, user } = useRepository();
  const [stats, setStats] = useState<CalcStat[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setStats(await repo.listCalcStats(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { stats, reload };
}

export function useMedicationLogs() {
  const { repo, user } = useRepository();
  const [logs, setLogs] = useState<MedicationLog[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setLogs(await repo.listMedicationLogs(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { logs, reload };
}

/** The national proficiency list + the user's progress and evidence links. */
export function useProficiencies() {
  const { repo, user } = useRepository();
  const [proficiencies, setProficiencies] = useState<Proficiency[]>([]);
  const [progress, setProgress] = useState<ProficiencyProgress[]>([]);
  const [evidenceLinks, setEvidenceLinks] = useState<EvidenceLink[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    const [profs, prog, links] = await Promise.all([
      repo.listProficiencies(),
      repo.listProficiencyProgress(user.id),
      repo.listEvidenceLinksForUser(user.id),
    ]);
    setProficiencies(profs);
    setProgress(prog);
    setEvidenceLinks(links);
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { proficiencies, progress, evidenceLinks, reload };
}

/** One proficiency with its progress, dated status history and evidence links. */
export function useProficiency(id: string | undefined) {
  const { repo, user } = useRepository();
  const [proficiency, setProficiency] = useState<Proficiency | undefined>();
  const [progress, setProgress] = useState<ProficiencyProgress | undefined>();
  const [events, setEvents] = useState<ProficiencyStatusEvent[]>([]);
  const [links, setLinks] = useState<EvidenceLink[]>([]);

  const reload = useCallback(async () => {
    if (!user || !id) {
      setProficiency(undefined);
      setProgress(undefined);
      setEvents([]);
      setLinks([]);
      return;
    }
    const prof = await repo.getProficiency(id);
    const prog = await repo.getProficiencyProgress(user.id, id);
    const [evts, lks] = await Promise.all([
      prog ? repo.listProficiencyStatusEvents(prog.id) : Promise.resolve([]),
      repo.listEvidenceLinks(id),
    ]);
    setProficiency(prof);
    setProgress(prog);
    setEvents(evts);
    setLinks(lks);
  }, [repo, user, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { proficiency, progress, events, links, reload };
}

/** All clinical skills (Annexe B baseline + custom) and the user's progress. */
export function useSkills() {
  const { repo, user } = useRepository();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [progress, setProgress] = useState<SkillProgress[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    const [sk, pr] = await Promise.all([repo.listSkills(user.id), repo.listSkillProgress(user.id)]);
    setSkills(sk);
    setProgress(pr);
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { skills, progress, reload };
}

/**
 * All the user's reflections plus every stage section, tag and reflection↔tag link —
 * enough for the list to search content, show tag filters and completeness without
 * per-row fetches.
 */
export function useReflections() {
  const { repo, user } = useRepository();
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [sections, setSections] = useState<ReflectionSection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [reflectionTags, setReflectionTags] = useState<ReflectionTag[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    const [r, s, t, rt] = await Promise.all([
      repo.listReflections(user.id),
      repo.listReflectionSectionsForUser(user.id),
      repo.listTags(user.id),
      repo.listReflectionTags(user.id),
    ]);
    setReflections(r);
    setSections(s);
    setTags(t);
    setReflectionTags(rt);
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { reflections, sections, tags, reflectionTags, reload };
}

/** One reflection with its Gibbs sections and its own tags (detail/edit view). */
export function useReflection(id: string | undefined) {
  const { repo, user } = useRepository();
  const [reflection, setReflection] = useState<Reflection | undefined>();
  const [sections, setSections] = useState<ReflectionSection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  const reload = useCallback(async () => {
    if (!user || !id) {
      setReflection(undefined);
      setSections([]);
      setTags([]);
      return;
    }
    const [r, secs, allTags, links] = await Promise.all([
      repo.getReflection(id),
      repo.listReflectionSections(id),
      repo.listTags(user.id),
      repo.listReflectionTags(user.id),
    ]);
    const tagIds = new Set(links.filter((l) => l.reflectionId === id).map((l) => l.tagId));
    setReflection(r);
    setSections(secs);
    setTags(allTags.filter((t) => tagIds.has(t.id)));
  }, [repo, user, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { reflection, sections, tags, reload };
}

/** One skill with the user's progress against it (detail view). */
export function useSkill(id: string | undefined) {
  const { repo, user } = useRepository();
  const [skill, setSkill] = useState<Skill | undefined>();
  const [progress, setProgress] = useState<SkillProgress | undefined>();

  const reload = useCallback(async () => {
    if (!user || !id) {
      setSkill(undefined);
      setProgress(undefined);
      return;
    }
    const [sk, pr] = await Promise.all([repo.getSkill(id), repo.getSkillProgress(user.id, id)]);
    setSkill(sk);
    setProgress(pr);
  }, [repo, user, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { skill, progress, reload };
}
