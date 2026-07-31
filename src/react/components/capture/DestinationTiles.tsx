import { CalendarDays, Pill, RotateCcw, ShieldCheck } from "lucide-react";
import { NOTE_BLOCK_TARGET_LABEL, type NoteBlockTarget } from "../../../domain/types";

/**
 * Where a note goes — four tiles (spec-note-capture.md P4/P35).
 *
 * Replaces BOTH the per-card `<select>` and the four permanent lanes, which were two
 * different controls for one decision. A select hides three of the four options behind a
 * click and gives no sense of what each one produces; the lanes showed all four permanently,
 * at half the screen's width, even when every one of them was empty.
 *
 * Four tiles are the honest shape of the decision: four options, all visible, each saying
 * what it becomes, only while a note is actually being decided.
 *
 * `ORDER` is the single source of truth for icon, blurb and shortcut, and the drag drop-bar
 * renders from the same array — so the tile you dragged from and the lane you dropped onto
 * can never disagree.
 */

export const DESTINATIONS: {
  target: NoteBlockTarget;
  short: string;
  blurb: string;
  Icon: typeof Pill;
}[] = [
  { target: "REFLECTION", short: "Reflection", blurb: "A Gibbs reflection", Icon: RotateCcw },
  { target: "MED_LOG", short: "Medication log", blurb: "A medication log", Icon: Pill },
  { target: "PROFICIENCY_EVENT", short: "Proficiency", blurb: "NMC evidence", Icon: ShieldCheck },
  { target: "SHIFT_NOTES", short: "Shift notes", blurb: "Onto the shift", Icon: CalendarDays },
];

/** `1`–`4` set the destination of the focused note. Exported so the key handler agrees. */
export const DESTINATION_KEYS = DESTINATIONS.map((d) => d.target);

export function DestinationTiles({
  value,
  onChange,
  disabled = false,
}: {
  /** `""` when nothing has routed this note — an unrouted note asks rather than defaulting (P34). */
  value: NoteBlockTarget | "";
  onChange: (target: NoteBlockTarget) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="mt-6 min-w-0 border-0 p-0">
      <legend className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Where does this go?
      </legend>
      <div className="mt-2.5 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {DESTINATIONS.map(({ target, short, blurb, Icon }, i) => {
          const on = value === target;
          return (
            <button
              key={target}
              type="button"
              onClick={() => onChange(target)}
              aria-pressed={on}
              // The tile is abbreviated to fit; the full label is what gets announced.
              aria-label={NOTE_BLOCK_TARGET_LABEL[target]}
              className={`relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition-all disabled:opacity-60 ${
                on
                  ? "border-primary-600 bg-primary-50 shadow-[0_0_0_3px_rgba(4,120,87,0.12)]"
                  : "border-slate-200 bg-white hover:border-primary-300 hover:bg-primary-50/40"
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`h-[18px] w-[18px] ${on ? "text-primary-700" : "text-slate-400"}`}
              />
              <span
                className={`text-[12.5px] font-bold leading-tight ${on ? "text-primary-900" : "text-slate-700"}`}
              >
                {short}
              </span>
              <span
                className={`text-[11px] leading-tight ${on ? "text-primary-700" : "text-slate-500"}`}
              >
                {blurb}
              </span>
              {/* The shortcut is printed on the control it triggers, so the keyboard path is
                  discoverable rather than documented. */}
              <kbd
                aria-hidden="true"
                className={`absolute right-2 top-2 rounded px-1 font-sans text-[10px] font-bold ${
                  on ? "bg-primary-100 text-primary-700" : "bg-slate-100 text-slate-600"
                }`}
              >
                {i + 1}
              </kbd>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * The same four destinations as drop targets, shown ONLY while a drag is in progress.
 *
 * Lanes were right about one thing — dragging needs somewhere to drop — and wrong about
 * everything else. There is nothing to drop until you pick a note up, so there is no reason
 * for the targets to exist before then.
 */
export function DestinationDropBar({
  over,
  onOver,
  onLeave,
  onDrop,
}: {
  over?: NoteBlockTarget;
  onOver: (target: NoteBlockTarget) => void;
  onLeave: () => void;
  onDrop: (target: NoteBlockTarget) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-6 pb-6 motion-safe:animate-[pm-panel-in_220ms_ease-out_both]">
      <div className="pointer-events-auto flex gap-2 rounded-2xl bg-white/95 p-2.5 shadow-2xl ring-1 ring-slate-900/10 backdrop-blur">
        {DESTINATIONS.map(({ target, short, Icon }) => {
          const active = over === target;
          return (
            <div
              key={target}
              aria-label={`${NOTE_BLOCK_TARGET_LABEL[target]} drop target`}
              onDragOver={(e) => {
                e.preventDefault(); // without this the drop event never fires
                onOver(target);
              }}
              onDragLeave={onLeave}
              onDrop={() => onDrop(target)}
              className={`flex w-[132px] flex-col items-center gap-1.5 rounded-xl border-2 border-dashed p-3.5 transition-all ${
                active
                  ? "scale-105 border-primary-600 bg-primary-50 text-primary-800"
                  : "border-slate-300 text-slate-600"
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`h-5 w-5 ${active ? "text-primary-700" : "text-slate-400"}`}
              />
              <span className="text-xs font-semibold">{short}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
