import { Link } from "react-router-dom";
import type { LogItem } from "../../domain/types";
import { hrefForEntity } from "../../logic/entityLinks";
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
  PROFICIENCY_STATUS_CHANGED: "bg-emerald-400",
  EVIDENCE_LINKED: "bg-sky-400",
  EVIDENCE_UNLINKED: "bg-rose-400",
  PROFILE_UPDATED: "bg-slate-300",
  SKILL_STAGE_CHANGED: "bg-amber-400",
  SKILL_SIGNED_OFF: "bg-emerald-400",
  SKILL_ADDED: "bg-indigo-400",
  SKILL_DELETED: "bg-rose-400",
  REFLECTION_CREATED: "bg-violet-400",
  REFLECTION_UPDATED: "bg-slate-300",
  REFLECTION_DELETED: "bg-rose-400",
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
      {groups.map((g) => {
        // In the global feed the header is the entity's label and, where the entity
        // has a route, links to it — turning "what was I doing?" into navigation.
        const href = showLabel ? hrefForEntity(g.entityType, g.entityId) : null;
        return (
          <li key={g.key} className="flex gap-2.5 text-sm">
            <span
              className={
                "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
                (DOT[g.entries[0].action] ?? "bg-slate-300")
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                {href ? (
                  <Link
                    to={href}
                    className="group inline-flex min-w-0 items-baseline gap-1 font-medium text-slate-700 transition hover:text-emerald-700"
                  >
                    <span className="truncate group-hover:underline">
                      {g.entityLabel ?? "Activity"}
                    </span>
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-slate-400 transition group-hover:text-emerald-600"
                    >
                      →
                    </span>
                  </Link>
                ) : (
                  <span className="truncate font-medium text-slate-700">
                    {showLabel ? (g.entityLabel ?? "Activity") : formatTimestamp(g.at)}
                  </span>
                )}
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
        );
      })}
    </ul>
  );
}
