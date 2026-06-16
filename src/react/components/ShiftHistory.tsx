import { useEffect, useState } from "react";
import type { LogItem, Shift } from "../../domain/types";
import { useRepository } from "../RepositoryContext";

/** Dot colour per action, so the history reads at a glance. */
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

/**
 * A single shift's audit history (newest first), in the style of Jira's issue
 * history. Refetches whenever the shift is mutated — `updatedAt` bumps on every
 * action — so a freshly logged entry appears without closing the editor.
 */
export function ShiftHistory({ shift }: { shift: Shift }) {
  const { repo, user } = useRepository();
  const [items, setItems] = useState<LogItem[]>([]);

  useEffect(() => {
    let active = true;
    if (!user) return;
    void repo.listLogItems(user.id, { entityType: "SHIFT", entityId: shift.id }).then((rows) => {
      if (active) setItems(rows);
    });
    return () => {
      active = false;
    };
  }, [repo, user, shift.id, shift.updatedAt]);

  if (items.length === 0) return null;

  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">History</p>
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
    </div>
  );
}
