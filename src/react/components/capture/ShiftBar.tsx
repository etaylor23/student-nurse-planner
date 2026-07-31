import { ChevronDown } from "lucide-react";
import { formatShiftLabel } from "../../../logic/captureShift";
import type { ShiftResolution } from "../../../logic/captureShift";
import { MetaChip } from "./MetaChip";
import { WorthACheck } from "./WorthACheck";

/**
 * Which shift this page belongs to (spec-note-capture.md P9).
 *
 * One recommendation, pre-selected, with the alternates one tap away — and a fallback stated
 * PLAINLY rather than dressed up as a match. That distinction is the point: the model invented
 * a year once already, so when the app is guessing from recency rather than from a date on the
 * page, the student needs to know that before their notes get attached to it.
 *
 * **A chip in the meta strip, not a panel above the notes.** The decision itself is unchanged —
 * same resolution, same candidates, same fallback sentence — but it used to arrive as a
 * full-width block the student read before they had seen a single note, competing with the two
 * other banners for the top of the screen. It is the quietest decision on the page and it now
 * takes the space of one: the chip states the answer, the panel holds the reasoning and the
 * alternates. Coral still rides on a small label rather than filling a surface.
 */
export function ShiftChip({
  resolution,
  selectedShiftId,
  onSelect,
  pageDateRaw,
  open,
  onToggle,
}: {
  resolution: ShiftResolution;
  selectedShiftId?: string;
  onSelect: (shiftId: string | undefined) => void;
  /** The date the model READ off the page, shown exactly as written — never normalised (P8). */
  pageDateRaw?: string | null;
  open: boolean;
  onToggle: () => void;
}) {
  const selected = resolution.candidates.find((c) => c.shift.id === selectedShiftId);

  if (resolution.candidates.length === 0) {
    return (
      <p className="ml-auto text-[11px] text-slate-400">
        You have no shifts logged yet, so these notes aren&apos;t attached to one.
      </p>
    );
  }

  return (
    <>
      {/* `ml-auto` lives on the caption, not the chip: the two travel together to the right of
          the strip, and the chip's panel still has to be a direct flex child so it can open as
          a full-width line underneath rather than a popover over the notes. */}
      <span className="ml-auto text-[11px] text-slate-400">
        {pageDateRaw ? <>Dated &ldquo;{pageDateRaw}&rdquo; · belongs to</> : "This page belongs to"}
      </span>
      <MetaChip
        open={open}
        onToggle={onToggle}
        icon={null}
        label={
          <>
            {selected ? formatShiftLabel(selected.shift) : "Not attached to a shift"}
            {resolution.isFallback && <WorthACheck />}
            <ChevronDown aria-hidden="true" className="h-3 w-3 text-slate-400" />
          </>
        }
      >
        {/* Never let a recency guess read as a date match (P9). */}
        <p>
          {resolution.isFallback
            ? "No date on the page we could match — this is just your most recent shift. Pick another if that's wrong."
            : "Matched to the date written on the page."}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {resolution.candidates.map((c) => (
            <button
              key={c.shift.id}
              type="button"
              onClick={() => onSelect(c.shift.id)}
              className={`rounded-[9px] border px-2.5 py-1 text-xs ${
                c.shift.id === selectedShiftId
                  ? "border-secondary-600 bg-secondary-600 font-semibold text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-secondary-300"
              }`}
            >
              {formatShiftLabel(c.shift)}
              {c.confidence === "DATE_MATCH" && (
                <span
                  className={`ml-2 ${
                    c.shift.id === selectedShiftId ? "text-white/80" : "text-primary-700"
                  }`}
                >
                  matches the page
                </span>
              )}
            </button>
          ))}
          {selectedShiftId && (
            <button
              type="button"
              onClick={() => onSelect(undefined)}
              className="rounded-[9px] px-2.5 py-1 text-xs text-slate-400 hover:text-ink"
            >
              Don&apos;t attach to a shift
            </button>
          )}
        </div>
      </MetaChip>
    </>
  );
}
