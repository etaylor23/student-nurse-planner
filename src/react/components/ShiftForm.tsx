import React, { useEffect, useMemo, useState } from "react";
import {
  SHIFT_TYPE_LABEL,
  type Placement,
  type Shift,
  type ShiftDraft,
  type ShiftType,
} from "../../domain/types";
import { computeNetHours } from "../../logic/hours";
import { resolveBreakMins } from "../../logic/breakRules";
import { composeShiftTimes, formatHumanDate, hhmm, isoAddDays } from "../../logic/calendar";
import { useBreakRules } from "../hooks";
import { btnGhost, btnPrimary, inputCls } from "./ui";

export type { ShiftDraft };

const SHIFT_TYPES: ShiftType[] = ["EARLY", "LATE", "NIGHT", "LONG_DAY", "OTHER"];

const todayIso = () => new Date().toISOString().slice(0, 10);

/** Minutes between two "HH:MM" times; rolls past midnight for night shifts. */
function durationFromTimes(start: string, end: string): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // crossed midnight
  return mins;
}

function field(label: string, control: React.ReactNode, hint?: string) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {control}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function ShiftForm({
  placements,
  initial,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialPlacementId,
  locked = false,
  onDraftChange,
  onDirtyChange,
  onSubmit,
  onCancel,
  onUnlock,
}: {
  placements: Placement[];
  initial?: Shift;
  /** Defaults for a NEW shift (used only when `initial` is absent). */
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialPlacementId?: string;
  /** A completed shift is read-only until unlocked: all fields disabled, no save. */
  locked?: boolean;
  /** Fires as date/start/end change so a live calendar draft can follow along. */
  onDraftChange?: (d: { date: string; startTime?: string; endTime?: string }) => void;
  /** Reports unsaved-edit state so the host can guard close/tab-switch (true once edited). */
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (draft: ShiftDraft) => void | Promise<void>;
  onCancel?: () => void;
  /** Shown when `locked`: reactivate the shift so it can be edited again. */
  onUnlock?: () => void;
}) {
  const { rules } = useBreakRules();
  const [dirty, setDirty] = useState(false);

  const [date, setDate] = useState(initial?.date ?? initialDate ?? todayIso());
  const [placementId, setPlacementId] = useState(initial?.placementId ?? initialPlacementId ?? "");
  const [startTime, setStartTime] = useState(
    initial?.startAt ? hhmm(new Date(initial.startAt)) : (initialStartTime ?? ""),
  );
  const [endTime, setEndTime] = useState(
    initial?.endAt ? hhmm(new Date(initial.endAt)) : (initialEndTime ?? ""),
  );
  const [shiftType, setShiftType] = useState<ShiftType>(initial?.shiftType ?? "LONG_DAY");
  const [entryMode, setEntryMode] = useState<"NET" | "RAW">(initial?.entryMode ?? "RAW");
  const [grossHours, setGrossHours] = useState(
    initial?.rawDurationMins ? String(initial.rawDurationMins / 60) : "12.5",
  );
  const [netHoursEntered, setNetHoursEntered] = useState(
    initial && initial.entryMode === "NET" ? String(initial.netHours) : "",
  );
  const [breakOverride, setBreakOverride] = useState(
    initial?.entryMode === "RAW" && initial.breakMins !== undefined
      ? String(initial.breakMins)
      : "",
  );
  const [isSimulated, setIsSimulated] = useState(initial?.isSimulated ?? false);
  const [completed, setCompleted] = useState(initial?.status === "COMPLETED");
  const [rnName, setRnName] = useState(initial?.supervisingRnName ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  // Keep the calendar draft highlight in sync with the date/time fields.
  useEffect(() => {
    onDraftChange?.({ date, startTime: startTime || undefined, endTime: endTime || undefined });
  }, [date, startTime, endTime, onDraftChange]);

  // Report dirtiness to the host (shift modal) so it can confirm before discarding on
  // close or tab-switch. Reset to "clean" when this form leaves the tab / modal unmounts.
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const derivedMins = durationFromTimes(startTime, endTime);
  // Absolute UTC start/end timestamps for storage.
  const composedTimes = composeShiftTimes(date, startTime || undefined, endTime || undefined);
  // The end rolls onto the next day exactly when the end clock time is at/before
  // the start (matches composeShiftTimes), so the notice doesn't need UTC parsing.
  const endsNextDay = !!startTime && !!endTime && endTime <= startTime;
  const rawMins = derivedMins ?? Math.round((parseFloat(grossHours) || 0) * 60);
  const resolvedBreak = useMemo(() => resolveBreakMins(rawMins, rules), [rawMins, rules]);
  const breakOverrideNum = breakOverride === "" ? undefined : parseInt(breakOverride, 10);

  const preview = useMemo(
    () =>
      computeNetHours(
        {
          entryMode,
          netHoursEntered: parseFloat(netHoursEntered) || 0,
          rawDurationMins: rawMins,
          breakMinsOverride: breakOverrideNum,
        },
        rules,
      ),
    [entryMode, netHoursEntered, rawMins, breakOverrideNum, rules],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (completed && rnName.trim() === "") {
      setError("Name the registered nurse you worked with to mark this shift complete.");
      return;
    }
    if (preview.netHours <= 0) {
      setError("Enter shift hours greater than zero.");
      return;
    }
    if (preview.netHours > 24) {
      setError("That's more than 24 hours — double-check the shift length.");
      return;
    }
    const draft: ShiftDraft = {
      date,
      placementId: placementId || undefined,
      startAt: entryMode === "RAW" && derivedMins != null ? composedTimes.startAt : undefined,
      endAt: entryMode === "RAW" && derivedMins != null ? composedTimes.endAt : undefined,
      shiftType,
      entryMode,
      rawDurationMins: entryMode === "RAW" ? rawMins : undefined,
      breakMins: entryMode === "RAW" ? preview.breakMins : undefined,
      netHours: preview.netHours,
      isSimulated,
      status: completed ? "COMPLETED" : "PLANNED",
      supervisingRnName: completed ? rnName.trim() : undefined,
      notes: notes.trim() || undefined,
    };
    await onSubmit(draft);
    setDirty(false); // saved — current values match what's stored
  };

  return (
    <form onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
      <fieldset
        disabled={locked}
        className={"m-0 min-w-0 space-y-4 border-0 p-0" + (locked ? " opacity-70" : "")}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field(
            "Start date",
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />,
          )}
          {field(
            "Placement",
            <select
              value={placementId}
              onChange={(e) => setPlacementId(e.target.value)}
              className={inputCls}
            >
              <option value="">No placement</option>
              {placements.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>,
          )}
          {field(
            "Shift type",
            <select
              value={shiftType}
              onChange={(e) => setShiftType(e.target.value as ShiftType)}
              className={inputCls}
            >
              {SHIFT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SHIFT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>,
          )}
          {field(
            "How are you logging this?",
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {(["RAW", "NET"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setEntryMode(mode);
                    setDirty(true);
                  }}
                  className={
                    "rounded-lg px-3 py-2 text-sm font-medium transition " +
                    (entryMode === mode
                      ? "bg-white text-emerald-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {mode === "RAW" ? "Whole shift" : "Counted hours"}
                </button>
              ))}
            </div>,
            entryMode === "RAW"
              ? "We'll take the break off for you."
              : "Hours that already exclude breaks.",
          )}
        </div>

        {entryMode === "RAW" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field(
                "Start time",
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={inputCls}
                />,
                "Optional — fills in the length for you.",
              )}
              {field(
                "End time",
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={inputCls}
                />,
              )}
            </div>
            {endsNextDay && (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
                Overnight — finishes {formatHumanDate(isoAddDays(date, 1))}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field(
                "Shift length (hours)",
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={
                    derivedMins != null
                      ? String(Math.round((derivedMins / 60) * 100) / 100)
                      : grossHours
                  }
                  onChange={(e) => setGrossHours(e.target.value)}
                  disabled={derivedMins != null}
                  className={
                    derivedMins != null ? `${inputCls} bg-slate-50 text-slate-500` : inputCls
                  }
                />,
                derivedMins != null
                  ? `Worked out from ${startTime}–${endTime}.`
                  : "Clock-in to clock-out, before breaks.",
              )}
              {field(
                "Break (minutes)",
                <input
                  type="number"
                  min="0"
                  step="5"
                  placeholder={`${resolvedBreak} (auto)`}
                  value={breakOverride}
                  onChange={(e) => setBreakOverride(e.target.value)}
                  className={inputCls}
                />,
                `Auto for this length: ${resolvedBreak} min. Leave blank to use it.`,
              )}
            </div>
          </div>
        ) : (
          field(
            "Counted hours",
            <input
              type="number"
              min="0"
              step="0.25"
              value={netHoursEntered}
              onChange={(e) => setNetHoursEntered(e.target.value)}
              className={inputCls}
            />,
            "Time that counts toward the 2,300 total.",
          )
        )}

        <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-100">
          Counts as <span className="font-semibold tabular-nums">{preview.netHours} h</span>
          {entryMode === "RAW" && <> after a {preview.breakMins}-min break</>}.
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isSimulated}
              onChange={(e) => setIsSimulated(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            Simulated practice
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={completed}
              onChange={(e) => setCompleted(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500/30"
            />
            I've worked this shift
          </label>
        </div>

        {completed &&
          field(
            "Nurse you worked with",
            <input
              type="text"
              value={rnName}
              onChange={(e) => setRnName(e.target.value)}
              className={inputCls}
              placeholder="Full name"
            />,
            "Required to count these hours.",
          )}

        {field(
          "Notes",
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className={inputCls}
          />,
        )}
      </fieldset>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-100">
          {error}
        </p>
      )}

      {locked ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 ring-1 ring-amber-100">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            <span>
              This shift is locked because it counts toward your hours. Unlock it to edit, move or
              delete it.
            </span>
          </div>
          <div className="flex gap-2">
            {onUnlock && (
              <button type="button" onClick={onUnlock} className={btnPrimary}>
                Unlock to edit
              </button>
            )}
            {onCancel && (
              <button type="button" onClick={onCancel} className={btnGhost}>
                Close
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="submit" className={btnPrimary}>
            {initial ? "Save shift" : "Add shift"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className={btnGhost}>
              Cancel
            </button>
          )}
        </div>
      )}
    </form>
  );
}
