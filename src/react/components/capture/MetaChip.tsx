import { useId } from "react";

/**
 * A quiet chip in the review meta strip whose detail expands full-width below it.
 *
 * Three things used to arrive as stacked full-width banners before the student had seen a
 * single note: the cached-parse notice (P41), the spell-check corrections (P24), and the
 * shift attachment (P9). All three are true, none of them is the first thing to do, and
 * together they pushed the actual work below the fold.
 *
 * So each becomes a chip that STATES the fact in three words and holds the detail one click
 * away. The fact is never hidden — "Read earlier today" and "1 spelling fixed" say the whole
 * thing — but the explanation, and the undo, are opt-in.
 *
 * The parent owns `open` and closes the others, so only one panel is ever expanded. The panel
 * is a sibling flex line rather than a popover: it can be as tall as it likes, it never
 * covers the notes, and it doesn't need focus trapping.
 */
export function MetaChip({
  icon,
  label,
  open,
  onToggle,
  children,
  align = "start",
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  /** `end` pushes the chip to the right of the strip — used by the shift chip. */
  align?: "start" | "end";
}) {
  const panelId = useId();

  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          align === "end" ? "ml-auto" : ""
        } ${
          open
            ? "bg-ink text-white"
            : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-ink hover:ring-slate-300"
        }`}
      >
        {icon}
        {label}
      </button>
      {open && (
        <div
          id={panelId}
          // `order-last` keeps the chips together on one line: the panel is a sibling flex item,
          // so without it an open panel lands between its own chip and the next one and breaks
          // the strip into three lines.
          className="order-last w-full rounded-lg bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200 motion-safe:animate-[pm-panel-in_220ms_ease-out_both]"
        >
          {children}
        </div>
      )}
    </>
  );
}
