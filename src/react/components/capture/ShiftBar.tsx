import { useState } from "react";
import { formatShiftLabel } from "../../../logic/captureShift";
import type { ShiftResolution } from "../../../logic/captureShift";

/**
 * Which shift this page belongs to (spec-note-capture.md P9).
 *
 * One recommendation, pre-selected, with the alternates one tap away — and a fallback stated
 * PLAINLY rather than dressed up as a match. That distinction is the point: the model invented
 * a year once already, so when the app is guessing from recency rather than from a date on the
 * page, the student needs to know that before their notes get attached to it.
 */
export function ShiftBar({
  resolution,
  selectedShiftId,
  onSelect,
}: {
  resolution: ShiftResolution;
  selectedShiftId?: string;
  onSelect: (shiftId: string | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = resolution.candidates.find((c) => c.shift.id === selectedShiftId);

  if (resolution.candidates.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shift</h4>
        <p className="mt-1 text-sm text-slate-600">
          You have no shifts logged yet, so these notes aren&apos;t attached to one.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 ${
        resolution.isFallback ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50"
      }`}
    >
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shift</h4>

      <p className="mt-1 text-sm text-slate-700">
        {selected ? formatShiftLabel(selected.shift) : "Not attached to a shift"}
      </p>

      {/* Never let a recency guess read as a date match (P9). */}
      <p className="mt-0.5 text-xs text-slate-500">
        {resolution.isFallback
          ? "No date on the page we could match — this is just your most recent shift, so check it."
          : "Matched to the date written on the page."}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-xs font-medium text-secondary-700 hover:underline"
        >
          {open ? "Hide other shifts" : "Choose a different shift"}
        </button>
        {selectedShiftId && (
          <button
            type="button"
            onClick={() => onSelect(undefined)}
            className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
          >
            Don&apos;t attach to a shift
          </button>
        )}
      </div>

      {open && (
        <ul className="mt-2 space-y-1">
          {resolution.candidates.map((c) => (
            <li key={c.shift.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(c.shift.id);
                  setOpen(false);
                }}
                className={`w-full rounded-lg border px-2 py-1 text-left text-xs ${
                  c.shift.id === selectedShiftId
                    ? "border-secondary-300 bg-white font-medium text-secondary-800"
                    : "border-slate-200 bg-white text-slate-700 hover:border-secondary-200"
                }`}
              >
                {formatShiftLabel(c.shift)}
                {c.confidence === "DATE_MATCH" && (
                  <span className="ml-2 text-secondary-600">matches the page</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
