import { useCallback, useEffect, useState } from "react";
import type {
  BreakRule,
  CalcDrill,
  Medication,
  MedicationCondition,
  MedicationLog,
  Placement,
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

/** One medication with its conditions + calc drills (the detail view). */
export function useMedication(id: string | undefined) {
  const { repo, user } = useRepository();
  const [medication, setMedication] = useState<Medication | undefined>();
  const [conditions, setConditions] = useState<MedicationCondition[]>([]);
  const [drills, setDrills] = useState<CalcDrill[]>([]);

  const reload = useCallback(async () => {
    if (!user || !id) {
      setMedication(undefined);
      setConditions([]);
      setDrills([]);
      return;
    }
    const [med, conds, ds] = await Promise.all([
      repo.getMedication(id),
      repo.listMedicationConditions(id),
      repo.listCalcDrills(user.id, { medicationId: id }),
    ]);
    setMedication(med);
    setConditions(conds);
    setDrills(ds);
  }, [repo, user, id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { medication, conditions, drills, reload };
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
