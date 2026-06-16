import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Shift, ShiftDraft } from "../domain/types";
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

/**
 * The shift mutations shared by every view, so create/update/delete/complete
 * (and the duplicate-shift guard) behave identically and can't drift between the
 * hours log and the planner. Each returns whether it went ahead (false if the
 * user cancelled a prompt), so callers can decide whether to close their form.
 */
export function useShiftActions() {
  const { repo, user } = useRepository();
  const { shifts, reload } = useShifts();

  const saveShift = async (draft: ShiftDraft, editingId: string | null): Promise<boolean> => {
    const duplicate = shifts.some(
      (s) =>
        s.id !== editingId &&
        s.date === draft.date &&
        (s.placementId ?? "") === (draft.placementId ?? ""),
    );
    if (
      duplicate &&
      !window.confirm("You already logged a shift on this date at this placement. Add it anyway?")
    ) {
      return false;
    }
    if (editingId) await repo.updateShift(editingId, draft);
    else if (user) await repo.createShift({ ...draft, userId: user.id });
    await reload();
    return true;
  };

  const deleteShift = async (shift: Shift): Promise<boolean> => {
    if (!window.confirm(`Delete the ${shift.date} shift? This can't be undone.`)) return false;
    await repo.deleteShift(shift.id);
    await reload();
    return true;
  };

  const markWorked = async (id: string): Promise<boolean> => {
    const name = window.prompt("Name the registered nurse you worked with:")?.trim();
    if (!name) return false;
    await repo.updateShift(id, { status: "COMPLETED", supervisingRnName: name });
    await reload();
    return true;
  };

  return { saveShift, deleteShift, markWorked };
}
