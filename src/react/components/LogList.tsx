import type { LogItem } from "../../domain/types";

/** Dot colour per action, so a log reads at a glance. */
const DOT: Record<string, string> = {
  SHIFT_CREATED: "bg-slate-300",
  SHIFT_UPDATED: "bg-slate-300",
  SHIFT_COMPLETED: "bg-emerald-400",
  SHIFT_REACTIVATED: "bg-amber-400",
  SHIFT_DELETED: "bg-rose-400",
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

/** A newest-first list of audit entries — a coloured dot, the summary, a timestamp.
 * Shared by the per-shift history and the global activity feed. */
export function LogList({ items }: { items: LogItem[] }) {
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.id} className="flex gap-2.5 text-sm">
          <span
            className={
              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " + (DOT[it.action] ?? "bg-slate-300")
            }
          />
          <div className="min-w-0">
            <p className="text-slate-700">{it.summary}</p>
            <p className="text-xs text-slate-400">{formatTimestamp(it.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
