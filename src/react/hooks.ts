import { useCallback, useEffect, useMemo, useState } from "react";
import type { BreakRule, Placement, Shift } from "../domain/types";
import {
  projectCompletion,
  summariseHours,
  type HoursSummary,
  type Projection,
} from "../logic/hours";
import { useRepository } from "./RepositoryContext";

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

export function useShifts() {
  const { repo, user } = useRepository();
  const [shifts, setShifts] = useState<Shift[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setShifts(await repo.listShifts(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary: HoursSummary = useMemo(() => summariseHours(shifts), [shifts]);
  const today = new Date().toISOString().slice(0, 10);
  const projection: Projection = useMemo(() => projectCompletion(shifts, today), [shifts, today]);

  return { shifts, summary, projection, reload };
}
