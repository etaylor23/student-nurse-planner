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
import { newId } from "../domain/ids";
import { formatHumanDate } from "../logic/calendar";
import { diffShift } from "../logic/shiftDiff";
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

  // A shift's human label at action time, e.g. "Ward 7 · Thu 18 Jun". Stored on the
  // LogItem so the activity feed can identify the shift even after its date changes
  // or it's deleted.
  const placeMap = async (): Promise<Map<string, string>> => {
    if (!user) return new Map();
    return new Map((await repo.listPlacements(user.id)).map((p) => [p.id, p.name]));
  };
  const shiftLabel = (s: Shift, names: Map<string, string>): string => {
    const date = formatHumanDate(s.date);
    const name = s.placementId ? names.get(s.placementId) : undefined;
    return name ? `${name} · ${date}` : date;
  };

  // Append a shift audit entry (no-op if there's no user yet).
  const log = async (
    entityId: string,
    action: string,
    summary: string,
    opts?: { entityLabel?: string; batchId?: string },
  ) => {
    if (!user) return;
    await repo.createLogItem({
      userId: user.id,
      entityType: "SHIFT",
      entityId,
      entityLabel: opts?.entityLabel,
      action,
      summary,
      batchId: opts?.batchId,
    });
  };

  // The single place that records WHAT changed on an edit: one LogItem per field,
  // "{field}: {before} → {after}", all sharing a batchId so they group as one save.
  // Used by every edit path (form save in either view, and the planner's
  // drag/resize), so the trail can't diverge.
  const logFieldChanges = async (before: Shift, after: Shift) => {
    if (!user) return;
    const names = await placeMap();
    const changes = diffShift(before, after, names);
    if (changes.length === 0) return;
    const entityLabel = shiftLabel(after, names);
    const batchId = newId();
    for (const c of changes) {
      await log(after.id, "SHIFT_UPDATED", `${c.label}: ${c.from} → ${c.to}`, {
        entityLabel,
        batchId,
      });
    }
  };

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
    const before = editingId ? shifts.find((s) => s.id === editingId) : undefined;
    let saved: Shift | undefined;
    if (editingId) saved = await repo.updateShift(editingId, draft);
    else if (user) saved = await repo.createShift({ ...draft, userId: user.id });
    if (saved) {
      if (saved.status === "COMPLETED" && before?.status !== "COMPLETED") {
        const names = await placeMap();
        const rn = saved.supervisingRnName ? ` (with ${saved.supervisingRnName})` : "";
        await log(saved.id, "SHIFT_COMPLETED", `Marked as worked${rn}`, {
          entityLabel: shiftLabel(saved, names),
        });
      } else if (editingId && before) {
        await logFieldChanges(before, saved); // one entry per changed field
      } else if (!editingId) {
        const names = await placeMap();
        await log(saved.id, "SHIFT_CREATED", "Logged the shift", {
          entityLabel: shiftLabel(saved, names),
        });
      }
    }
    await reload();
    return true;
  };

  const deleteShift = async (shift: Shift): Promise<boolean> => {
    if (!window.confirm(`Delete the ${shift.date} shift? This can't be undone.`)) return false;
    const names = await placeMap();
    await repo.deleteShift(shift.id);
    await log(shift.id, "SHIFT_DELETED", "Deleted the shift", {
      entityLabel: shiftLabel(shift, names),
    });
    await reload();
    return true;
  };

  const markWorked = async (id: string): Promise<boolean> => {
    const name = window.prompt("Name the registered nurse you worked with:")?.trim();
    if (!name) return false;
    const saved = await repo.updateShift(id, { status: "COMPLETED", supervisingRnName: name });
    const names = await placeMap();
    await log(saved.id, "SHIFT_COMPLETED", `Marked as worked (with ${name})`, {
      entityLabel: shiftLabel(saved, names),
    });
    await reload();
    return true;
  };

  // Unlock a completed shift for editing: COMPLETED -> PLANNED, keeping the RN
  // name and hours so re-completing is one click. Logged as a reactivation.
  const reactivateShift = async (shift: Shift): Promise<boolean> => {
    if (shift.status !== "COMPLETED") return false;
    if (
      !window.confirm(
        "Unlock this shift for editing? It won't count toward your hours until you mark it worked again.",
      )
    ) {
      return false;
    }
    const saved = await repo.updateShift(shift.id, { status: "PLANNED" });
    const names = await placeMap();
    await log(saved.id, "SHIFT_REACTIVATED", "Reactivated the shift", {
      entityLabel: shiftLabel(saved, names),
    });
    await reload();
    return true;
  };

  // Apply a direct field patch (the planner's drag-move / resize) and log the
  // field-level diff — the same central trail as a form save.
  const editShift = async (
    before: Shift,
    patch: Partial<Omit<Shift, "id" | "userId" | "createdAt">>,
  ): Promise<void> => {
    const saved = await repo.updateShift(before.id, patch);
    await logFieldChanges(before, saved);
    await reload();
  };

  // Duplicate a shift at the same time (to then drag elsewhere). The copy is always
  // PLANNED with no RN — it hasn't been worked — so it never double-counts hours.
  const copyShift = async (shift: Shift): Promise<boolean> => {
    if (!user) return false;
    const draft: ShiftDraft = {
      date: shift.date,
      placementId: shift.placementId,
      startAt: shift.startAt,
      endAt: shift.endAt,
      shiftType: shift.shiftType,
      entryMode: shift.entryMode,
      rawDurationMins: shift.rawDurationMins,
      breakMins: shift.breakMins,
      netHours: shift.netHours,
      isSimulated: shift.isSimulated,
      status: "PLANNED",
      supervisingRnName: undefined,
      notes: shift.notes,
    };
    const saved = await repo.createShift({ ...draft, userId: user.id });
    const names = await placeMap();
    await log(saved.id, "SHIFT_CREATED", "Copied the shift", {
      entityLabel: shiftLabel(saved, names),
    });
    await reload();
    return true;
  };

  return { saveShift, deleteShift, markWorked, reactivateShift, editShift, copyShift };
}
