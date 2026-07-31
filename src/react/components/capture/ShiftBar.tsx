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
    // One surface for both states. A full coral panel for the fallback made the quietest
    // decision on the screen the loudest thing on it, and coral is meant to be sparing — so
    // the caution rides on a small label instead, which still keeps a guess distinguishable
    // from a match (P9) without shouting.
    <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-primary-800">Shift</h4>

      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-700">
        {selected ? formatShiftLabel(selected.shift) : "Not attached to a shift"}
        {resolution.isFallback && (
          <span className="rounded-full bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-700">
            worth a check
          </span>
        )}
      </p>

      {/* Never let a recency guess read as a date match (P9). */}
      <p className="mt-0.5 text-xs text-slate-500">
        {resolution.isFallback
          ? "No date on the page we could match — this is just your most recent shift."
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
                  <span className="ml-2 text-primary-700">matches the page</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
