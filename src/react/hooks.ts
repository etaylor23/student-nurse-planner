import { useCallback, useEffect, useMemo, useState } from "react";
import type { BreakRule, Placement, Shift } from "../domain/types";
import { summariseHours, type HoursSummary } from "../logic/hours";
import { useRepository } from "./RepositoryContext";

export function useBreakRules(): BreakRule[] {
  const { repo, user } = useRepository();
  const [rules, setRules] = useState<BreakRule[]>([]);
  useEffect(() => {
    if (!user) return;
    repo.getBreakRules(user.id).then(setRules);
  }, [repo, user]);
  return rules;
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

  return { shifts, summary, reload };
}
