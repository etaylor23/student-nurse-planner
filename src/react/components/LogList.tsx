import type { LogItem } from "../../domain/types";
import { groupLogItems } from "../../logic/logGroups";

/** Dot colour per action, so a log reads at a glance. */
const DOT: Record<string, string> = {
  SHIFT_CREATED: "bg-slate-300",
  SHIFT_UPDATED: "bg-slate-300",
  SHIFT_COMPLETED: "bg-emerald-400",
  SHIFT_REACTIVATED: "bg-amber-400",
  SHIFT_DELETED: "bg-rose-400",
  MEDICATION_ADDED: "bg-indigo-400",
  MED_LOGGED: "bg-sky-400",
  MEDICATION_DELETED: "bg-rose-400",
};

/** "2026-06-16T14:32:00.000Z" → "16 Jun 2026, 14:32" (local). */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * A newest-first list of audit entries, grouped by save event. Each group shows a
 * coloured dot, a header, and one line per change. `showLabel` (the global activity
 * feed) makes the header the shift's label (so you can tell which shift it was);
 * otherwise (per-shift history) the header is the timestamp.
 */
export function LogList({ items, showLabel = false }: { items: LogItem[]; showLabel?: boolean }) {
  const groups = groupLogItems(items);
  return (
    <ul className="space-y-3.5">
      {groups.map((g) => (
        <li key={g.key} className="flex gap-2.5 text-sm">
          <span
            className={
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
              (DOT[g.entries[0].action] ?? "bg-slate-300")
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium text-slate-700">
                {showLabel ? (g.entityLabel ?? "Shift") : formatTimestamp(g.at)}
              </span>
              {showLabel && (
                <span className="shrink-0 text-xs text-slate-400">{formatTimestamp(g.at)}</span>
              )}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {g.entries.map((e) => (
                <li key={e.id} className="text-slate-600">
                  {e.summary}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
