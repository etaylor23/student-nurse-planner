import { useEffect, useRef } from "react";
import { Draggable } from "@fullcalendar/interaction";
import type { Placement } from "../../domain/types";
import { Panel } from "./ui";

/**
 * The user's placements as prebuilt drag-and-drop chips. Dragging one onto the
 * calendar creates a 2-hour planned shift for it (handled by the planner's
 * `droppable`/`eventReceive`). The grid uses one column per placement up to 6, so
 * the chips fill the full width and size dynamically (4 placements → 25% each).
 */
export function PlacementPalette({ placements }: { placements: Placement[] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    // Delegates via itemSelector, so chips added/removed later stay draggable.
    const draggable = new Draggable(ref.current, {
      itemSelector: "[data-placement-id]",
      eventData: (el) => ({
        title: el.getAttribute("data-name") ?? "Shift",
        duration: "02:00",
        extendedProps: { placementId: (el as HTMLElement).dataset.placementId },
      }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <Panel
      title="Placements"
      hint="Drag one onto the calendar to plan a 2-hour shift, then tweak it"
    >
      {/* The Draggable attaches to this stable wrapper on mount and delegates to
          the chips via itemSelector, so it works even though the chips render
          after placements load asynchronously. */}
      <div ref={ref}>
        {placements.length === 0 ? (
          <p className="text-sm text-slate-400">
            No placements yet — add them on the placement hours log and they'll appear here to drag.
          </p>
        ) : (
          <div
            className="grid gap-2"
            style={{
              gridTemplateColumns: `repeat(${Math.min(placements.length, 6)}, minmax(0, 1fr))`,
            }}
          >
            {placements.map((p) => (
              <div
                key={p.id}
                data-placement-id={p.id}
                data-name={p.name}
                title={`Drag "${p.name}" onto the calendar`}
                className="flex cursor-grab items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50 active:cursor-grabbing"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-3.5 w-3.5 shrink-0 text-slate-300"
                  aria-hidden="true"
                >
                  <circle cx="9" cy="6" r="1.4" />
                  <circle cx="15" cy="6" r="1.4" />
                  <circle cx="9" cy="12" r="1.4" />
                  <circle cx="15" cy="12" r="1.4" />
                  <circle cx="9" cy="18" r="1.4" />
                  <circle cx="15" cy="18" r="1.4" />
                </svg>
                <span className="truncate">{p.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Panel>
  );
}
