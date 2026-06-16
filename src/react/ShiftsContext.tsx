import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Shift } from "../domain/types";
import {
  projectCompletion,
  summariseHours,
  type HoursSummary,
  type Projection,
} from "../logic/hours";
import { useRepository } from "./RepositoryContext";

interface ShiftsContextValue {
  shifts: Shift[];
  summary: HoursSummary;
  projection: Projection;
  reload: () => Promise<void>;
}

const ShiftsContext = createContext<ShiftsContextValue | null>(null);

/**
 * Single in-memory source of truth for shifts, shared by every view (the hours
 * log and the planner). A mutation + reload from one view is reflected in all of
 * them — and there's only one fetch, not one per page.
 */
export function ShiftsProvider({ children }: { children: ReactNode }) {
  const { repo, user } = useRepository();
  const [shifts, setShifts] = useState<Shift[]>([]);

  const reload = useCallback(async () => {
    if (!user) return;
    setShifts(await repo.listShifts(user.id));
  }, [repo, user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = useMemo(() => summariseHours(shifts), [shifts]);
  const today = new Date().toISOString().slice(0, 10);
  const projection = useMemo(() => projectCompletion(shifts, today), [shifts, today]);

  const value = useMemo(
    () => ({ shifts, summary, projection, reload }),
    [shifts, summary, projection, reload],
  );

  return <ShiftsContext.Provider value={value}>{children}</ShiftsContext.Provider>;
}

export function useShifts(): ShiftsContextValue {
  const ctx = useContext(ShiftsContext);
  if (!ctx) throw new Error("useShifts must be used within a ShiftsProvider");
  return ctx;
}
